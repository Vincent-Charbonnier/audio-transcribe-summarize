"""
Backend API for Scribe - Transcription & Summarization
Adapted from app_BKP.py for containerized deployment
"""
import os
import json
import requests
import tempfile
import subprocess
import time
from datetime import datetime, timedelta
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Scribe API", version="1.0.0")

# CORS - allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model configuration
MODEL_CONFIG_PATH = os.getenv("MODEL_CONFIG_PATH", "/app/data/model_settings.json")

# Runtime settings
settings = {
    "whisper_url": "",
    "whisper_token": "",
    "whisper_model": "whisper-large-v3",
    "summarizer_url": "",
    "summarizer_token": "",
    "summarizer_model": "",
}

# Constants for chunked transcription
MAX_SINGLE_CHUNK_SEC = 30
DEFAULT_CHUNK_SEC = 25
DEFAULT_OVERLAP_SEC = 1.0
CHUNKS_DIR = "/tmp/tts_chunks"


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


def load_settings():
    """Load settings from JSON file"""
    global settings
    if os.path.exists(MODEL_CONFIG_PATH):
        try:
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
        except Exception as e:
            print(f"Error loading settings: {e}")


def save_settings():
    """Save settings to JSON file"""
    os.makedirs(os.path.dirname(MODEL_CONFIG_PATH), exist_ok=True)
    data = {
        "WHISPER_API_URL": settings["whisper_url"],
        "WHISPER_API_TOKEN": settings["whisper_token"],
        "WHISPER_MODEL_NAME": settings["whisper_model"],
        "SUMMARIZER_API_URL": settings["summarizer_url"],
        "SUMMARIZER_API_TOKEN": settings["summarizer_token"],
        "SUMMARIZER_MODEL_NAME": settings["summarizer_model"],
    }
    with open(MODEL_CONFIG_PATH, "w") as f:
        json.dump(data, f, indent=2)


# Load settings on startup
load_settings()


def ffmpeg_convert_to_wav(input_path: str, out_path: str, sample_rate: int = 16000):
    """Convert audio/video to WAV format"""
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", input_path,
        "-ac", "1", "-ar", str(sample_rate),
        "-f", "wav", out_path
    ]
    subprocess.check_call(cmd)


def get_duration_seconds(path: str) -> float:
    """Get audio duration in seconds"""
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", path
    ]
    out = subprocess.check_output(cmd).decode().strip()
    try:
        return float(out)
    except:
        return 0.0


def split_wav_to_chunks(wav_path: str, chunk_length: float = DEFAULT_CHUNK_SEC, overlap: float = DEFAULT_OVERLAP_SEC):
    """Split audio into chunks for processing"""
    total_sec = get_duration_seconds(wav_path)
    if total_sec <= 0:
        raise RuntimeError("Could not determine audio duration.")
    
    step = chunk_length - overlap
    os.makedirs(CHUNKS_DIR, exist_ok=True)
    chunk_paths = []
    idx = 0
    start = 0.0
    
    while start < total_sec:
        out = os.path.join(CHUNKS_DIR, f"chunk_{idx:05d}.wav")
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-ss", str(start),
            "-i", wav_path,
            "-t", str(chunk_length),
            "-ac", "1", "-ar", "16000",
            "-f", "wav", out
        ]
        subprocess.check_call(cmd)
        end = min(start + chunk_length, total_sec)
        chunk_paths.append((out, start, end))
        idx += 1
        start += step
    
    return chunk_paths


def transcribe_chunk(chunk_path: str, url: str, token: str, model: str, language: str = None):
    """Transcribe a single audio chunk"""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    with open(chunk_path, "rb") as f:
        files = {"file": (os.path.basename(chunk_path), f, "audio/wav")}
        data = {
            "task": "transcribe"  # Keep original language, don't translate to English
        }
        if model:
            data["model"] = model
        if language:
            data["language"] = language
        
        resp = requests.post(url, headers=headers, files=files, data=data, timeout=120, verify=False)
    
    if resp.ok:
        try:
            j = resp.json()
            if isinstance(j, dict) and "segments" in j:
                lines = [f"[{seg.get('speaker', 'Speaker')}] {seg.get('text', '')}" for seg in j["segments"]]
                return "\n".join(lines), j
            return j.get("transcription") or j.get("text") or j.get("result") or "", j
        except:
            return resp.text, {"raw": resp.text}
    
    raise RuntimeError(f"Transcription failed: {resp.status_code} {resp.text[:400]}")


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}


@app.get("/api/settings")
async def get_settings():
    """Get current model settings (tokens masked)"""
    return {
        "whisper_url": settings["whisper_url"],
        "whisper_token": "***" if settings["whisper_token"] else "",
        "whisper_model": settings["whisper_model"],
        "summarizer_url": settings["summarizer_url"],
        "summarizer_token": "***" if settings["summarizer_token"] else "",
        "summarizer_model": settings["summarizer_model"],
    }


@app.post("/api/settings")
async def update_settings(new_settings: ModelSettings):
    """Update model settings"""
    global settings
    settings["whisper_url"] = new_settings.whisper_url
    settings["whisper_token"] = new_settings.whisper_token
    settings["whisper_model"] = new_settings.whisper_model
    settings["summarizer_url"] = new_settings.summarizer_url
    settings["summarizer_token"] = new_settings.summarizer_token
    settings["summarizer_model"] = new_settings.summarizer_model
    save_settings()
    return {"status": "ok", "message": "Settings saved"}


@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    diarization: bool = Form(False),
):
    """Transcribe audio/video file"""
    if not settings["whisper_url"]:
        raise HTTPException(status_code=400, detail="Transcription endpoint not configured")
    
    # Get file extension, default to .webm for recordings without extension
    filename = file.filename or "audio.webm"
    ext = os.path.splitext(filename)[1]
    if not ext:
        # Detect from content type
        content_type = file.content_type or ""
        if "webm" in content_type:
            ext = ".webm"
        elif "mp4" in content_type or "video" in content_type:
            ext = ".mp4"
        elif "wav" in content_type:
            ext = ".wav"
        elif "mp3" in content_type or "mpeg" in content_type:
            ext = ".mp3"
        else:
            ext = ".webm"  # Default for browser recordings
    
    # Save uploaded file
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    print(f"[DEBUG] Saved file: {tmp_path}, size: {len(content)} bytes, content_type: {file.content_type}")
    
    try:
        # Convert to WAV
        wav_path = tmp_path + ".wav"
        ffmpeg_convert_to_wav(tmp_path, wav_path)
        
        duration = get_duration_seconds(wav_path)
        
        if duration > MAX_SINGLE_CHUNK_SEC:
            # Chunked transcription for long audio
            chunks = split_wav_to_chunks(wav_path)
            results = []
            
            for chunk_path, start, end in chunks:
                try:
                    text, raw = transcribe_chunk(
                        chunk_path,
                        settings["whisper_url"],
                        settings["whisper_token"],
                        settings["whisper_model"],
                        language
                    )
                    ts = str(timedelta(seconds=int(start)))
                    results.append(f"[{ts}] {text.strip()}")
                except Exception as e:
                    results.append(f"[ERROR] {e}")
                finally:
                    if os.path.exists(chunk_path):
                        os.remove(chunk_path)
            
            transcript = "\n".join(results)
        else:
            # Single chunk transcription
            transcript, _ = transcribe_chunk(
                wav_path,
                settings["whisper_url"],
                settings["whisper_token"],
                settings["whisper_model"],
                language
            )
        
        return {"transcript": transcript, "duration": duration}
    
    finally:
        # Cleanup
        for path in [tmp_path, wav_path if 'wav_path' in locals() else None]:
            if path and os.path.exists(path):
                os.remove(path)


@app.post("/api/summarize")
async def summarize(request: SummarizeRequest):
    """Summarize transcript"""
    if not settings["summarizer_url"]:
        raise HTTPException(status_code=400, detail="Summarizer endpoint not configured")
    
    if not request.transcript:
        raise HTTPException(status_code=400, detail="No transcript provided")
    
    system_prompt = """You are a helpful assistant that summarizes meeting transcripts. 
The transcript may include speaker labels such as [Speaker 1], [Speaker 2], etc. 
Preserve speaker context when extracting decisions and action items."""
    
    user_prompt = f"{request.prompt or ''}\n\nTranscript:\n{request.transcript}\n\nPlease produce a {request.style} summary, {request.length} length."
    
    headers = {"Content-Type": "application/json"}
    if settings["summarizer_token"]:
        headers["Authorization"] = f"Bearer {settings['summarizer_token']}"
    
    payload = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    }
    
    if settings["summarizer_model"]:
        payload["model"] = settings["summarizer_model"]
    
    try:
        resp = requests.post(
            settings["summarizer_url"],
            headers=headers,
            json=payload,
            timeout=120,
            verify=False
        )
        
        if resp.ok:
            j = resp.json()
            if "choices" in j and j["choices"]:
                choice = j["choices"][0]
                if "message" in choice:
                    summary = choice["message"].get("content", "")
                else:
                    summary = choice.get("text", "")
            else:
                summary = j.get("summary") or j.get("result") or j.get("text") or ""
            
            return {"summary": summary}
        
        raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])
    
    except requests.RequestException as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
