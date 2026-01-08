import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { AudioWaveform, WifiOff, Wifi } from "lucide-react";
import { AudioRecorder } from "@/components/AudioRecorder";
import { TranscriptEditor } from "@/components/TranscriptEditor";
import { SummaryPanel } from "@/components/SummaryPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { config } from "@/config";

const Index = () => {
  const { toast } = useToast();
  
  // Connection state
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  // App state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("concise");
  const [length, setLength] = useState("short");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Check backend connection on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    const connected = await api.healthCheck();
    setIsConnected(connected);
    if (!connected) {
      toast({
        title: "Backend not available",
        description: `Cannot connect to ${config.apiUrl}. Make sure the backend is running.`,
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = useCallback((file: File) => {
    setAudioFile(file);
    setTranscript("");
    setSummary("");
  }, []);

  const handleTranscribe = useCallback(async () => {
    if (!audioFile) {
      toast({
        title: "No file selected",
        description: "Please record or upload an audio/video file first.",
        variant: "destructive",
      });
      return;
    }

    if (!isConnected) {
      toast({
        title: "Backend not connected",
        description: "Please make sure the backend server is running.",
        variant: "destructive",
      });
      return;
    }

    setIsTranscribing(true);

    try {
      const result = await api.transcribe(audioFile);
      setTranscript(result.transcript);

      toast({
        title: "Transcription complete",
        description: `Transcribed ${result.duration.toFixed(1)}s of audio.`,
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
  }, [audioFile, isConnected, toast]);

  const handleGenerateSummary = useCallback(async () => {
    if (!transcript) {
      toast({
        title: "No transcript",
        description: "Please transcribe audio first.",
        variant: "destructive",
      });
      return;
    }

    if (!isConnected) {
      toast({
        title: "Backend not connected",
        description: "Please make sure the backend server is running.",
        variant: "destructive",
      });
      return;
    }

    setIsSummarizing(true);

    try {
      const result = await api.summarize(transcript, prompt, style, length);
      setSummary(result.summary);

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
  }, [transcript, prompt, style, length, isConnected, toast]);

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
          <div className="flex items-center gap-3">
            {/* Connection status indicator */}
            <div className="flex items-center gap-2 text-sm">
              {isConnected === null ? (
                <span className="text-muted-foreground">Checking...</span>
              ) : isConnected ? (
                <span className="flex items-center gap-1.5 text-primary">
                  <Wifi className="w-4 h-4" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-destructive">
                  <WifiOff className="w-4 h-4" />
                  Offline
                </span>
              )}
            </div>
            <SettingsDialog onSettingsChange={checkConnection} />
          </div>
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
              <AudioRecorder 
                onFileSelect={handleFileSelect} 
                onTranscribe={handleTranscribe}
                hasFile={!!audioFile}
                isProcessing={isTranscribing} 
              />
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
          <p>Edit the transcript to fix errors before generating your summary.</p>
          <p className="mt-1 text-xs">Backend: {config.apiUrl}</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
