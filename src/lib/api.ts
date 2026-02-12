import { config } from "@/config";

export interface ModelSettings {
  whisper_url: string;
  whisper_token: string;
  whisper_model: string;
  summarizer_url: string;
  summarizer_token: string;
  summarizer_model: string;
  diarization_url: string;
  diarization_token: string;
  diarization_model: string;
}

export interface TranscribeResponse {
  transcript: string;
  duration: number;
}

export interface TranscribeStreamChunk {
  index: number;
  total: number;
  text: string;
}

export interface TranscribeStreamStart {
  duration: number;
}

export interface TranscribeStreamComplete {
  transcript: string;
  duration: number;
}

export interface SummarizeResponse {
  summary: string;
}

export interface CleanTranscriptResponse {
  transcript: string;
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.apiUrl;
  }

  async getSettings(): Promise<ModelSettings> {
    const response = await fetch(`${this.baseUrl}/api/settings`);
    if (!response.ok) {
      throw new Error(`Failed to fetch settings: ${response.status}`);
    }
    return response.json();
  }

  async updateSettings(settings: ModelSettings): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      throw new Error(`Failed to update settings: ${response.status}`);
    }
  }

  async transcribe(file: File, language?: string, diarization?: boolean): Promise<TranscribeResponse> {
    const formData = new FormData();
    formData.append("file", file);
    if (language) {
      formData.append("language", language);
    }
    if (diarization) {
      formData.append("diarization", "true");
    }

    const response = await fetch(`${this.baseUrl}/api/transcribe`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Transcription failed: ${response.status}`);
    }

    return response.json();
  }

  async transcribeStream(
    file: File,
    language: string | undefined,
    handlers: {
      onStart?: (data: TranscribeStreamStart) => void;
      onChunk?: (data: TranscribeStreamChunk) => void;
      onComplete?: (data: TranscribeStreamComplete) => void;
      onError?: (message: string) => void;
    }
  ): Promise<void> {
    const formData = new FormData();
    formData.append("file", file);
    if (language) {
      formData.append("language", language);
    }

    const response = await fetch(`${this.baseUrl}/api/transcribe/stream`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok || !response.body) {
      const error = await response.text();
      throw new Error(error || `Transcription stream failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const emitEvent = (block: string) => {
      const lines = block.split("\n").filter((l) => l.trim().length > 0);
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          data += line.slice(5).trim();
        }
      }
      if (!data) return;
      try {
        const parsed = JSON.parse(data);
        if (event === "start") handlers.onStart?.(parsed);
        if (event === "chunk") handlers.onChunk?.(parsed);
        if (event === "complete") handlers.onComplete?.(parsed);
        if (event === "error") handlers.onError?.(parsed.message || "Stream error");
      } catch {
        // ignore parse errors
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf("\n\n");
      while (idx !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        emitEvent(block);
        idx = buffer.indexOf("\n\n");
      }
    }
  }

  async summarize(
    transcript: string,
    prompt?: string,
    style?: string,
    length?: string,
    language?: string
  ): Promise<SummarizeResponse> {
    const response = await fetch(`${this.baseUrl}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        prompt: prompt || "",
        style: style || "concise",
        length: length || "short",
        language: language || "",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Summarization failed: ${response.status}`);
    }

    return response.json();
  }

  async cleanTranscript(transcript: string): Promise<CleanTranscriptResponse> {
    const response = await fetch(`${this.baseUrl}/api/clean_transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Cleanup failed: ${response.status}`);
    }

    return response.json();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const api = new ApiClient();
