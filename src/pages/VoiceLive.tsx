import { useCallback, useState } from "react";
import { useConversation, ConversationProvider } from "@elevenlabs/react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2, Phone, PhoneOff, ExternalLink, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export default function VoiceLive() {
  return (
    <ConversationProvider>
      <VoiceLiveInner />
    </ConversationProvider>
  );
}

function VoiceLiveInner() {
  const { venue } = useAuth();
  const [busy, setBusy] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ role: "user" | "agent"; text: string }[]>([]);

  const conversation = useConversation({
    onConnect: () => {
      toast.success("Connected to voice agent");
      setMicError(null);
    },
    onDisconnect: () => toast.message("Call ended"),
    onMessage: (m: any) => {
      if (m.type === "user_transcript" && m.user_transcription_event?.user_transcript)
        setTranscript(t => [...t, { role: "user", text: m.user_transcription_event.user_transcript }]);
      if (m.type === "agent_response" && m.agent_response_event?.agent_response)
        setTranscript(t => [...t, { role: "agent", text: m.agent_response_event.agent_response }]);
    },
    onError: (e: any) => {
      console.error("[VoiceLive] error", e);
      toast.error(e?.message || "Voice error");
    },
  });

  const start = useCallback(async () => {
    if (!venue) {
      toast.error("No venue selected");
      return;
    }
    setBusy(true);
    setMicError(null);
    try {
      // 1) Mic permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // immediately release; SDK will reacquire
        stream.getTracks().forEach(t => t.stop());
      } catch (err: any) {
        const name = err?.name || "";
        const msg =
          name === "NotAllowedError"
            ? "Microphone permission was denied. The Lovable preview iframe may be blocking it — open this page in a new tab and allow the mic."
            : name === "NotFoundError"
            ? "No microphone found on this device."
            : `Mic error: ${err?.message || name || "unknown"}`;
        setMicError(msg);
        throw new Error(msg);
      }

      // 2) Get conversation token from edge function
      const { data, error } = await supabase.functions.invoke("voice-token", {
        body: { venue_id: venue.id },
      });
      if (error) throw new Error(error.message || "voice-token failed");
      if (!data?.token) throw new Error(data?.error || "No token returned");

      // 3) Start WebRTC session
      await conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
      });

      // 4) Log brain event (best-effort)
      supabase.from("brain_events").insert({
        venue_id: venue.id,
        title: "Live voice session opened",
        reason: "Operator connected to voice agent for testing.",
        severity: "info",
      }).then(() => {});
    } catch (e: any) {
      console.error("[VoiceLive] start failed", e);
      toast.error(e.message || "Could not start voice");
    } finally {
      setBusy(false);
    }
  }, [conversation, venue]);

  const stop = async () => {
    try { await conversation.endSession(); } catch (e) { console.error(e); }
  };

  const status = conversation.status;
  const isOn = status === "connected";
  const isSpeaking = conversation.isSpeaking;
  const openInNewTab = () => window.open(window.location.href, "_blank", "noopener");

  return (
    <>
      <PageHeader title="Live Voice" subtitle="Speak to your venue's AI host. Real WebRTC, sub-second latency." />

      {micError && (
        <div className="mb-6 glass rounded-2xl p-4 border border-[hsl(var(--warning))]/30 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))] mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <div className="font-medium mb-1">Microphone blocked</div>
            <div className="text-muted-foreground">{micError}</div>
          </div>
          <Button size="sm" variant="outline" onClick={openInNewTab}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open in new tab
          </Button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-strong rounded-3xl p-8 flex flex-col items-center justify-center min-h-[460px] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5" />
          <motion.div animate={{ scale: isSpeaking ? [1, 1.15, 1] : isOn ? [1, 1.05, 1] : 1 }} transition={{ repeat: Infinity, duration: isSpeaking ? 0.6 : 2 }}
            className={`relative h-44 w-44 rounded-full grid place-items-center bg-gradient-to-br from-primary/30 to-accent/30 ${isOn ? 'shadow-[0_0_80px_hsl(var(--primary)/0.6)]' : ''}`}>
            <div className="absolute inset-3 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center">
              {isOn ? <Mic className="h-10 w-10 text-primary-foreground" /> : <MicOff className="h-10 w-10 text-primary-foreground/70" />}
            </div>
          </motion.div>
          <div className="relative mt-8 text-center">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">{venue?.name}</div>
            <div className="text-lg font-medium">{isOn ? (isSpeaking ? "Agent speaking…" : "Listening…") : "Tap to talk"}</div>
          </div>
          <div className="relative mt-6 flex gap-2">
            {!isOn ? (
              <Button size="lg" onClick={start} disabled={busy} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-[0_0_30px_hsl(var(--primary)/0.5)]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Phone className="h-4 w-4 mr-2" />} Start call
              </Button>
            ) : (
              <Button size="lg" variant="destructive" onClick={stop}><PhoneOff className="h-4 w-4 mr-2" /> End call</Button>
            )}
            <Button size="lg" variant="outline" onClick={openInNewTab} title="Open in new tab (recommended for mic access)">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative mt-4 text-[11px] text-muted-foreground text-center max-w-xs">
            Tip: if mic access is blocked in the embedded preview, open this page in a new tab.
          </div>
        </div>

        <div className="glass rounded-3xl p-6 min-h-[460px] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="font-medium">Live transcript</div>
            <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${isOn ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]' : 'bg-secondary text-muted-foreground'}`}>{status}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            <AnimatePresence>
              {transcript.length === 0 && <div className="text-sm text-muted-foreground text-center py-12">Transcript will appear here as you speak.</div>}
              {transcript.map((t, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={`p-3 rounded-xl text-sm ${t.role === 'user' ? 'bg-primary/10 ml-8 border border-primary/20' : 'bg-secondary/40 mr-8 border border-white/5'}`}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t.role === 'user' ? 'You' : 'Agent'}</div>
                  {t.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}
