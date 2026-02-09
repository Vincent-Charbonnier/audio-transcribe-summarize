import { motion } from "framer-motion";
import { Edit3, Copy, Download, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

interface TranscriptEditorProps {
  transcript: string;
  onChange: (value: string) => void;
  isLoading?: boolean;
  isCleaning?: boolean;
  onClean?: () => void;
}

export function TranscriptEditor({
  transcript,
  onChange,
  isLoading,
  isCleaning,
  onClean,
}: TranscriptEditorProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-border shadow-card overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Transcript</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClean}
            disabled={!transcript || isCleaning}
            className="text-muted-foreground hover:text-foreground"
          >
            {isCleaning ? (
              <Sparkles className="w-4 h-4 animate-pulse" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={!transcript}
            className="text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            disabled={!transcript}
            className="text-muted-foreground hover:text-foreground"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-4 bg-secondary rounded"
                style={{ width: `${Math.random() * 40 + 60}%` }}
              />
            ))}
          </div>
        ) : (
          <Textarea
            value={transcript}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Your transcript will appear here. You can edit it before generating a summary."
            className="min-h-[300px] bg-transparent border-0 resize-none focus-visible:ring-0 text-foreground placeholder:text-muted-foreground"
          />
        )}
      </div>
    </motion.div>
  );
}
