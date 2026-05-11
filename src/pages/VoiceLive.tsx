import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation, ConversationProvider } from "@elevenlabs/react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2, Phone, PhoneOff, ExternalLink, AlertTriangle, Sparkles } from "lucide-react";
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
  const [preparing, setPreparing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [sessionConfig, setSessionConfig] = useState<any>(null);
  const [transcript, setTranscript] = useState<{ role: "user" | "agent"; text: string }[]>([]);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const ambienceRef = useRef<HTMLAudioElement | null>(null);

  const startAmbience = useCallback(() => {
    try {
      if (!ambienceRef.current) {
        const a = new Audio("/ambience-venue.mp3");
        a.loop = true;
        a.volume = 0.08; // subtle — under the agent
        ambienceRef.current = a;
      }
      ambienceRef.current.currentTime = 0;
      ambienceRef.current.play().catch(() => {});
    } catch {}
  }, []);
  const stopAmbience = useCallback(() => {
    try {
      if (ambienceRef.current) {
        ambienceRef.current.pause();
        ambienceRef.current.currentTime = 0;
      }
    } catch {}
  }, []);

  const prepareSession = useCallback(async (force = false) => {
    if (!venue) return null;
    if (!force && sessionConfig) return sessionConfig;
    setPreparing(true);
    try {
      const { data, error } = await supabase.functions.invoke("voice-token", {
        body: { venue_id: venue.id },
      });
      if (error) throw new Error(error.message || "voice-token failed");
      if (!data?.token && !data?.signed_url) throw new Error(data?.error || "No voice session returned");
      setSessionConfig(data);
      return data;
    } catch (e: any) {
      setMicError(e.message || "Could not prepare voice agent");
      toast.error(e.message || "Could not prepare voice agent");
      return null;
    } finally {
      setPreparing(false);
    }
  }, [sessionConfig, venue]);

  useEffect(() => {
    setSessionConfig(null);
    setTranscript([]);
    if (venue) prepareSession(true);
  }, [venue?.id]);

  useEffect(() => () => stopAmbience(), [stopAmbience]);

  const conversation = useConversation({
    onConnect: () => {
      toast.success("Connected to voice agent");
      setMicError(null);
      setCallStartedAt(Date.now());
      setTranscript([]);
      startAmbience();
    },
    onDisconnect: async () => {
      toast.message("Call ended");
      stopAmbience();
      // Persist transcript
      if (venue && callStartedAt && transcript.length > 0) {
        try {
          await supabase.functions.invoke("save-call", {
            body: {
              venue_id: venue.id,
              transcript,
              started_at: new Date(callStartedAt).toISOString(),
              duration_seconds: Math.round((Date.now() - callStartedAt) / 1000),
            },
          });
        } catch (e) { console.error("save-call", e); }
      }
      setCallStartedAt(null);
    },
    onMessage: (m: any) => {
      console.log("[VoiceLive] message", m);
      if (m?.source === "user" && typeof m.message === "string") {
        setTranscript(t => [...t, { role: "user", text: m.message }]);
        return;
      }
      if (m?.source === "ai" && typeof m.message === "string") {
        setTranscript(t => [...t, { role: "agent", text: m.message }]);
        return;
      }
      if (m?.type === "user_transcript" && m.user_transcription_event?.user_transcript)
        setTranscript(t => [...t, { role: "user", text: m.user_transcription_event.user_transcript }]);
      if (m?.type === "agent_response" && m.agent_response_event?.agent_response)
        setTranscript(t => [...t, { role: "agent", text: m.agent_response_event.agent_response }]);
    },
    onError: (e: any) => {
      console.error("[VoiceLive] error", e);
      toast.error(e?.message || "Voice error");
    },
    clientTools: {
      create_booking: async (params: any) => {
        try {
          if (!venue) return "No venue selected";
          const time = new Date(params.booking_time);
          if (isNaN(time.getTime())) return "Invalid booking_time; please use ISO 8601";
          const { data, error } = await supabase.from("bookings").insert({
            venue_id: venue.id,
            guest_name: params.guest_name,
            party_size: Number(params.party_size) || 2,
            booking_time: time.toISOString(),
            guest_phone: params.guest_phone || null,
            notes: params.notes || null,
            source: "ai_voice",
            status: "confirmed",
          }).select().single();
          if (error) throw error;
          await supabase.from("brain_events").insert({
            venue_id: venue.id,
            title: "Booking created by voice agent",
            reason: `${params.guest_name} · party of ${params.party_size} · ${time.toLocaleString()}`,
            severity: "info",
          });
          if (params.guest_phone) {
            supabase.functions.invoke("send-sms", {
              body: {
                venue_id: venue.id,
                to: params.guest_phone,
                booking_id: data.id,
                body: `Hi ${params.guest_name}, your table for ${params.party_size} at ${venue.name} on ${time.toLocaleString()} is confirmed. Reply STOP to opt out.`,
              },
            }).catch(() => {});
          }
          toast.success(`Booking added: ${params.guest_name}`);
          return `Booking confirmed for ${params.guest_name}, party of ${params.party_size} at ${time.toLocaleString()}. Booking id: ${data.id}`;
        } catch (e: any) {
          console.error("[create_booking] failed", e);
          toast.error(e.message || "Booking failed");
          return `Failed to create booking: ${e.message || "unknown error"}`;
        }
      },
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
      // Mic permission must be requested from the Start button click before the SDK connects.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

      const config = sessionConfig || await prepareSession();
      if (!config) throw new Error("Voice agent is not ready yet. Try again in a moment.");

      const baseOptions = {
        useWakeLock: false,
        dynamicVariables: {
          venue_name: venue.name,
          venue_id: venue.id,
        },
      };

      if (config.signed_url) {
        conversation.startSession({ ...baseOptions, signedUrl: config.signed_url, connectionType: "websocket" });
      } else {
        conversation.startSession({ ...baseOptions, conversationToken: config.token, connectionType: "webrtc" });
      }

      // Log brain event (best-effort)
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
  }, [conversation, prepareSession, venue]);

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

      {preparing && (
        <div className="mb-6 glass rounded-2xl p-4 border border-primary/20 flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Preparing your venue-aware voice agent…
        </div>
      )}

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
        <div className="card-cine p-10 flex flex-col items-center justify-center min-h-[520px] relative overflow-hidden">
          {/* Layered ambient field */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "radial-gradient(circle at 50% 45%, hsl(32 96% 58% / 0.18), transparent 55%)"
          }} />
          <div className="absolute inset-0 grid-bg opacity-30" />

          {/* Living orb */}
          <div className="relative h-56 w-56 grid place-items-center">
            {/* Outer rings — only when on */}
            {isOn && (
              <>
                <span className="absolute inset-0 rounded-full border border-primary/30 animate-ring-out" />
                <span className="absolute inset-0 rounded-full border border-primary/20 animate-ring-out" style={{ animationDelay: "0.8s" }} />
                <span className="absolute inset-0 rounded-full border border-primary/15 animate-ring-out" style={{ animationDelay: "1.6s" }} />
              </>
            )}

            {/* Aura halo */}
            <motion.div
              className="absolute inset-4 rounded-full blur-2xl"
              style={{ background: "radial-gradient(circle, hsl(32 96% 58% / 0.65), transparent 70%)" }}
              animate={{
                scale: isSpeaking ? [1, 1.35, 1] : isOn ? [1, 1.15, 1] : [1, 1.08, 1],
                opacity: isSpeaking ? [0.7, 1, 0.7] : isOn ? [0.6, 0.9, 0.6] : [0.4, 0.55, 0.4],
              }}
              transition={{ repeat: Infinity, duration: isSpeaking ? 0.55 : isOn ? 1.6 : 4, ease: "easeInOut" }}
            />

            {/* Mid glass shell */}
            <motion.div
              className="absolute inset-6 rounded-full backdrop-blur-md border border-white/10"
              style={{
                background: "radial-gradient(circle at 35% 30%, hsl(36 100% 90% / 0.18), hsl(28 18% 5% / 0.6) 70%)",
                boxShadow: "0 0 80px hsl(32 96% 58% / 0.4) inset, 0 30px 80px -10px hsl(0 0% 0% / 0.7)"
              }}
              animate={{ scale: isSpeaking ? [1, 1.06, 1] : [1, 1.02, 1] }}
              transition={{ repeat: Infinity, duration: isSpeaking ? 0.45 : 3.6, ease: "easeInOut" }}
            />

            {/* Core sphere */}
            <motion.div
              className="relative h-28 w-28 rounded-full grid place-items-center
                shadow-[0_0_60px_hsl(var(--primary)/0.7),0_1px_0_hsl(36_100%_95%_/_0.4)_inset]
                border border-primary/50"
              style={{
                background: "radial-gradient(circle at 35% 30%, hsl(38 100% 78%), hsl(32 96% 58%) 50%, hsl(22 88% 42%))"
              }}
              animate={{ scale: isSpeaking ? [1, 1.1, 1] : isOn ? [1, 1.04, 1] : [1, 1.02, 1] }}
              transition={{ repeat: Infinity, duration: isSpeaking ? 0.5 : isOn ? 1.4 : 4, ease: "easeInOut" }}
            >
              {/* Glossy highlight */}
              <div className="absolute top-3 left-5 right-9 h-6 rounded-full opacity-70"
                style={{ background: "radial-gradient(ellipse, hsl(0 0% 100% / 0.55), transparent 70%)" }} />
              {isOn ? <Mic className="h-9 w-9 text-primary-foreground relative drop-shadow-md" strokeWidth={2.4} />
                    : <MicOff className="h-9 w-9 text-primary-foreground/80 relative" strokeWidth={2} />}
            </motion.div>

            {/* Audio reactive bars when speaking */}
            {isSpeaking && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-end gap-1 h-8">
                {[0.6, 0.9, 1, 0.75, 0.5, 0.85, 0.7].map((s, i) => (
                  <motion.span
                    key={i}
                    className="w-[3px] rounded-full bg-gradient-to-t from-primary to-primary-glow"
                    animate={{ scaleY: [s * 0.4, s, s * 0.5] }}
                    transition={{ repeat: Infinity, duration: 0.45, delay: i * 0.06, ease: "easeInOut" }}
                    style={{ height: "100%", transformOrigin: "bottom" }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="relative mt-10 text-center">
            <div className="label-micro mb-2">{venue?.name}</div>
            <div className="text-xl font-medium tracking-tight">
              {status === "connecting" ? "Connecting…" : isOn ? (isSpeaking ? "Agent speaking" : "Listening") : "Tap to talk"}
            </div>
            {isOn && (
              <div className="mt-1 text-[11px] text-primary/80 flex items-center justify-center gap-1.5">
                <span className="pulse-dot !h-1.5 !w-1.5" /> Sub-second latency · WebRTC
              </div>
            )}
          </div>

          <div className="relative mt-7 flex gap-2.5">
            {!isOn ? (
              <Button
                size="lg"
                onClick={start}
                disabled={busy || preparing || status === "connecting"}
                className="relative overflow-hidden bg-gradient-to-r from-primary via-primary to-accent text-primary-foreground
                  shadow-[0_16px_50px_-12px_hsl(var(--primary)/0.7),0_1px_0_hsl(36_100%_90%_/_0.3)_inset]
                  hover:shadow-[0_20px_60px_-12px_hsl(var(--primary)/0.85)]
                  border border-primary/40 px-6 h-12 font-medium transition-all duration-300"
              >
                <span className="absolute inset-0 stream-line opacity-60" />
                {busy || preparing || status === "connecting"
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2 relative" />
                  : <Phone className="h-4 w-4 mr-2 relative" />}
                <span className="relative">{preparing ? "Preparing" : status === "connecting" ? "Connecting" : "Start call"}</span>
              </Button>
            ) : (
              <Button size="lg" variant="destructive" onClick={stop} className="h-12 px-6">
                <PhoneOff className="h-4 w-4 mr-2" /> End call
              </Button>
            )}
            <Button size="lg" variant="outline" onClick={openInNewTab} className="h-12 w-12 p-0" title="Open in new tab">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative mt-5 text-[11px] text-muted-foreground text-center max-w-xs">
            Tip: if mic access is blocked in the embedded preview, open this page in a new tab.
          </div>
        </div>

        <div className="card-cine p-6 min-h-[520px] flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="label-micro mb-1.5">Mission Control</div>
              <div className="font-medium text-[15px]">Live transcript</div>
            </div>
            <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              isOn
                ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30'
                : 'bg-secondary/60 text-muted-foreground border-white/5'
            }`}>{status}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            <AnimatePresence>
              {transcript.length === 0 && (
                <div className="text-center py-16 px-4">
                  <div className="text-sm font-medium mb-1.5">Your AI host is listening.</div>
                  <div className="text-xs text-muted-foreground">Words will stream here as you speak — with intent and confidence tagged in real time.</div>
                </div>
              )}
              {transcript.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`p-3.5 rounded-xl text-[13.5px] leading-relaxed border ${
                    t.role === 'user'
                      ? 'bg-primary/[0.06] ml-10 border-primary/15'
                      : 'bg-white/[0.02] mr-10 border-white/[0.06]'
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
                    style={{ color: t.role === 'user' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>
                    {t.role === 'user' ? <><span className="pulse-amber !h-1 !w-1" /> You</> : <><Sparkles className="h-2.5 w-2.5" /> Agent</>}
                  </div>
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
