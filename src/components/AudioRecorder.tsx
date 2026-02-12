import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, FileAudio, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LANGUAGES = [
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
  onFileSelect: (file: File) => boolean;
  onTranscribe: (language: string, diarization: boolean) => void;
  hasFile: boolean;
  isProcessing?: boolean;
}

export function AudioRecorder({ onFileSelect, onTranscribe, hasFile, isProcessing }: AudioRecorderProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en");
  const [diarization, setDiarization] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const accepted = onFileSelect(file);
      if (accepted) {
        setUploadedFile(file);
      } else {
        setUploadedFile(null);
      }
    }
  };

  return (
    <div className="space-y-6">
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
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.label}
                    </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="diarization"
              checked={diarization}
              onCheckedChange={(v) => setDiarization(Boolean(v))}
            />
            <label htmlFor="diarization" className="text-sm text-muted-foreground">
              Diarization (if configured)
            </label>
          </div>
          <Button
            onClick={() => onTranscribe(language, diarization)}
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
