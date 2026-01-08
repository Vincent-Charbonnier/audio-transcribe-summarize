import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { AudioWaveform } from "lucide-react";
import { AudioRecorder } from "@/components/AudioRecorder";
import { TranscriptEditor } from "@/components/TranscriptEditor";
import { SummaryPanel } from "@/components/SummaryPanel";
import { SettingsDialog, ModelSettings } from "@/components/SettingsDialog";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "scribe-model-settings";

const Index = () => {
  const { toast } = useToast();
  
  // Model settings
  const [settings, setSettings] = useState<ModelSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {
          whisperUrl: "",
          whisperToken: "",
          whisperModel: "whisper-large-v3",
          summarizerUrl: "",
          summarizerToken: "",
          summarizerModel: "",
        };
      }
    }
    return {
      whisperUrl: "",
      whisperToken: "",
      whisperModel: "whisper-large-v3",
      summarizerUrl: "",
      summarizerToken: "",
      summarizerModel: "",
    };
  });

  // App state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("concise");
  const [length, setLength] = useState("short");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const handleSaveSettings = useCallback((newSettings: ModelSettings) => {
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    toast({
      title: "Settings saved",
      description: "Your model configuration has been updated.",
    });
  }, [toast]);

  const handleAudioReady = useCallback(async (file: File) => {
    setAudioFile(file);
    
    if (!settings.whisperUrl) {
      toast({
        title: "Configuration required",
        description: "Please configure your transcription API endpoint in settings.",
        variant: "destructive",
      });
      return;
    }

    setIsTranscribing(true);
    setTranscript("");
    setSummary("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (settings.whisperModel) {
        formData.append("model", settings.whisperModel);
      }

      const headers: Record<string, string> = {};
      if (settings.whisperToken) {
        headers["Authorization"] = `Bearer ${settings.whisperToken}`;
      }

      const response = await fetch(settings.whisperUrl, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }

      const data = await response.json();
      const text = data.transcription || data.text || data.result || "";
      
      if (data.segments) {
        // Handle diarization format
        const lines = data.segments.map((seg: any) => {
          const speaker = seg.speaker || "Speaker";
          return `[${speaker}] ${seg.text || ""}`;
        });
        setTranscript(lines.join("\n"));
      } else {
        setTranscript(text);
      }

      toast({
        title: "Transcription complete",
        description: "Your audio has been transcribed successfully.",
      });
    } catch (error) {
      console.error("Transcription error:", error);
      toast({
        title: "Transcription failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
    }
  }, [settings, toast]);

  const handleGenerateSummary = useCallback(async () => {
    if (!transcript) return;

    if (!settings.summarizerUrl) {
      toast({
        title: "Configuration required",
        description: "Please configure your summarizer API endpoint in settings.",
        variant: "destructive",
      });
      return;
    }

    setIsSummarizing(true);
    setSummary("");

    const systemPrompt = `You are a helpful assistant that summarizes meeting transcripts. 
The transcript may include speaker labels such as [Speaker 1], [Speaker 2], etc. 
Preserve speaker context when extracting decisions and action items.`;

    const userPrompt = `${prompt || ""}\n\nTranscript:\n${transcript}\n\nPlease produce a ${style} summary, ${length} length.`;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (settings.summarizerToken) {
        headers["Authorization"] = `Bearer ${settings.summarizerToken}`;
      }

      const response = await fetch(settings.summarizerUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: settings.summarizerModel || undefined,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Summarization failed: ${response.status}`);
      }

      const data = await response.json();
      let summaryText = "";
      
      if (data.choices?.[0]?.message?.content) {
        summaryText = data.choices[0].message.content;
      } else if (data.choices?.[0]?.text) {
        summaryText = data.choices[0].text;
      } else {
        summaryText = data.summary || data.result || data.text || "";
      }

      setSummary(summaryText);
      toast({
        title: "Summary generated",
        description: "Your transcript has been summarized successfully.",
      });
    } catch (error) {
      console.error("Summarization error:", error);
      toast({
        title: "Summarization failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSummarizing(false);
    }
  }, [transcript, prompt, style, length, settings, toast]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
              <AudioWaveform className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-foreground text-lg">Scribe</h1>
              <p className="text-xs text-muted-foreground">Transcribe & Summarize</p>
            </div>
          </div>
          <SettingsDialog settings={settings} onSave={handleSaveSettings} />
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left column - Recording */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-2xl border border-border shadow-card p-6"
            >
              <h2 className="text-lg font-semibold text-foreground mb-6">Record or Upload</h2>
              <AudioRecorder onAudioReady={handleAudioReady} isProcessing={isTranscribing} />
            </motion.div>

            {/* Transcript Editor */}
            <TranscriptEditor
              transcript={transcript}
              onChange={setTranscript}
              isLoading={isTranscribing}
            />
          </div>

          {/* Right column - Summary */}
          <div>
            <SummaryPanel
              transcript={transcript}
              summary={summary}
              prompt={prompt}
              style={style}
              length={length}
              isLoading={isSummarizing}
              onPromptChange={setPrompt}
              onStyleChange={setStyle}
              onLengthChange={setLength}
              onGenerate={handleGenerateSummary}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Edit the transcript to fix errors before generating your summary.
        </div>
      </footer>
    </div>
  );
};

export default Index;
