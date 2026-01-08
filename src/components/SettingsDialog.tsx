import { useState, useEffect } from "react";
import { Settings, Check, X, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export interface ModelSettings {
  whisperUrl: string;
  whisperToken: string;
  whisperModel: string;
  summarizerUrl: string;
  summarizerToken: string;
  summarizerModel: string;
}

interface SettingsDialogProps {
  settings: ModelSettings;
  onSave: (settings: ModelSettings) => void;
}

export function SettingsDialog({ settings, onSave }: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings);
  const [showWhisperToken, setShowWhisperToken] = useState(false);
  const [showSummarizerToken, setShowSummarizerToken] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = () => {
    onSave(localSettings);
    setOpen(false);
  };

  const updateField = (field: keyof ModelSettings, value: string) => {
    setLocalSettings((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Settings className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Model Configuration</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Configure your transcription and summarization API endpoints.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Transcription Settings */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Transcription Model</h4>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground">API Endpoint URL</Label>
                <Input
                  value={localSettings.whisperUrl}
                  onChange={(e) => updateField("whisperUrl", e.target.value)}
                  placeholder="https://your-whisper-endpoint/v1/audio/transcriptions"
                  className="bg-secondary/50 border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">API Token</Label>
                <div className="relative">
                  <Input
                    type={showWhisperToken ? "text" : "password"}
                    value={localSettings.whisperToken}
                    onChange={(e) => updateField("whisperToken", e.target.value)}
                    placeholder="Bearer token"
                    className="bg-secondary/50 border-border pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWhisperToken(!showWhisperToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showWhisperToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Model Name</Label>
                <Input
                  value={localSettings.whisperModel}
                  onChange={(e) => updateField("whisperModel", e.target.value)}
                  placeholder="whisper-large-v3"
                  className="bg-secondary/50 border-border"
                />
              </div>
            </div>
          </div>

          <Separator className="bg-border" />

          {/* Summarizer Settings */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Summarizer Model</h4>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground">API Endpoint URL</Label>
                <Input
                  value={localSettings.summarizerUrl}
                  onChange={(e) => updateField("summarizerUrl", e.target.value)}
                  placeholder="https://your-endpoint/v1/chat/completions"
                  className="bg-secondary/50 border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">API Token</Label>
                <div className="relative">
                  <Input
                    type={showSummarizerToken ? "text" : "password"}
                    value={localSettings.summarizerToken}
                    onChange={(e) => updateField("summarizerToken", e.target.value)}
                    placeholder="Bearer token"
                    className="bg-secondary/50 border-border pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSummarizerToken(!showSummarizerToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSummarizerToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Model Name</Label>
                <Input
                  value={localSettings.summarizerModel}
                  onChange={(e) => updateField("summarizerModel", e.target.value)}
                  placeholder="gpt-4"
                  className="bg-secondary/50 border-border"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-gradient-primary text-primary-foreground hover:opacity-90"
          >
            <Check className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
