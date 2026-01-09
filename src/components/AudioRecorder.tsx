import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Mic, Square, Upload, FileAudio, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  { code: "", label: "Auto-detect" },
  { code: "en", label: "English" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "pt", label: "Portuguese" },
  { code: "pl", label: "Polish" },
  { code: "sv", label: "Swedish" },
  { code: "da", label: "Danish" },
  { code: "no", label: "Norwegian" },
  { code: "fi", label: "Finnish" },
];

interface AudioRecorderProps {
  onFileSelect: (file: File) => void;
  onTranscribe: (language: string) => void;
  hasFile: boolean;
  isProcessing?: boolean;
}

export function AudioRecorder({ onFileSelect, onTranscribe, hasFile, isProcessing }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("");
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      });
      
      // Try to use audio/webm with opus codec for better quality
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `recording-${Date.now()}.${extension}`, { type: mimeType });
        setUploadedFile(file);
        onFileSelect(file);
        stream.getTracks().forEach(track => track.stop());
      };

      // Start with timeslice to collect data every second for better reliability
      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  }, [onFileSelect]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      onFileSelect(file);
    }
  };

  return (
    <div className="space-y-6">
      {/* Recording Button */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          {isRecording && (
            <>
              <motion.div
                className="absolute inset-0 rounded-full bg-recording"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <motion.div
                className="absolute inset-0 rounded-full bg-recording"
                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
              />
            </>
          )}
          <motion.button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={cn(
              "relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all",
              isRecording
                ? "bg-recording text-destructive-foreground"
                : "bg-gradient-primary text-primary-foreground shadow-glow hover:scale-105",
              isProcessing && "opacity-50 cursor-not-allowed"
            )}
            whileTap={{ scale: 0.95 }}
          >
            {isRecording ? (
              <Square className="w-8 h-8 fill-current" />
            ) : (
              <Mic className="w-8 h-8" />
            )}
          </motion.button>
        </div>

        {isRecording && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-mono text-foreground"
          >
            {formatTime(recordingTime)}
          </motion.div>
        )}

        <p className="text-sm text-muted-foreground">
          {isRecording ? "Recording... Click to stop" : "Click to start recording"}
        </p>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* File Upload */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer transition-all",
          "hover:border-primary/50 hover:bg-secondary/30",
          uploadedFile && "border-primary bg-primary/5"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*"
          onChange={handleFileUpload}
          className="hidden"
        />
        {uploadedFile ? (
          <div className="flex items-center justify-center gap-3">
            <FileAudio className="w-8 h-8 text-primary" />
            <div className="text-left">
              <p className="font-medium text-foreground">{uploadedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>
        ) : (
          <>
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-foreground font-medium">Drop audio or video file here</p>
            <p className="text-sm text-muted-foreground mt-1">
              Supports WAV, MP3, MP4, MOV, WebM and more
            </p>
          </>
        )}
      </div>

      {/* Language Selection & Transcribe Button */}
      {hasFile && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground whitespace-nowrap">Language:</label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Auto-detect" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code || "auto"}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => onTranscribe(language === "auto" ? "" : language)}
            disabled={isProcessing}
            className="w-full bg-gradient-primary text-primary-foreground font-semibold shadow-glow hover:opacity-90 transition-opacity"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Transcribing...
              </>
            ) : (
              "Transcribe Audio"
            )}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
