import { useState, useEffect } from "react";
import { Settings, Check, Eye, EyeOff, Loader2 } from "lucide-react";
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
import { api, ModelSettings } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface SettingsDialogProps {
  onSettingsChange?: () => void;
}

export function SettingsDialog({ onSettingsChange }: SettingsDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localSettings, setLocalSettings] = useState<ModelSettings>({
    whisper_url: "",
    whisper_token: "",
    whisper_model: "whisper-large-v3",
    summarizer_url: "",
    summarizer_token: "",
    summarizer_model: "",
<<<<<<< HEAD
<<<<<<< HEAD
    diarization_url: "",
    diarization_token: "",
    diarization_model: "",
=======
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
=======
>>>>>>> parent of 9f84494 (Fixed transcription with prompt and AI cleaning)
  });
  const [showWhisperToken, setShowWhisperToken] = useState(false);
  const [showSummarizerToken, setShowSummarizerToken] = useState(false);
  const [showDiarizationToken, setShowDiarizationToken] = useState(false);

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const settings = await api.getSettings();
      setLocalSettings(settings);
    } catch (error) {
      console.error("Failed to load settings:", error);
      toast({
        title: "Connection Error",
        description: "Could not connect to backend. Make sure the server is running.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSettings(localSettings);
      toast({
        title: "Settings saved",
        description: "Your model configuration has been updated.",
      });
      onSettingsChange?.();
      setOpen(false);
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
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

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Transcription Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Transcription Model</h4>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">API Endpoint URL</Label>
                  <Input
                    value={localSettings.whisper_url}
                    onChange={(e) => updateField("whisper_url", e.target.value)}
                    placeholder="https://your-whisper-endpoint/v1/audio/transcriptions"
                    className="bg-secondary/50 border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">API Token</Label>
                  <div className="relative">
                    <Input
                      type={showWhisperToken ? "text" : "password"}
                      value={localSettings.whisper_token}
                      onChange={(e) => updateField("whisper_token", e.target.value)}
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
                    value={localSettings.whisper_model}
                    onChange={(e) => updateField("whisper_model", e.target.value)}
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
                    value={localSettings.summarizer_url}
                    onChange={(e) => updateField("summarizer_url", e.target.value)}
                    placeholder="https://your-endpoint/v1/chat/completions"
                    className="bg-secondary/50 border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">API Token</Label>
                  <div className="relative">
                    <Input
                      type={showSummarizerToken ? "text" : "password"}
                      value={localSettings.summarizer_token}
                      onChange={(e) => updateField("summarizer_token", e.target.value)}
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
                    value={localSettings.summarizer_model}
                    onChange={(e) => updateField("summarizer_model", e.target.value)}
                    placeholder="gpt-4"
                    className="bg-secondary/50 border-border"
                  />
                </div>
              </div>
            </div>

            <Separator className="bg-border" />

            {/* Diarization Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Diarization Model (Optional)</h4>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">API Endpoint URL</Label>
                  <Input
                    value={localSettings.diarization_url}
                    onChange={(e) => updateField("diarization_url", e.target.value)}
                    placeholder="https://your-diarization-endpoint/v1/diarize"
                    className="bg-secondary/50 border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">API Token</Label>
                  <div className="relative">
                    <Input
                      type={showDiarizationToken ? "text" : "password"}
                      value={localSettings.diarization_token}
                      onChange={(e) => updateField("diarization_token", e.target.value)}
                      placeholder="Bearer token"
                      className="bg-secondary/50 border-border pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDiarizationToken(!showDiarizationToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showDiarizationToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Model Name</Label>
                  <Input
                    value={localSettings.diarization_model}
                    onChange={(e) => updateField("diarization_model", e.target.value)}
                    placeholder="pyannote/speaker-diarization"
                    className="bg-secondary/50 border-border"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-gradient-primary text-primary-foreground hover:opacity-90"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
