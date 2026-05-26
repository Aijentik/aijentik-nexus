import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, Mic, Volume2, VolumeX, Sparkles, Send, Loader2, Radio, Ear, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { useScribe, CommitStrategy, AudioFormat } from "@elevenlabs/react";

type Turn = { role: "user" | "assistant"; content: string; ts: number };
type Mode = "idle" | "call" | "always_on";
type Phase = "idle" | "wake_listening" | "listening" | "thinking" | "speaking";
type ScribeTranscript = { text?: string };

const QUICK_PROMPTS = [
  "How's tonight looking?",
  "Any VIPs in tonight?",
  "What needs my attention right now?",
  "Walk me through the next two hours.",
  "Any emails I need to handle?",
];

// Spoken wake phrase uses the real word "Agentic" for STT reliability.
// Keep the visible brand phrase as "Aijentik" in the UI because it sounds the same.
const WAKE_PATTERNS = [
  /\b(h+ey|hay|hi|okay|ok)[,\s-]+agentic\b/i,
  /\b(h+ey|hay|hi|okay|ok)[,\s-]+agent\s*ic\b/i,
  /\b(h+ey|hay|hi|okay|ok)[,\s-]+agent\s*tech\b/i,
  /\b(h+ey|hay|hi|okay|ok)[,\s-]+ai\s*gentic\b/i,
  /\b(h+ey|hay|hi|okay|ok)[,\s-]+a\s*gentic\b/i,
  /\b(h+ey|hay|hi|okay|ok)[,\s-]+a?i?\s*j?ent[iy]?k\b/i,
];
const WAKE_KEYTERMS = ["Hey Agentic", "Agentic", "agentic", "AI gentic", "agent tech"];
const WAKE_ACKS = ["Yesss?", "Mhm?", "Go on…", "Yep, listening.", "Hit me.", "I'm all ears.", "Yes boss?"];
const NEGATIVE_PATTERNS = [/\bno\b/i, /\bthat'?s\s+(it|all)\b/i, /\bnothing\b/i, /\bi'?m\s+good\b/i, /\bwe'?re\s+good\b/i, /\bthanks?\b/i, /\bbye\b/i];
const FOLLOWUP = "Anything else I can help with?";
const SIGNOFF = "Okay — I'm here when you need me.";
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
const MIN_WAKE_RMS = 0.026;
const MIN_LISTENING_RMS = 0.018;

function normalizeVoiceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Strip the wake phrase off the front of an utterance so "Hey Aijentik, what's tonight?" → "what's tonight?"
function stripWake(text: string): string {
  let t = text;
  for (const p of WAKE_PATTERNS) t = t.replace(p, "");
  t = t.replace(/^\s*(h+ey|hay|hi|okay|ok)[,\s-]*(agentic|agent\s*ic|agent\s*tech|ai\s*gentic|a\s*gentic|aijentik|aijentic)\b/i, "");
  return t.replace(/^[\s,.\-!?:;]+/, "").trim();
}
function hasWake(text: string): boolean {
  if (WAKE_PATTERNS.some(p => p.test(text))) return true;
  const normalized = normalizeVoiceText(text);
  const compact = normalized.replace(/\s+/g, "");
  return /\b(hey|hay|hi|okay|ok)\s+(agentic|agent\s*ic|ai\s*gentic|a\s*gentic|agent\s*tech|aijentik|aijentic)\b/.test(normalized)
    || /(hey|hay|hi|okay|ok)(agentic|agentic|aigentic|agenttech|aijentik|aijentic)/.test(compact);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err || "");
}

function errorName(err: unknown): string {
  return err instanceof DOMException ? err.name : err instanceof Error && "name" in err ? err.name : "";
}

function pcm16ToBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const sourceIndex = i * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(input.length - 1, left + 1);
    const weight = sourceIndex - left;
    output[i] = input[left] * (1 - weight) + input[right] * weight;
  }
  return output;
}

function getRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

export default function ManagerEarpiece() {
  const { venue } = useAuth();
  const [mode, setMode] = useState<Mode>("idle");
  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState("");
  const [ctx, setCtx] = useState<{ bookings: number; covers: number; vips: number; pending_emails: number } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<Mode>("idle");
  const phaseRef = useRef<Phase>("idle");
  const awaitingFollowupRef = useRef(false);
  const speakingRef = useRef(false);
  const desiredAlwaysOnRef = useRef(false);
  const connectInFlightRef = useRef<Promise<boolean> | null>(null);
  const connectScribeRef = useRef<(silent?: boolean) => Promise<boolean>>(async () => false);
  const reconnectTimerRef = useRef<number | null>(null);
  const followupTimerRef = useRef<number | null>(null);
  const handleUserUtteranceRef = useRef<(text: string) => Promise<void>>(async () => undefined);
  const cleanupRef = useRef<() => void>(() => undefined);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sendAudioRef = useRef<(audioBase64: string) => void>(() => undefined);
  // Buffer for the user's question after wake detection
  const captureRef = useRef<{ active: boolean; buffer: string; timer: number | null }>({
    active: false, buffer: "", timer: null,
  });

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }); }, [turns, partial]);

  const scheduleScribeReconnect = useCallback(() => {
    if (!desiredAlwaysOnRef.current || modeRef.current !== "always_on" || reconnectTimerRef.current) return;
    reconnectTimerRef.current = window.setTimeout(async () => {
      reconnectTimerRef.current = null;
      if (!desiredAlwaysOnRef.current || modeRef.current !== "always_on") return;
      setPhase("wake_listening");
      setPartial("");
      await connectScribeRef.current(true);
    }, 1200);
  }, []);

  const clearFollowupTimer = useCallback(() => {
    if (!followupTimerRef.current) return;
    window.clearTimeout(followupTimerRef.current);
    followupTimerRef.current = null;
  }, []);

  const stopMicStream = useCallback(() => {
    try { micProcessorRef.current?.disconnect(); } catch { console.warn("mic processor disconnect failed"); }
    try { micSourceRef.current?.disconnect(); } catch { console.warn("mic source disconnect failed"); }
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
    micProcessorRef.current = null;
    micSourceRef.current = null;
    micStreamRef.current = null;
    audioContextRef.current = null;
  }, []);

  const startMicStream = useCallback(async (): Promise<boolean> => {
    if (micStreamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: { ideal: 16000 },
        },
      });
      const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("This browser can't start live microphone audio.");
      const audioContext = new AudioContextCtor();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = event => {
        if (!desiredAlwaysOnRef.current && modeRef.current !== "call") return;
        try {
          sendAudioRef.current(pcm16ToBase64(resampleTo16k(event.inputBuffer.getChannelData(0), audioContext.sampleRate)));
        } catch (e) {
          console.warn("mic chunk send failed", e);
        }
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      if (audioContext.state === "suspended") await audioContext.resume();
      micStreamRef.current = stream;
      audioContextRef.current = audioContext;
      micSourceRef.current = source;
      micProcessorRef.current = processor;
      return true;
    } catch (e) {
      stopMicStream();
      toast.error("Couldn't keep the microphone open: " + errorMessage(e));
      return false;
    }
  }, [stopMicStream]);

  // -------- Scribe (ElevenLabs realtime STT) --------
  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: 0.8,
    vadThreshold: 0.65,
    minSpeechDurationMs: 120,
    minSilenceDurationMs: 350,
    languageCode: "en",
    keyterms: WAKE_KEYTERMS,
    noVerbatim: false,
    onSessionStarted: () => {
      if (desiredAlwaysOnRef.current && modeRef.current === "always_on" && phaseRef.current === "idle") {
        setPhase("wake_listening");
      }
    },
    onPartialTranscript: (data: ScribeTranscript) => {
      if (speakingRef.current) return;
      const text = (data?.text || "").trim();
      if (!text) return;
      // Only show partials when we're capturing a question
      if (captureRef.current.active || phaseRef.current === "listening") {
        setPartial(text);
      }
      // Allow wake to fire from partials too (faster reaction)
      if (phaseRef.current === "wake_listening" && hasWake(text)) {
        handleWakeDetected(text);
      }
    },
    onCommittedTranscript: (data: ScribeTranscript) => {
      if (speakingRef.current) return;
      const text = (data?.text || "").trim();
      if (!text) return;

      // Always-on wake stage
      if (phaseRef.current === "wake_listening") {
        if (hasWake(text)) handleWakeDetected(text);
        return;
      }

      // Command capture (call mode OR after wake)
      if (captureRef.current.active || phaseRef.current === "listening") {
        clearFollowupTimer();
        captureRef.current.buffer = (captureRef.current.buffer + " " + text).trim();
        setPartial(captureRef.current.buffer);
        // Debounce — assume user is done if no new committed segment in 900ms
        if (captureRef.current.timer) window.clearTimeout(captureRef.current.timer);
        captureRef.current.timer = window.setTimeout(() => {
          const q = captureRef.current.buffer.trim();
          captureRef.current = { active: false, buffer: "", timer: null };
          setPartial("");
          if (q) void handleUserUtteranceRef.current(q);
        }, 900);
      }
    },
    onError: (err: unknown) => {
      console.error("[scribe]", err);
      if (desiredAlwaysOnRef.current && modeRef.current === "always_on") scheduleScribeReconnect();
    },
    onDisconnect: () => {
      if (desiredAlwaysOnRef.current && modeRef.current === "always_on") scheduleScribeReconnect();
    },
  });

  const connectScribe = useCallback(async (silent = false): Promise<boolean> => {
    if (connectInFlightRef.current) return connectInFlightRef.current;
    connectInFlightRef.current = (async () => {
    try {
      if (scribe.isConnected || scribe.status === "connecting") return true;
      if (scribe.status === "error") {
        try { scribe.disconnect(); } catch { console.warn("scribe disconnect after error failed"); }
      }
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scribe-token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const json = await res.json();
      if (!json.token) throw new Error(json.error || "no token");
      await scribe.connect({
        token: json.token,
        commitStrategy: CommitStrategy.VAD,
        vadSilenceThresholdSecs: 0.8,
        vadThreshold: 0.65,
        minSpeechDurationMs: 120,
        minSilenceDurationMs: 350,
        languageCode: "en",
        keyterms: WAKE_KEYTERMS,
        noVerbatim: false,
        audioFormat: AudioFormat.PCM_16000,
        sampleRate: 16000,
      });
      return true;
    } catch (e: unknown) {
      console.error("scribe connect failed", e);
      if (!silent) toast.error("Voice service couldn't start. " + errorMessage(e));
      return false;
    } finally {
      connectInFlightRef.current = null;
    }
    })();
    return connectInFlightRef.current;
  }, [scribe]);

  useEffect(() => { connectScribeRef.current = connectScribe; }, [connectScribe]);
  useEffect(() => { sendAudioRef.current = scribe.sendAudio; }, [scribe.sendAudio]);

  const disconnectScribe = useCallback(async () => {
    try { await scribe.disconnect(); } catch { console.warn("scribe disconnect failed"); }
  }, [scribe]);

  // -------- TTS --------
  const stopAudio = useCallback(() => {
    try { audioRef.current?.pause(); } catch { console.warn("audio pause failed"); }
    audioRef.current = null;
    speakingRef.current = false;
  }, []);

  useEffect(() => {
    cleanupRef.current = () => {
      stopMicStream();
      void disconnectScribe();
      stopAudio();
    };
  }, [disconnectScribe, stopAudio, stopMicStream]);

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
    } catch (e: unknown) {
      console.warn("earpiece TTS failed", e);
      speakingRef.current = false;
    }
  }, [muted]);

  // -------- Conversation flow --------
  const handleWakeDetected = useCallback((heardText: string) => {
    if (phaseRef.current !== "wake_listening") return;
    setPhase("speaking");
    setPartial("");
    // If the user packed the question into the same utterance, capture the tail
    const tail = stripWake(heardText);
    captureRef.current = { active: true, buffer: tail, timer: null };

    const ack = WAKE_ACKS[Math.floor(Math.random() * WAKE_ACKS.length)];
    speak(ack).finally(() => {
      if (modeRef.current !== "always_on") return;
      setPhase("listening");
      // If we already have a non-empty tail, give VAD a moment then commit
      if (captureRef.current.buffer.trim().length > 2) {
        if (captureRef.current.timer) window.clearTimeout(captureRef.current.timer);
        captureRef.current.timer = window.setTimeout(() => {
          const q = captureRef.current.buffer.trim();
          captureRef.current = { active: false, buffer: "", timer: null };
          setPartial("");
          if (q) void handleUserUtteranceRef.current(q);
        }, 1200);
      }
    });
  }, [speak]);

  const endSession = useCallback(async () => {
    clearFollowupTimer();
    desiredAlwaysOnRef.current = false;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (captureRef.current.timer) window.clearTimeout(captureRef.current.timer);
    captureRef.current = { active: false, buffer: "", timer: null };
    stopMicStream();
    await disconnectScribe();
    stopAudio();
    setMode("idle");
    setPhase("idle");
    setPartial("");
    awaitingFollowupRef.current = false;
  }, [clearFollowupTimer, disconnectScribe, stopAudio, stopMicStream]);

  const goSpeakAndFollowup = useCallback(async (answer: string) => {
    setPhase("speaking");
    await speak(answer);
    if ((modeRef.current as Mode) === "idle") return;

    awaitingFollowupRef.current = true;
    setTurns(t => [...t, { role: "assistant", content: FOLLOWUP, ts: Date.now() }]);
    await speak(FOLLOWUP);
    if ((modeRef.current as Mode) === "idle") return;

    setPhase("listening");
    captureRef.current = { active: true, buffer: "", timer: null };
    if (modeRef.current === "always_on") {
      clearFollowupTimer();
      followupTimerRef.current = window.setTimeout(() => {
        if (modeRef.current !== "always_on" || !awaitingFollowupRef.current) return;
        awaitingFollowupRef.current = false;
        captureRef.current = { active: false, buffer: "", timer: null };
        setPartial("");
        setPhase("wake_listening");
        followupTimerRef.current = null;
      }, 6500);
    }
  }, [clearFollowupTimer, speak]);

  const handleUserUtterance = useCallback(async (text: string) => {
    if (!venue) return;

    if (awaitingFollowupRef.current) {
      awaitingFollowupRef.current = false;
      clearFollowupTimer();
      if (NEGATIVE_PATTERNS.some(p => p.test(text)) && text.split(/\s+/).length <= 6) {
        setTurns(t => [...t, { role: "user", content: text, ts: Date.now() }, { role: "assistant", content: SIGNOFF, ts: Date.now() }]);
        setPhase("speaking");
        await speak(SIGNOFF);
        if (modeRef.current === "always_on") {
          setPhase("wake_listening");
        } else {
          endSession();
        }
        return;
      }
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
    } catch (e: unknown) {
      toast.error(errorMessage(e) || "Ear-piece failed");
      setPhase(modeRef.current === "always_on" ? "wake_listening" : "idle");
    }
  }, [venue, turns, clearFollowupTimer, speak, goSpeakAndFollowup, endSession]);

  useEffect(() => { handleUserUtteranceRef.current = handleUserUtterance; }, [handleUserUtterance]);

  // -------- Mic permission --------
  const canUseMic = useCallback((): boolean => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser can't access the microphone.");
      return false;
    }
    if (!window.isSecureContext) {
      toast.error("Mic needs HTTPS. Open the published URL.");
      return false;
    }
    return true;
  }, []);

  // -------- Public actions --------
  const startCall = async () => {
    if (mode === "call") { endSession(); return; }
    if (!canUseMic()) return;
    desiredAlwaysOnRef.current = false;
    modeRef.current = "call";
    phaseRef.current = "listening";
    stopAudio();
    const micReady = await startMicStream();
    if (!micReady) return;
    setMode("call");
    setPhase("listening");
    setPartial("");
    awaitingFollowupRef.current = false;
    captureRef.current = { active: true, buffer: "", timer: null };
    const connected = await connectScribe();
    if (!connected) { endSession(); }
  };

  const toggleAlwaysOn = async () => {
    if (mode === "always_on") { endSession(); return; }
    if (!canUseMic()) return;
    desiredAlwaysOnRef.current = true;
    modeRef.current = "always_on";
    phaseRef.current = "wake_listening";
    stopAudio();
    const micReady = await startMicStream();
    if (!micReady) { desiredAlwaysOnRef.current = false; return; }
    setMode("always_on");
    setPhase("wake_listening");
    setPartial("");
    awaitingFollowupRef.current = false;
    captureRef.current = { active: false, buffer: "", timer: null };
    const connected = await connectScribe();
    if (!connected) { endSession(); }
  };

  const sendTyped = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setInput("");
    if (mode === "idle") setMode("call");
    handleUserUtterance(q);
  };

  useEffect(() => () => { cleanupRef.current(); }, []);

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
        <div className="rounded-2xl border border-white/[0.06] bg-card/40 overflow-hidden flex flex-col min-h-[60vh]">
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
              <button onClick={endSession} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
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

          <div className="border-t border-white/[0.06] p-3 flex items-center gap-2 bg-background/40 backdrop-blur">
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
            <p><b className="text-foreground">Always-on</b> (ear): I quietly listen for <span className="text-primary">"Hey Aijentik"</span>, then wake up and answer. Works on iPhone too.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
