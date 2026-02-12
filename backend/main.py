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
import time
import concurrent.futures

from datetime import timedelta
from collections import deque
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import re

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
# Rate limiting middleware (simple in-memory, per pod)
# ------------------------------------------------------------------

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api/"):
        return await call_next(request)

    if RATE_LIMIT_RPM <= 0:
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    now = time.time()

    async with _rate_lock:
        bucket = _rate_buckets.get(client_ip)
        if bucket is None:
            bucket = deque()
            _rate_buckets[client_ip] = bucket

        cutoff = now - RATE_LIMIT_WINDOW_SEC
        while bucket and bucket[0] < cutoff:
            bucket.popleft()

        if len(bucket) >= RATE_LIMIT_RPM:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"},
            )

        bucket.append(now)

    return await call_next(request)

# ------------------------------------------------------------------
# Global limits
# ------------------------------------------------------------------

# Concurrency controls (per pod)
TRANSCRIBE_CONCURRENCY = int(os.getenv("TRANSCRIBE_CONCURRENCY", "1"))
TRANSCRIBE_SEMAPHORE = asyncio.Semaphore(TRANSCRIBE_CONCURRENCY)

# Simple per-pod rate limiting (requests per minute)
RATE_LIMIT_RPM = int(os.getenv("RATE_LIMIT_RPM", "120"))
RATE_LIMIT_WINDOW_SEC = 60
_rate_lock = asyncio.Lock()
_rate_buckets: dict[str, deque] = {}

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------

MODEL_CONFIG_PATH = os.getenv("MODEL_CONFIG_PATH", "/app/data/model_settings.json")

MAX_SINGLE_CHUNK_SEC = 30
DEFAULT_CHUNK_SEC = 15
DEFAULT_OVERLAP_SEC = 1.0

CHUNKS_DIR = "/tmp/tts_chunks"

settings = {
    "whisper_url": "",
    "whisper_token": "",
    "whisper_model": "whisper-large-v3",
    "summarizer_url": "",
    "summarizer_token": "",
    "summarizer_model": "",
<<<<<<< HEAD
<<<<<<< HEAD
    "diarization_url": "",
    "diarization_token": "",
    "diarization_model": "",
=======
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
=======
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
}

DIARIZATION_CONCURRENCY = int(os.getenv("DIARIZATION_CONCURRENCY", "2"))

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
<<<<<<< HEAD
<<<<<<< HEAD
    diarization_url: str = ""
    diarization_token: str = ""
    diarization_model: str = ""
=======
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
=======
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)


class SummarizeRequest(BaseModel):
    transcript: str
    prompt: Optional[str] = ""
    style: str = "concise"
    length: str = "short"
    language: Optional[str] = ""

class CleanTranscriptRequest(BaseModel):
    transcript: str

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
<<<<<<< HEAD
<<<<<<< HEAD
                "diarization_url": data.get("DIARIZATION_API_URL", ""),
                "diarization_token": data.get("DIARIZATION_API_TOKEN", ""),
                "diarization_model": data.get("DIARIZATION_MODEL_NAME", ""),
=======
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
=======
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
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
<<<<<<< HEAD
<<<<<<< HEAD
            "DIARIZATION_API_URL": settings["diarization_url"],
            "DIARIZATION_API_TOKEN": settings["diarization_token"],
            "DIARIZATION_MODEL_NAME": settings["diarization_model"],
=======
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
=======
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
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

    data = {"model": model, "task": "transcribe"}
    if language:
        data["language"] = language

    with open(chunk_path, "rb") as f:
        resp = requests.post(
            url,
            headers=headers,
            files={"file": (os.path.basename(chunk_path), f, "audio/wav")},
            data=data,
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
# Diarization helpers
# ------------------------------------------------------------------

def call_diarization(wav_path: str):
    if not settings["diarization_url"]:
        raise RuntimeError("Diarization endpoint not configured")

    headers = {}
    if settings["diarization_token"]:
        headers["Authorization"] = f"Bearer {settings['diarization_token']}"

    data = {}
    if settings["diarization_model"]:
        data["model"] = settings["diarization_model"]

    with open(wav_path, "rb") as f:
        resp = requests.post(
            settings["diarization_url"],
            headers=headers,
            files={"upload_file": f},
            data=data or None,
            timeout=180,
            verify=False,
        )

    if not resp.ok:
        raise RuntimeError(f"Diarization error {resp.status_code}: {resp.text[:300]}")

    j = resp.json()
    if not j.get("success"):
        raise RuntimeError("Diarization response not successful")
    return j.get("segments") or []

def dominant_speaker(segments: list[dict]) -> str | None:
    if not segments:
        return None
    totals: dict[str, float] = {}
    for seg in segments:
        spk = seg.get("speaker")
        if not spk:
            continue
        dur = float(seg.get("duration") or 0.0)
        totals[spk] = totals.get(spk, 0.0) + dur
    if not totals:
        return None
    return max(totals.items(), key=lambda kv: kv[1])[0]

def _format_ts(seconds: int) -> str:
    return str(timedelta(seconds=seconds))

def apply_diarization_to_transcript(transcript: str, segments: list[dict]) -> str:
    if not segments:
        return transcript

    ts_line_re = re.compile(r"^\[(\d+):(\d+):(\d+)\]\s*(.*)$")

    # Map speaker ids to human labels in order of first appearance
    speaker_map: dict[str, str] = {}
    def map_speaker(s: str) -> str:
        if s not in speaker_map:
            speaker_map[s] = f"Speaker {len(speaker_map) + 1}"
        return speaker_map[s]

    def speaker_at_time(t: int) -> str | None:
        for seg in segments:
            if seg["start_time"] <= t <= seg["end_time"]:
                return map_speaker(seg.get("speaker", "Speaker"))
        return None

    out_lines = []
    last_speaker = None
    for line in transcript.splitlines():
        m = ts_line_re.match(line)
        if not m:
            out_lines.append(line)
            continue
        hh, mm, ss, text = m.groups()
        t = int(hh) * 3600 + int(mm) * 60 + int(ss)
        spk = speaker_at_time(t) or last_speaker
        if spk:
            label = f"{spk} [{_format_ts(t)}] "
            out_lines.append(label + text.strip())
            last_speaker = spk
        else:
            out_lines.append(line)

    return "\n".join(out_lines)

# ------------------------------------------------------------------
# SSE helpers
# ------------------------------------------------------------------

def sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"

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
<<<<<<< HEAD
<<<<<<< HEAD
        "diarization_url": settings["diarization_url"],
        "diarization_token": "***" if settings["diarization_token"] else "",
        "diarization_model": settings["diarization_model"],
=======
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
=======
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
    }

@app.post("/api/settings")
async def update_settings(new: ModelSettings):
    settings.update(new.dict())
    save_settings()
    logger.info("Model settings updated")
    return {"status": "ok"}

@app.post("/api/transcribe")
async def transcribe(
    request: Request,
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    diarization: Optional[bool] = Form(None),
):
    if not settings["whisper_url"]:
        raise HTTPException(400, "Whisper endpoint not configured")

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            total_bytes = int(content_length)
<<<<<<< HEAD
<<<<<<< HEAD
            _ = total_bytes
=======
            if total_bytes > MAX_UPLOAD_MB * 1024 * 1024:
                raise HTTPException(413, f"Upload too large (max {MAX_UPLOAD_MB} MB)")
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
=======
            if total_bytes > MAX_UPLOAD_MB * 1024 * 1024:
                raise HTTPException(413, f"Upload too large (max {MAX_UPLOAD_MB} MB)")
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
        except ValueError:
            pass

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

            used_chunk_diarization = False
            if duration > MAX_SINGLE_CHUNK_SEC:
                results = []
                speaker_map: dict[str, str] = {}
                def map_speaker_id(s: str) -> str:
                    if s not in speaker_map:
                        speaker_map[s] = f"Speaker {len(speaker_map) + 1}"
                    return speaker_map[s]
                diar_futures: dict[str, concurrent.futures.Future] = {}
                executor = None
                for chunk, start, _ in split_wav_to_chunks(wav_path):
                    if diarization and settings["diarization_url"]:
                        if executor is None:
                            executor = concurrent.futures.ThreadPoolExecutor(max_workers=DIARIZATION_CONCURRENCY)
                        diar_futures[chunk] = executor.submit(call_diarization, chunk)

                    text = transcribe_chunk(
                        chunk,
                        settings["whisper_url"],
                        settings["whisper_token"],
                        settings["whisper_model"],
                        language,
                    )
                    ts = str(timedelta(seconds=int(start)))
                    line = f"[{ts}] {text.strip()}"

                    if diarization and settings["diarization_url"] and chunk in diar_futures:
                        try:
                            segments = diar_futures[chunk].result()
                            spk_id = dominant_speaker(segments)
                            if spk_id:
                                spk_label = map_speaker_id(spk_id)
                                line = f"{spk_label} [{ts}] {text.strip()}"
                                used_chunk_diarization = True
                        except Exception:
                            logger.exception("Diarization failed on chunk; skipping speakers")

                    results.append(line)
                    os.remove(chunk)
                if executor:
                    executor.shutdown(wait=False)

                transcript = "\n".join(results)
            else:
                transcript = transcribe_chunk(
                    wav_path,
                    settings["whisper_url"],
                    settings["whisper_token"],
                    settings["whisper_model"],
                    language,
                )

            if diarization and not used_chunk_diarization:
                if not settings["diarization_url"]:
                    logger.warning("Diarization requested but not configured; skipping")
                else:
                    try:
                        segments = call_diarization(wav_path)
                        transcript = apply_diarization_to_transcript(transcript, segments)
                    except Exception:
                        logger.exception("Diarization failed; returning transcript without speakers")

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

@app.post("/api/transcribe/stream")
async def transcribe_stream(
    request: Request,
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    diarization: Optional[bool] = Form(None),
):
    if not settings["whisper_url"]:
        raise HTTPException(400, "Whisper endpoint not configured")

    tmp_path = None
    try:
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
    except Exception:
        logger.exception("Failed to read uploaded file for streaming")
        raise HTTPException(500, "Failed to read uploaded file")
    finally:
        try:
            file.file.close()
        except Exception:
            pass

    async def event_gen(tmp_path: str):
        async with TRANSCRIBE_SEMAPHORE:
            logger.info(f"New transcription stream: {file.filename}")
            log_mem("start")

            wav_path = None

            try:
                wav_path = tmp_path + ".wav"
                ffmpeg_convert_to_wav(tmp_path, wav_path)
                duration = get_duration_seconds(wav_path)

                yield sse_event("start", {"duration": duration})

                results = []
                speaker_map: dict[str, str] = {}
                def map_speaker_id(s: str) -> str:
                    if s not in speaker_map:
                        speaker_map[s] = f"Speaker {len(speaker_map) + 1}"
                    return speaker_map[s]
                if duration > MAX_SINGLE_CHUNK_SEC:
                    chunks = split_wav_to_chunks(wav_path)
                    total = len(chunks)

                    diar_futures: dict[str, concurrent.futures.Future] = {}
                    executor = None
                    if diarization and settings["diarization_url"]:
                        executor = concurrent.futures.ThreadPoolExecutor(max_workers=DIARIZATION_CONCURRENCY)
                        for (chunk, _, _) in chunks:
                            diar_futures[chunk] = executor.submit(call_diarization, chunk)

                    try:
                        for idx, (chunk, start, _) in enumerate(chunks, start=1):
                            text = transcribe_chunk(
                                chunk,
                                settings["whisper_url"],
                                settings["whisper_token"],
                                settings["whisper_model"],
                                language,
                            )
                            ts = str(timedelta(seconds=int(start)))
                            piece = f"[{ts}] {text.strip()}"

                            if diarization and settings["diarization_url"] and chunk in diar_futures:
                                try:
                                    segments = diar_futures[chunk].result()
                                    spk_id = dominant_speaker(segments)
                                    if spk_id:
                                        spk_label = map_speaker_id(spk_id)
                                        piece = f"{spk_label} [{ts}] {text.strip()}"
                                except Exception:
                                    logger.exception("Diarization failed on chunk; skipping speakers")

                            results.append(piece)
                            yield sse_event("chunk", {"index": idx, "total": total, "text": piece})
                            os.remove(chunk)
                    finally:
                        if executor:
                            executor.shutdown(wait=False)
                else:
                    text = transcribe_chunk(
                        wav_path,
                        settings["whisper_url"],
                        settings["whisper_token"],
                        settings["whisper_model"],
                        language,
                    )
                    results.append(text)
                    yield sse_event("chunk", {"index": 1, "total": 1, "text": text})

                transcript = "\n".join(results)
                yield sse_event("complete", {"transcript": transcript, "duration": duration})
                logger.info("Transcription stream completed successfully")
                log_mem("end")

            except Exception as e:
                logger.exception("Transcription stream failed")
                yield sse_event("error", {"message": str(e)})

            finally:
                for p in (tmp_path, wav_path):
                    if p and os.path.exists(p):
                        os.remove(p)

    return StreamingResponse(
        event_gen(tmp_path),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )

@app.post("/api/summarize")
async def summarize(req: SummarizeRequest):
    if not settings["summarizer_url"]:
        raise HTTPException(400, "Summarizer endpoint not configured")

    logger.info("Summarization request received")

    # Build a safer, format-aware prompt to reduce hallucinations
    style = (req.style or "concise").strip().lower()
    length = (req.length or "short").strip().lower()
    lang = (req.language or "").strip().lower()

    lang_map = {
        "en": "English",
        "fr": "French",
        "de": "German",
        "es": "Spanish",
        "it": "Italian",
        "nl": "Dutch",
        "pt": "Portuguese",
        "pl": "Polish",
        "sv": "Swedish",
        "da": "Danish",
        "no": "Norwegian",
        "fi": "Finnish",
    }
    language_name = lang_map.get(lang, "")
    if not language_name and lang:
        language_name = lang
    if not language_name:
        language_name = "the same language as the transcript"

    length_guidance = {
        "short": "Keep it short (around 3-6 sentences).",
        "medium": "Keep it medium length (roughly 8-12 sentences).",
        "long": "Provide a longer summary (multiple paragraphs if needed).",
    }.get(length, "Keep it concise.")

    if style == "bullet_points":
        format_guidance = "Output only a bullet list. Use '-' for each bullet."
    elif style == "action_items":
        format_guidance = (
            "Output only action items as bullets. For each item, include owner if present; "
            "if owner is not stated, write 'Owner: Not specified'."
        )
    elif style == "detailed":
        format_guidance = "Write a detailed multi-paragraph summary."
    else:
        format_guidance = "Write a concise paragraph summary."

    extra_instructions = ""
    if req.prompt:
        extra_instructions = (
            "\nAdditional user preferences (use to enrich the summary if consistent; "
            "do not override the required format, length, or language): "
            f"{req.prompt}"
        )

    system_prompt = (
        "You summarize transcripts. Use only the provided transcript and do not add facts. "
        "If something is missing or uncertain, say 'Not specified'. "
        f"Write the summary in {language_name}. "
        f"{format_guidance} {length_guidance}"
        f"{extra_instructions}"
    )

    headers = {"Content-Type": "application/json"}
    if settings["summarizer_token"]:
        headers["Authorization"] = f"Bearer {settings['summarizer_token']}"

    payload = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.transcript},
        ],
        "temperature": 0.2,
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

@app.post("/api/clean_transcript")
async def clean_transcript(req: CleanTranscriptRequest):
    if not settings["summarizer_url"]:
        raise HTTPException(400, "Summarizer endpoint not configured")

    logger.info("Transcript cleanup request received")

    headers = {"Content-Type": "application/json"}
    if settings["summarizer_token"]:
        headers["Authorization"] = f"Bearer {settings['summarizer_token']}"

    system_prompt = (
        "Clean up this transcript for readability. Fix punctuation, casing, and obvious typos. "
        "Remove filler words and stutters when safe, but do not remove meaning. "
        "Do not add facts or content that is not present. Do not translate. "
        "If timestamps like [00:01:23] are present, preserve them."
    )

    payload = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.transcript},
        ],
        "temperature": 0.2,
    }

    cleanup_timeout = float(os.getenv("CLEANUP_TIMEOUT_SEC", "180"))
    cleanup_retries = int(os.getenv("CLEANUP_RETRIES", "2"))
    cleanup_backoff = float(os.getenv("CLEANUP_RETRY_BACKOFF_SEC", "1.5"))

    last_error: str | None = None
    for attempt in range(1, cleanup_retries + 2):
        try:
            resp = requests.post(
                settings["summarizer_url"],
                headers=headers,
                json=payload,
                timeout=cleanup_timeout,
                verify=False,
            )
        except Exception as e:
            last_error = f"request_error: {type(e).__name__}: {e}"
            logger.warning(f"Cleanup request failed (attempt {attempt}): {last_error}")
            if attempt <= cleanup_retries:
                time.sleep(cleanup_backoff * attempt)
                continue
            raise HTTPException(502, f"Cleanup request failed: {last_error}")

        if not resp.ok:
            last_error = f"upstream_status={resp.status_code}, body={resp.text[:300]}"
            logger.warning(f"Cleanup upstream error (attempt {attempt}): {last_error}")
            if attempt <= cleanup_retries:
                time.sleep(cleanup_backoff * attempt)
                continue
            raise HTTPException(resp.status_code, f"Cleanup failed: {last_error}")

        j = resp.json()
        cleaned = (
            j.get("cleaned")
            or j.get("result")
            or j.get("text")
            or j.get("choices", [{}])[0].get("message", {}).get("content", "")
        )

        if not cleaned:
            last_error = "empty_response_from_cleanup_model"
            logger.warning(f"Cleanup returned empty text (attempt {attempt})")
            if attempt <= cleanup_retries:
                time.sleep(cleanup_backoff * attempt)
                continue
            raise HTTPException(502, "Cleanup failed: empty response")

        logger.info("Transcript cleanup completed")
        return {"transcript": cleaned}

    raise HTTPException(502, f"Cleanup failed: {last_error or 'unknown_error'}")
