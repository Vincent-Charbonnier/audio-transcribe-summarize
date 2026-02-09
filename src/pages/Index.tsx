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
  const [isCleaning, setIsCleaning] = useState(false);

  const MAX_UPLOAD_MB = config.maxUploadMb;

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
        description: "Cannot connect to the backend. Make sure it is running.",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = useCallback((file: File) => {
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_UPLOAD_MB) {
      toast({
        title: "File too large",
        description: `Max upload size is ${MAX_UPLOAD_MB} MB.`,
        variant: "destructive",
      });
      return false;
    }
    setAudioFile(file);
    setTranscript("");
    setSummary("");
    return true;
  }, [toast]);

  const handleTranscribe = useCallback(async (language: string) => {
    if (!audioFile) {
      toast({
        title: "No file selected",
        description: "Please upload an audio/video file first.",
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
      const result = await api.transcribe(audioFile, language || undefined);
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

  const handleCleanTranscript = useCallback(async () => {
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

    setIsCleaning(true);

    try {
      const result = await api.cleanTranscript(transcript);
      setTranscript(result.transcript);
      toast({
        title: "Transcript cleaned",
        description: "The transcript has been cleaned for readability.",
      });
    } catch (error) {
      console.error("Cleanup error:", error);
      toast({
        title: "Cleanup failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsCleaning(false);
    }
  }, [transcript, isConnected, toast]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
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

      {/* Main content - 3 panel layout */}
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          {/* Left panel - Upload */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-4 bg-card rounded-2xl border border-border shadow-card overflow-hidden"
          >
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Upload</h3>
            </div>
            <div className="p-4">
              <AudioRecorder 
                onFileSelect={handleFileSelect} 
                onTranscribe={handleTranscribe}
                hasFile={!!audioFile}
                isProcessing={isTranscribing} 
              />
            </div>
          </motion.div>

          {/* Center panel - Transcript */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-4"
          >
            <TranscriptEditor
              transcript={transcript}
              onChange={setTranscript}
              isLoading={isTranscribing}
              isCleaning={isCleaning}
              onClean={handleCleanTranscript}
            />
          </motion.div>

          {/* Right panel - Summary */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-4"
          >
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
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Edit the transcript to fix errors before generating your summary.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
