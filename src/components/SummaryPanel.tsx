import { motion } from "framer-motion";
import { Sparkles, Copy, Download, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

interface SummaryPanelProps {
  transcript: string;
  summary: string;
  prompt: string;
  style: string;
  length: string;
  isLoading: boolean;
  onPromptChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onLengthChange: (value: string) => void;
  onGenerate: () => void;
}

export function SummaryPanel({
  transcript,
  summary,
  prompt,
  style,
  length,
  isLoading,
  onPromptChange,
  onStyleChange,
  onLengthChange,
  onGenerate,
}: SummaryPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([summary], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `summary-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-card rounded-2xl border border-border shadow-card overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Summary</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={!summary}
            className="text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            disabled={!summary}
            className="text-muted-foreground hover:text-foreground"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Prompt input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Custom Instructions (optional)</label>
          <Textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="E.g., 'Extract action items with owners' or 'Focus on technical decisions'"
            className="min-h-[80px] bg-secondary/50 border-border resize-none"
          />
        </div>

        {/* Style & Length */}
        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Style</label>
            <Select value={style} onValueChange={onStyleChange}>
              <SelectTrigger className="bg-secondary/50 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concise">Concise</SelectItem>
                <SelectItem value="bullet_points">Bullet Points</SelectItem>
                <SelectItem value="action_items">Action Items</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Length</label>
            <Select value={length} onValueChange={onLengthChange}>
              <SelectTrigger className="bg-secondary/50 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="long">Long</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Generate button */}
        <Button
          onClick={onGenerate}
          disabled={!transcript || isLoading}
          className="w-full bg-gradient-primary text-primary-foreground font-semibold shadow-glow hover:opacity-90 transition-opacity"
        >
          {isLoading ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles className="w-4 h-4" />
            </motion.div>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Summary
            </>
          )}
        </Button>

        {/* Summary output */}
        {(summary || isLoading) && (
          <div className="pt-4 border-t border-border">
            {isLoading ? (
              <div className="space-y-3 animate-pulse">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-4 bg-secondary rounded"
                    style={{ width: `${Math.random() * 30 + 70}%` }}
                  />
                ))}
              </div>
            ) : (
              <div className="prose prose-invert max-w-none">
                <p className="text-foreground whitespace-pre-wrap">{summary}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
