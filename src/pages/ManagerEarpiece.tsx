import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, Mic, Volume2, VolumeX, Sparkles, Send, Loader2, Radio, Ear, PhoneOff } from "lucide-react";
import { toast } from "sonner";

type Turn = { role: "user" | "assistant"; content: string; ts: number };
type Mode = "idle" | "call" | "always_on";
type Phase = "idle" | "wake_listening" | "listening" | "thinking" | "speaking";

const QUICK_PROMPTS = [
  "How's tonight looking?",
  "Any VIPs in tonight?",
  "What needs my attention right now?",
  "Walk me through the next two hours.",
  "Any emails I need to handle?",
];

const WAKE_PATTERNS = [/\bhey\s+ai?jentik\b/i, /\bhey\s+agentic\b/i, /\bhey\s+agent\b/i];
const WAKE_ACKS = ["Yesss?", "Mhm?", "Go on…", "Yep, listening.", "Hit me.", "I'm all ears.", "Yes boss?"];
const NEGATIVE_PATTERNS = [/\bno\b/i, /\bthat'?s\s+(it|all)\b/i, /\bnothing\b/i, /\bi'?m\s+good\b/i, /\bwe'?re\s+good\b/i, /\bthanks?\b/i, /\bbye\b/i];
const FOLLOWUP = "Anything else I can help with?";
const SIGNOFF = "Okay — I'm here when you need me.";

export default function ManagerEarpiece() {
  const { venue } = useAuth();
  const [mode, setMode] = useState<Mode>("idle");
  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState("");
  const [ctx, setCtx] = useState<{ bookings: number; covers: number; vips: number; pending_emails: number } | null>(null);

  const recRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<Mode>("idle");
  const phaseRef = useRef<Phase>("idle");
  const awaitingFollowupRef = useRef(false);
  const wantRecRef = useRef(false); // whether SR should be auto-restarted
  const speakingRef = useRef(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }); }, [turns, partial]);

  const stopRecognition = useCallback(() => {
    wantRecRef.current = false;
    try { recRef.current?.stop(); } catch {}
  }, []);

  const stopAudio = useCallback(() => {
    try { audioRef.current?.pause(); } catch {}
    audioRef.current = null;
    speakingRef.current = false;
  }, []);

  const speak = useCallback(async (text: string): Promise<void> => {
    if (muted) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/earpiece-tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!json.audio_base64) return;
      await new Promise<void>((resolve) => {
        const audio = new Audio(`data:${json.mime};base64,${json.audio_base64}`);
        audioRef.current?.pause();
        audioRef.current = audio;
        speakingRef.current = true;
        audio.onended = () => { speakingRef.current = false; resolve(); };
        audio.onerror = () => { speakingRef.current = false; resolve(); };
        audio.play().catch(() => { speakingRef.current = false; resolve(); });
      });
    } catch {
      speakingRef.current = false;
    }
  }, [muted]);

  const startRecognition = useCallback((kind: "wake" | "command") => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input not supported in this browser. Type instead.");
      return false;
    }
    // tear down any existing
    try { recRef.current?.stop(); } catch {}

    const rec = new SR();
    rec.continuous = kind === "wake"; // wake mode listens continuously
    rec.interimResults = true;
    rec.lang = "en-GB";

    rec.onresult = (e: any) => {
      // Ignore mic input while TTS is playing (avoid self-trigger)
      if (speakingRef.current) return;

      let interim = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      const liveText = (finalText || interim).trim();
      if (kind === "command") setPartial(liveText);

      if (kind === "wake") {
        const heard = (finalText || interim);
        if (WAKE_PATTERNS.some(p => p.test(heard))) {
          // Switch to command mode
          wantRecRef.current = false;
          try { rec.stop(); } catch {}
          setPartial("");
          setPhase("speaking");
          const ack = WAKE_ACKS[Math.floor(Math.random() * WAKE_ACKS.length)];
          // Cheeky ack, then open the mic
          speak(ack).finally(() => {
            if (modeRef.current !== "always_on") return;
            setPhase("listening");
            setTimeout(() => startRecognition("command"), 150);
          });
        }
        return;
      }


      // command mode
      if (finalText) {
        const text = finalText.trim();
        setPartial("");
        wantRecRef.current = false;
        try { rec.stop(); } catch {}
        if (text) handleUserUtterance(text);
      }
    };

    rec.onend = () => {
      // auto-restart if still wanted (continuous wake listening)
      if (wantRecRef.current) {
        try { rec.start(); } catch {
          setTimeout(() => { try { rec.start(); } catch {} }, 300);
        }
      }
    };
    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        toast.error("Microphone permission denied.");
        endSession();
      }
    };

    recRef.current = rec;
    wantRecRef.current = kind === "wake";
    try { rec.start(); } catch {}
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endSession = useCallback(() => {
    stopRecognition();
    stopAudio();
    setMode("idle");
    setPhase("idle");
    setPartial("");
    awaitingFollowupRef.current = false;
  }, [stopRecognition, stopAudio]);

  const goSpeakAndFollowup = useCallback(async (answer: string) => {
    setPhase("speaking");
    await speak(answer);
    if ((modeRef.current as Mode) === "idle") return;

    // Ask the follow-up
    awaitingFollowupRef.current = true;
    setTurns(t => [...t, { role: "assistant", content: FOLLOWUP, ts: Date.now() }]);
    await speak(FOLLOWUP);
    if ((modeRef.current as Mode) === "idle") return;

    // Listen for the user's yes/no follow-up
    setPhase("listening");
    startRecognition("command");
  }, [speak, startRecognition]);

  const handleUserUtterance = useCallback(async (text: string) => {
    if (!venue) return;

    // Follow-up gating: detect "no/that's it" → close out
    if (awaitingFollowupRef.current) {
      awaitingFollowupRef.current = false;
      if (NEGATIVE_PATTERNS.some(p => p.test(text)) && text.split(/\s+/).length <= 6) {
        setTurns(t => [...t, { role: "user", content: text, ts: Date.now() }, { role: "assistant", content: SIGNOFF, ts: Date.now() }]);
        setPhase("speaking");
        await speak(SIGNOFF);
        if (modeRef.current === "always_on") {
          // back to wake listening
          setPhase("wake_listening");
          startRecognition("wake");
        } else {
          endSession();
        }
        return;
      }
      // otherwise, treat as a new question
    }

    setTurns(t => [...t, { role: "user", content: text, ts: Date.now() }]);
    setPhase("thinking");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manager-earpiece`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          venue_id: venue.id,
          question: text,
          history: turns.slice(-6).map(t => ({ role: t.role, content: t.content })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setTurns(t => [...t, { role: "assistant", content: json.answer, ts: Date.now() }]);
      setCtx(json.context_summary);
      await goSpeakAndFollowup(json.answer);
    } catch (e: any) {
      toast.error(e.message || "Ear-piece failed");
      setPhase("idle");
      if (modeRef.current === "always_on") {
        setPhase("wake_listening");
        startRecognition("wake");
      }
    }
  }, [venue, turns, speak, goSpeakAndFollowup, startRecognition, endSession]);

  // Ask for mic permission inside the user gesture (required on iOS/Android)
  const ensureMicPermission = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser can't access the microphone. Try Chrome or Safari.");
      return false;
    }
    if (!window.isSecureContext) {
      toast.error("Mic needs HTTPS. Open the published URL, not a local IP.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release immediately — SpeechRecognition opens its own stream
      stream.getTracks().forEach(t => t.stop());
      return true;
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        toast.error("Mic blocked. Tap the 🔒 in your browser bar → Site settings → allow Microphone, then retry.", { duration: 7000 });
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        toast.error("No microphone found on this device.");
      } else if (name === "NotReadableError") {
        toast.error("Microphone is in use by another app. Close it and try again.");
      } else {
        toast.error("Couldn't access the microphone: " + (err?.message || name || "unknown error"));
      }
      return false;
    }
  }, []);

  // Public actions ---------------------------------------------------------
  const startCall = async () => {
    if (mode === "call") { endSession(); return; }
    const ok = await ensureMicPermission();
    if (!ok) return;
    stopAudio();
    setMode("call");
    setPhase("listening");
    setPartial("");
    awaitingFollowupRef.current = false;
    startRecognition("command");
  };

  const toggleAlwaysOn = async () => {
    if (mode === "always_on") { endSession(); return; }
    const ok = await ensureMicPermission();
    if (!ok) return;
    stopAudio();
    setMode("always_on");
    setPhase("wake_listening");
    setPartial("");
    awaitingFollowupRef.current = false;
    startRecognition("wake");
  };


  const sendTyped = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setInput("");
    // typing acts like a call turn
    if (mode === "idle") setMode("call");
    handleUserUtterance(q);
  };

  // Cleanup on unmount
  useEffect(() => () => { stopRecognition(); stopAudio(); }, [stopRecognition, stopAudio]);

  const callActive = mode === "call";
  const alwaysOn = mode === "always_on";

  const statusLabel =
    phase === "wake_listening" ? 'Listening for "Hey Aijentik"…' :
    phase === "listening" ? "Listening…" :
    phase === "thinking" ? "Thinking…" :
    phase === "speaking" ? "Speaking…" : "Idle";

  return (
    <div>
      <PageHeader
        title="Manager Ear-Piece"
        subtitle="Your live AI co-pilot. Start a call or leave it always-on for hands-free service."
        actions={
          <div className="flex items-center gap-2">
            {ctx && (
              <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
                <span><b className="text-foreground">{ctx.covers}</b> covers</span>
                <span>·</span>
                <span><b className="text-foreground">{ctx.vips}</b> VIPs</span>
                <span>·</span>
                <span><b className="text-foreground">{ctx.pending_emails}</b> emails</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setMuted(m => !m)}>
              {muted ? <VolumeX className="w-4 h-4 mr-1.5" /> : <Volume2 className="w-4 h-4 mr-1.5" />}
              {muted ? "Muted" : "Voice on"}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Conversation */}
        <div className="rounded-2xl border border-white/[0.06] bg-card/40 overflow-hidden flex flex-col min-h-[60vh]">
          {/* Mode status bar */}
          {mode !== "idle" && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-primary/[0.04]">
              <div className="flex items-center gap-2 text-xs">
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${phase === "speaking" ? "bg-accent" : "bg-primary"} animate-ping`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${phase === "speaking" ? "bg-accent" : "bg-primary"}`} />
                </span>
                <span className="text-foreground font-medium">
                  {alwaysOn ? "Always-on" : "Live call"}
                </span>
                <span className="text-muted-foreground">· {statusLabel}</span>
              </div>
              <button
                onClick={endSession}
                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
              >
                <PhoneOff className="w-3.5 h-3.5" /> End
              </button>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
            {!turns.length && (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary/30 to-primary/5 flex items-center justify-center mb-4"
                >
                  <Headphones className="w-10 h-10 text-primary" />
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary/40"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                  />
                </motion.div>
                <h3 className="text-lg font-medium mb-1">Tap the mic to start a call.</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Or switch on Always-on and just say <span className="text-primary font-medium">"Hey Aijentik"</span> when you need me.
                </p>
              </div>
            )}
            <AnimatePresence initial={false}>
              {turns.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${t.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${
                    t.role === "user" ? "bg-white/[0.06]" : "bg-primary/15 text-primary"
                  }`}>
                    {t.role === "user" ? <Mic className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    t.role === "user"
                      ? "bg-white/[0.04] border border-white/[0.06]"
                      : "bg-primary/[0.06] border border-primary/20"
                  }`}>
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{t.content}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {partial && (
              <div className="flex flex-row-reverse gap-3">
                <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
                  <Mic className="w-4 h-4 text-primary" />
                </div>
                <div className="max-w-[80%] rounded-2xl px-4 py-2.5 bg-white/[0.02] border border-white/[0.04] italic text-muted-foreground">
                  {partial}
                </div>
              </div>
            )}
            {phase === "thinking" && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
                <div className="rounded-2xl px-4 py-2.5 bg-primary/[0.04] border border-primary/15 text-sm text-muted-foreground">
                  Listening to your venue…
                </div>
              </div>
            )}
          </div>

          {/* Always-on toggle row — clear & discoverable */}
          {mode !== "call" && (
            <div className="border-t border-white/[0.06] px-3 py-2.5 flex items-center justify-between gap-3 bg-background/30">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${alwaysOn ? "bg-accent/20 text-accent" : "bg-white/[0.04] text-muted-foreground"}`}>
                  <Ear className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium leading-tight">Always-on mode</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {alwaysOn ? 'Say "Hey Aijentik" to wake me' : 'Hands-free — wake with "Hey Aijentik"'}
                  </div>
                </div>
              </div>
              <button
                onClick={toggleAlwaysOn}
                role="switch"
                aria-checked={alwaysOn}
                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${alwaysOn ? "bg-accent" : "bg-white/10"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${alwaysOn ? "translate-x-5" : ""}`} />
              </button>
            </div>
          )}

          {/* Composer */}
          <div className="border-t border-white/[0.06] p-3 flex items-center gap-2 bg-background/40 backdrop-blur">
            {/* Call mic — primary action */}
            <button
              onClick={startCall}
              title={callActive ? "End call" : "Start call"}
              className={`h-11 rounded-full flex items-center justify-center gap-2 transition-all shrink-0 px-4 ${
                callActive
                  ? "bg-destructive/20 text-destructive ring-2 ring-destructive/40"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {callActive ? (
                <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Radio className="w-5 h-5" />
                </motion.div>
              ) : <Mic className="w-5 h-5" />}
              <span className="text-[13px] font-medium">{callActive ? "End" : "Call"}</span>
            </button>

            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTyped(input); } }}
              placeholder={
                phase === "listening" ? "Listening…" :
                phase === "wake_listening" ? 'Say "Hey Aijentik"…' :
                "Or type a question…"
              }
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/60 min-w-0"
            />
            <Button size="sm" onClick={() => sendTyped(input)} disabled={!input.trim() || phase === "thinking"}>
              <Send className="w-4 h-4" />
            </Button>
          </div>

        </div>

        {/* Quick prompts */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Try asking
            </div>
            <div className="space-y-1.5">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => sendTyped(p)}
                  disabled={phase === "thinking"}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] transition-colors disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 text-xs text-muted-foreground space-y-2">
            <div className="flex items-center gap-1.5 text-foreground font-medium">
              <Headphones className="w-3.5 h-3.5 text-primary" /> Two ways to use it
            </div>
            <p><b className="text-foreground">Call</b> (mic): tap once — I stay on, you ask anything, and I'll check if you need more before hanging up.</p>
            <p><b className="text-foreground">Always-on</b> (ear): I quietly listen for <span className="text-primary">"Hey Aijentik"</span>, then wake up and answer.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
