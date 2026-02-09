"""
Backend API for Scribe - Transcription & Summarization
Stabilized, observable & Kubernetes-friendly
"""

import os
import json
import shutil
import requests
import tempfile
import subprocess
import asyncio
import logging
import sys
import psutil

from datetime import timedelta
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ------------------------------------------------------------------
# Logging (CRITICAL FOR K8S)
# ------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger("scribe-backend")

def log_mem(stage: str):
    p = psutil.Process(os.getpid())
    mem = p.memory_info().rss / 1024 / 1024
    logger.info(f"[mem] {stage}: {mem:.1f} MB")

# ------------------------------------------------------------------
# App & middleware
# ------------------------------------------------------------------

app = FastAPI(title="Scribe API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten for prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------
# Global limits
# ------------------------------------------------------------------

# ONE transcription at a time per pod (prevents OOM storms)
TRANSCRIBE_SEMAPHORE = asyncio.Semaphore(1)

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------

MODEL_CONFIG_PATH = os.getenv("MODEL_CONFIG_PATH", "/app/data/model_settings.json")

MAX_SINGLE_CHUNK_SEC = 30
DEFAULT_CHUNK_SEC = 25
DEFAULT_OVERLAP_SEC = 1.0

CHUNKS_DIR = "/tmp/tts_chunks"

settings = {
    "whisper_url": "",
    "whisper_token": "",
    "whisper_model": "whisper-large-v3",
    "summarizer_url": "",
    "summarizer_token": "",
    "summarizer_model": "",
}

# ------------------------------------------------------------------
# Models
# ------------------------------------------------------------------

class ModelSettings(BaseModel):
    whisper_url: str = ""
    whisper_token: str = ""
    whisper_model: str = "whisper-large-v3"
    summarizer_url: str = ""
    summarizer_token: str = ""
    summarizer_model: str = ""


class SummarizeRequest(BaseModel):
    transcript: str
    prompt: Optional[str] = ""
    style: str = "concise"
    length: str = "short"

# ------------------------------------------------------------------
# Settings helpers
# ------------------------------------------------------------------

def load_settings():
    if os.path.exists(MODEL_CONFIG_PATH):
        logger.info(f"Loading model settings from {MODEL_CONFIG_PATH}")
        with open(MODEL_CONFIG_PATH, "r") as f:
            data = json.load(f)
            settings.update({
                "whisper_url": data.get("WHISPER_API_URL", ""),
                "whisper_token": data.get("WHISPER_API_TOKEN", ""),
                "whisper_model": data.get("WHISPER_MODEL_NAME", "whisper-large-v3"),
                "summarizer_url": data.get("SUMMARIZER_API_URL", ""),
                "summarizer_token": data.get("SUMMARIZER_API_TOKEN", ""),
                "summarizer_model": data.get("SUMMARIZER_MODEL_NAME", ""),
            })
    else:
        logger.warning("No model settings file found (using defaults)")

def save_settings():
    os.makedirs(os.path.dirname(MODEL_CONFIG_PATH), exist_ok=True)
    with open(MODEL_CONFIG_PATH, "w") as f:
        json.dump({
            "WHISPER_API_URL": settings["whisper_url"],
            "WHISPER_API_TOKEN": settings["whisper_token"],
            "WHISPER_MODEL_NAME": settings["whisper_model"],
            "SUMMARIZER_API_URL": settings["summarizer_url"],
            "SUMMARIZER_API_TOKEN": settings["summarizer_token"],
            "SUMMARIZER_MODEL_NAME": settings["summarizer_model"],
        }, f, indent=2)

load_settings()

# ------------------------------------------------------------------
# FFmpeg helpers (logged & safe)
# ------------------------------------------------------------------

def run_cmd(cmd: list[str], desc: str):
    logger.info(f"Running: {desc}")
    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.stdout:
        logger.debug(f"{desc} stdout:\n{result.stdout}")
    if result.stderr:
        logger.info(f"{desc} stderr:\n{result.stderr}")

    if result.returncode != 0:
        raise RuntimeError(f"{desc} failed (code {result.returncode})")

def ffmpeg_convert_to_wav(input_path: str, out_path: str, sample_rate: int = 16000):
    run_cmd([
        "ffmpeg", "-y",
        "-hide_banner", "-loglevel", "error",
        "-vn",
        "-i", input_path,
        "-map_metadata", "-1",
        "-ac", "1",
        "-ar", str(sample_rate),
        "-f", "wav",
        out_path
    ], "ffmpeg convert to wav")

def get_duration_seconds(path: str) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path
    ]).decode().strip()
    try:
        return float(out)
    except ValueError:
        return 0.0

def split_wav_to_chunks(wav_path: str):
    shutil.rmtree(CHUNKS_DIR, ignore_errors=True)
    os.makedirs(CHUNKS_DIR, exist_ok=True)

    total_sec = get_duration_seconds(wav_path)
    if total_sec <= 0:
        raise RuntimeError("Invalid audio duration")

    logger.info(f"Audio duration: {total_sec:.2f}s → chunking")
    log_mem("before chunking")

    step = DEFAULT_CHUNK_SEC - DEFAULT_OVERLAP_SEC
    start = 0.0
    idx = 0
    chunks = []

    while start < total_sec:
        out = os.path.join(CHUNKS_DIR, f"chunk_{idx:05d}.wav")
        run_cmd([
            "ffmpeg", "-y",
            "-hide_banner", "-loglevel", "error",
            "-ss", str(start),
            "-i", wav_path,
            "-t", str(DEFAULT_CHUNK_SEC),
            "-ac", "1", "-ar", "16000",
            out
        ], f"ffmpeg split chunk {idx}")

        end = min(start + DEFAULT_CHUNK_SEC, total_sec)
        chunks.append((out, start, end))
        start += step
        idx += 1

    logger.info(f"Created {len(chunks)} chunks")
    log_mem("after chunking")

    return chunks

# ------------------------------------------------------------------
# Whisper call
# ------------------------------------------------------------------

def transcribe_chunk(chunk_path: str, url: str, token: str, model: str, language: Optional[str]):
    logger.info(f"Transcribing chunk {os.path.basename(chunk_path)}")
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    with open(chunk_path, "rb") as f:
        resp = requests.post(
            url,
            headers=headers,
            files={"file": (os.path.basename(chunk_path), f, "audio/wav")},
            data={"model": model, "language": language} if language else {"model": model},
            timeout=120,
            verify=False
        )

    if not resp.ok:
        raise RuntimeError(f"Whisper error {resp.status_code}: {resp.text[:300]}")

    j = resp.json()
    if "segments" in j:
        return "\n".join(seg.get("text", "") for seg in j["segments"])
    return j.get("text") or j.get("result") or ""

# ------------------------------------------------------------------
# API endpoints
# ------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/api/settings")
async def get_settings():
    return {
        "whisper_url": settings["whisper_url"],
        "whisper_token": "***" if settings["whisper_token"] else "",
        "whisper_model": settings["whisper_model"],
        "summarizer_url": settings["summarizer_url"],
        "summarizer_token": "***" if settings["summarizer_token"] else "",
        "summarizer_model": settings["summarizer_model"],
    }

@app.post("/api/settings")
async def update_settings(new: ModelSettings):
    settings.update(new.dict())
    save_settings()
    logger.info("Model settings updated")
    return {"status": "ok"}

@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
):
    if not settings["whisper_url"]:
        raise HTTPException(400, "Whisper endpoint not configured")

    async with TRANSCRIBE_SEMAPHORE:
        logger.info(f"New transcription request: {file.filename}")
        log_mem("start")

        tmp_path = None
        wav_path = None

        try:
            suffix = os.path.splitext(file.filename)[1]
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                shutil.copyfileobj(file.file, tmp)
                tmp_path = tmp.name

            wav_path = tmp_path + ".wav"
            ffmpeg_convert_to_wav(tmp_path, wav_path)
            duration = get_duration_seconds(wav_path)

            logger.info(f"Converted to WAV, duration={duration:.2f}s")
            log_mem("after convert")

            if duration > MAX_SINGLE_CHUNK_SEC:
                results = []
                for chunk, start, _ in split_wav_to_chunks(wav_path):
                    text = transcribe_chunk(
                        chunk,
                        settings["whisper_url"],
                        settings["whisper_token"],
                        settings["whisper_model"],
                        language,
                    )
                    ts = str(timedelta(seconds=int(start)))
                    results.append(f"[{ts}] {text.strip()}")
                    os.remove(chunk)

                transcript = "\n".join(results)
            else:
                transcript = transcribe_chunk(
                    wav_path,
                    settings["whisper_url"],
                    settings["whisper_token"],
                    settings["whisper_model"],
                    language,
                )

            logger.info("Transcription completed successfully")
            log_mem("end")

            return {"transcript": transcript, "duration": duration}

        except Exception:
            logger.exception("Transcription failed")
            raise HTTPException(500, "Transcription failed")

        finally:
            for p in (tmp_path, wav_path):
                if p and os.path.exists(p):
                    os.remove(p)

@app.post("/api/summarize")
async def summarize(req: SummarizeRequest):
    if not settings["summarizer_url"]:
        raise HTTPException(400, "Summarizer endpoint not configured")

    logger.info("Summarization request received")

    headers = {"Content-Type": "application/json"}
    if settings["summarizer_token"]:
        headers["Authorization"] = f"Bearer {settings['summarizer_token']}"

    payload = {
        "messages": [
            {"role": "system", "content": "Summarize the following transcript."},
            {"role": "user", "content": req.transcript},
        ]
    }

    resp = requests.post(
        settings["summarizer_url"],
        headers=headers,
        json=payload,
        timeout=120,
        verify=False,
    )

    if not resp.ok:
        logger.error(f"Summarizer error: {resp.text[:300]}")
        raise HTTPException(resp.status_code, resp.text[:300])

    j = resp.json()
    summary = (
        j.get("summary")
        or j.get("result")
        or j.get("text")
        or j.get("choices", [{}])[0].get("message", {}).get("content", "")
    )

    logger.info("Summarization completed")
    return {"summary": summary}
