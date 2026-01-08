import { config } from "@/config";

export interface ModelSettings {
  whisper_url: string;
  whisper_token: string;
  whisper_model: string;
  summarizer_url: string;
  summarizer_token: string;
  summarizer_model: string;
}

export interface TranscribeResponse {
  transcript: string;
  duration: number;
}

export interface SummarizeResponse {
  summary: string;
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

  async summarize(
    transcript: string,
    prompt?: string,
    style?: string,
    length?: string
  ): Promise<SummarizeResponse> {
    const response = await fetch(`${this.baseUrl}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        prompt: prompt || "",
        style: style || "concise",
        length: length || "short",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Summarization failed: ${response.status}`);
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
