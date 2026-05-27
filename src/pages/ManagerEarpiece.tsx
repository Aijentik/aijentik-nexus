import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
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
type CaptureState = { active: boolean; buffer: string; live: string; timer: number | null; deadline: number | null };
type BrowserSpeechRecognitionResult = ArrayLike<{ transcript: string; confidence?: number }> & { isFinal: boolean };
type BrowserSpeechRecognitionEvent = { resultIndex: number; results: ArrayLike<BrowserSpeechRecognitionResult> };
type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

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
  /\b(h+ey|hay|hi|okay|ok|yo|oi|aye)[,\s-]+(?:agentic|agents?\s*(?:ic|ik|ick|tick|tech|take)?|ai\s*gentic|a\s*gentic|a?i?\s*j?ent[iy]?k|asian\s*tech|urgent\s*(?:ic|ick|tick|take)|authentic|agenda)\b/i,
  /\b(?:agentic|ai\s*gentic|a\s*gentic|aijentik|aijentic|ajentic|agent\s*(?:tick|take|tech|ic|ick)|urgent\s*(?:tick|take)|asian\s*tech)\b/i,
];
const WAKE_KEYTERMS = ["Hey Agentic", "Hey Aijentik", "Agentic", "Aijentik", "AI gentic", "agent", "agent tech", "agent tick", "agent take", "urgent tick", "asian tech"];
const NEGATIVE_PATTERNS = [/\bno\b/i, /\bthat'?s\s+(it|all)\b/i, /\bnothing\b/i, /\bi'?m\s+good\b/i, /\bwe'?re\s+good\b/i, /\bthanks?\b/i, /\bbye\b/i];
const WAKE_ACK = "Listening";
const FOLLOWUP = "Anything else I can help with?";
const SIGNOFF = "Okay — I'm here when you need me.";
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
const DEFAULT_MIN_WAKE_RMS = 0.0015;
const MIN_LISTENING_RMS = 0.003;
const BARGE_IN_RMS = 0.05;            // user voice loud enough to interrupt the agent
const BARGE_IN_FRAMES = 3;            // consecutive frames before we cut TTS
const CAPTURE_IDLE_MS = 450;
const WAKE_CAPTURE_TIMEOUT_MS = 9500;
const FOLLOWUP_PROMPT_DELAY_MS = 9000;
const FOLLOWUP_REPLY_TIMEOUT_MS = 12000;
const SPEECH_ECHO_SUPPRESS_MS = 1400;
const ASSISTANT_ECHO_MEMORY_MS = 45_000;
// Whisper-mode threshold: if the average mic RMS during capture is below this,
// the agent responds at a lower volume so it stays subtle on the service floor.
const WHISPER_RMS_AVG = 0.012;
const WHISPER_VOLUME = 0.45;
const NORMAL_VOLUME = 1.0;
// Personalised voice profile — adaptive wake threshold persisted per device.
const WAKE_PROFILE_KEY = "aijentik.earpiece.wakeProfile.v1";
const WAKE_TELEMETRY_KEY = "aijentik.earpiece.wakeTelemetry.v1";
const WAKE_TELEMETRY_MAX = 50;
const FILLER_ONLY_PATTERNS = [
  /^(hey|hay|hi|okay|ok|yo|oi|aye)\s*(agentic|agents?|agent\s*(?:ic|ick|tick|tech|take)?|ai\s*gentic|a\s*gentic|aijentik|aijentic)?$/i,
  /^(yes|yeah|yep|listening|go on|mhm|mm hmm|hello|hi)$/i,
];
const QUESTION_START_PATTERN = /^(who|what|when|where|why|how|which|any|is|are|am|can|could|should|would|do|does|did|will|walk|show|tell|check|find|move|book|seat)\b/i;

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
  t = t.replace(/^\s*(h+ey|hay|hi|okay|ok|yo|oi|aye)[,\s-]*(agentic|agents?\s*(?:ic|ik|ick|tick|tech|take)?|ai\s*gentic|a\s*gentic|aijentik|aijentic|ajentic|asian\s*tech|urgent\s*(?:ic|ick|tick|take)|authentic|agenda)\b/i, "");
  return t.replace(/^[\s,.\-!?:;]+/, "").trim();
}
function hasWake(text: string): boolean {
  if (WAKE_PATTERNS.some(p => p.test(text))) return true;
  const normalized = normalizeVoiceText(text);
  const compact = normalized.replace(/\s+/g, "");
  const hasPrefix = /\b(hey|hay|hi|okay|ok|yo|oi|aye)\b/.test(normalized);
  const hasAgentTerm = /\b(agentic|agents?|agent\s*(?:ic|ik|ick|tick|tech|take)|ai\s*gentic|a\s*gentic|agent\s*tech|aijentik|aijentic|ajentic|asian\s*tech|urgent\s*(?:ick|tick|take)|authentic|agenda)\b/.test(normalized);
  return (hasPrefix && hasAgentTerm)
    || /(hey|hay|hi|okay|ok|yo|oi|aye)?(agentic|aigentic|agentik|agentick|agenttick|agenttech|agenttake|agent|agents|aijentik|aijentic|ajentic|asiantech|urgentick|urgenttick|urgenttake)/.test(compact);
}

function hasUsableCommand(text: string, allowShort = false): boolean {
  const cleaned = stripWake(text).trim();
  const normalized = normalizeVoiceText(cleaned);
  if (!normalized) return false;
  if (FILLER_ONLY_PATTERNS.some(p => p.test(normalized))) return false;
  if (allowShort && NEGATIVE_PATTERNS.some(p => p.test(cleaned))) return true;
  if (QUESTION_START_PATTERN.test(normalized) && normalized.length >= 3) return true;
  return normalized.length >= 4 && /\b[a-z0-9]{3,}\b/i.test(normalized);
}

function mergeTranscript(existing: string, incoming: string): string {
  const a = stripWake(existing).trim();
  const b = stripWake(incoming).trim();
  const aFiller = !a || FILLER_ONLY_PATTERNS.some(p => p.test(normalizeVoiceText(a)));
  const bFiller = !b || FILLER_ONLY_PATTERNS.some(p => p.test(normalizeVoiceText(b)));
  if (aFiller && bFiller) return "";
  if (bFiller) return a;
  if (aFiller) return b;
  const na = normalizeVoiceText(a);
  const nb = normalizeVoiceText(b);
  if (na.includes(nb)) return a;
  if (nb.includes(na)) return b;

  const aWords = na.split(" ");
  const bWords = nb.split(" ");
  let sharedPrefix = 0;
  while (aWords[sharedPrefix] && aWords[sharedPrefix] === bWords[sharedPrefix]) sharedPrefix += 1;
  if (sharedPrefix >= 2 && QUESTION_START_PATTERN.test(na) && bWords.length >= Math.max(3, aWords.length - 1)) return b;

  for (let overlap = Math.min(aWords.length, bWords.length, 8); overlap >= 2; overlap -= 1) {
    if (aWords.slice(-overlap).join(" ") === bWords.slice(0, overlap).join(" ")) {
      return `${a} ${b.split(/\s+/).slice(overlap).join(" ")}`.trim();
    }
  }

  return `${a} ${b}`.trim();
}

function repairSpeechRevisions(text: string): string {
  const stripped = stripWake(text).trim();
  const normalized = normalizeVoiceText(stripped);
  if (!normalized || !QUESTION_START_PATTERN.test(normalized)) return stripped;

  const words = stripped.split(/\s+/).filter(Boolean);
  const normalizedWords = normalized.split(" ");
  if (normalizedWords.length < 5) return stripped;

  const restartIndexes = normalizedWords
    .map((word, index) => (QUESTION_START_PATTERN.test(word) ? index : -1))
    .filter(index => index > -1);
  if (restartIndexes.length >= 3) {
    const lastRestart = restartIndexes[restartIndexes.length - 1];
    const candidate = words.slice(lastRestart).join(" ").replace(/\b(hi|hello)\b/gi, " ").replace(/\s+/g, " ").trim();
    if (candidate.split(/\s+/).length >= 4 && hasUsableCommand(candidate, true)) return candidate;
  }

  for (const anchorSize of [3, 2]) {
    if (normalizedWords.length <= anchorSize + 2) continue;
    const anchor = normalizedWords.slice(0, anchorSize).join(" ");
    const starts: number[] = [];
    for (let i = 0; i <= normalizedWords.length - anchorSize; i += 1) {
      if (normalizedWords.slice(i, i + anchorSize).join(" ") === anchor) starts.push(i);
    }

    const lastStart = starts.length ? starts[starts.length - 1] : 0;
    const isImmediateRestart = starts.length === 2 && lastStart <= anchorSize + 1;
    const isRepeatedRevision = starts.length >= 3;
    if (lastStart > 0 && (isImmediateRestart || isRepeatedRevision)) {
      const candidate = words.slice(lastStart).join(" ").trim();
      if (hasUsableCommand(candidate, true)) return candidate;
    }
  }

  return stripped;
}

function captureCandidate(capture: CaptureState): string {
  return repairSpeechRevisions(mergeTranscript(capture.buffer, capture.live)).trim();
}

function stripRecentQuestionEcho(text: string, recentQuestions: string[]): string {
  let normalized = normalizeVoiceText(stripWake(text));
  if (!normalized) return "";

  const recent = [...recentQuestions]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  let changed = true;
  while (changed) {
    changed = false;
    for (const prev of recent) {
      if (normalized === prev) return "";
      if (normalized.startsWith(`${prev} `)) {
        normalized = normalized.slice(prev.length).trim();
        changed = true;
      }
    }
  }

  return normalized;
}

function isLikelyAssistantEcho(text: string, assistantEchoes: { normalized: string; at: number }[]): boolean {
  const normalized = normalizeVoiceText(stripWake(text));
  if (!normalized || normalized.split(" ").length < 3) return false;
  const now = Date.now();
  return assistantEchoes.some(entry => {
    if (now - entry.at > ASSISTANT_ECHO_MEMORY_MS) return false;
    if (entry.normalized === normalized) return true;
    if (entry.normalized.includes(normalized) && normalized.length >= 12) return true;
    return normalized.includes(entry.normalized) && entry.normalized.length >= 12;
  });
}

function rememberAssistantEcho(text: string, assistantEchoes: { normalized: string; at: number }[]) {
  const normalized = normalizeVoiceText(text);
  if (!normalized) return assistantEchoes;
  const now = Date.now();
  const words = normalized.split(" ");
  const snippets = words.length > 6
    ? Array.from({ length: Math.max(0, words.length - 5) }, (_, i) => words.slice(i, i + 6).join(" "))
    : [];
  return [{ normalized, at: now }, ...snippets.map(phrase => ({ normalized: phrase, at: now })), ...assistantEchoes]
    .filter((entry, index, all) => now - entry.at <= ASSISTANT_ECHO_MEMORY_MS && all.findIndex(e => e.normalized === entry.normalized) === index)
    .slice(0, 12);
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

// ---- Personalised voice profile (adaptive wake threshold) ----
function loadWakeProfile(): { minWakeRms: number } {
  try {
    const raw = localStorage.getItem(WAKE_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const v = Number(parsed?.minWakeRms);
      if (Number.isFinite(v) && v > 0.0003 && v < 0.01) return { minWakeRms: v };
    }
  } catch { /* ignore */ }
  return { minWakeRms: DEFAULT_MIN_WAKE_RMS };
}
function saveWakeProfile(p: { minWakeRms: number }) {
  try { localStorage.setItem(WAKE_PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
function logWakeTelemetry(entry: { ts: number; rms: number; threshold: number; text: string; accepted: boolean }) {
  try {
    const raw = localStorage.getItem(WAKE_TELEMETRY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push(entry);
    while (arr.length > WAKE_TELEMETRY_MAX) arr.shift();
    localStorage.setItem(WAKE_TELEMETRY_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

export default function ManagerEarpiece() {
  const { venue } = useAuth();
  const location = useLocation();
  const pageRef = useRef<string>(location.pathname);
  useEffect(() => { pageRef.current = location.pathname; }, [location.pathname]);
  const [mode, setMode] = useState<Mode>("idle");
  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState("");
  const [ctx, setCtx] = useState<{ bookings: number; covers: number; vips: number; pending_emails: number } | null>(null);
  const [liveLevel, setLiveLevel] = useState(0);                       // 0..1 mic energy for orb
  const [outLevel, setOutLevel] = useState(0);                         // 0..1 agent-speaking energy

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
  const followupPromptTimerRef = useRef<number | null>(null);
  const handleUserUtteranceRef = useRef<(text: string) => Promise<void>>(async () => undefined);
  const transcriptHandlerRef = useRef<(text: string, isFinal: boolean, source: "scribe" | "browser") => void>(() => undefined);
  const lastCommittedQuestionRef = useRef<{ normalized: string; at: number }>({ normalized: "", at: 0 });
  const recentQuestionNormsRef = useRef<string[]>([]);
  const recentAssistantEchoesRef = useRef<{ normalized: string; at: number }[]>([]);
  const ignoreSpeechUntilRef = useRef(0);
  const responseInFlightRef = useRef(false);
  const lastBrowserResultRef = useRef<{ index: number; text: string; isFinal: boolean }>({ index: -1, text: "", isFinal: false });
  const cleanupRef = useRef<() => void>(() => undefined);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioRef = useRef<HTMLAudioElement | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const browserRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const browserRecognitionRunningRef = useRef(false);
  const sendAudioRef = useRef<(audioBase64: string) => void>(() => undefined);
  const noiseFloorRef = useRef(0.004);
  const liveLevelRef = useRef(0);
  const liveLevelRafRef = useRef<number | null>(null);
  const bargeFramesRef = useRef(0);
  const ttsChainRef = useRef<Promise<void>>(Promise.resolve());        // sequential TTS queue
  const ttsCancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const chimeCtxRef = useRef<AudioContext | null>(null);
  // Personalised voice profile — adaptive wake threshold per device.
  const wakeProfileRef = useRef<{ minWakeRms: number }>(loadWakeProfile());
  // Whisper-mode detector: rolling RMS samples during a capture window.
  const captureRmsSumRef = useRef(0);
  const captureRmsCountRef = useRef(0);
  const captureWhisperRef = useRef(false);
  const lastWakeMeasurementRef = useRef<{ rms: number; threshold: number }>({ rms: 0, threshold: DEFAULT_MIN_WAKE_RMS });
  // Buffer for the user's question after wake detection
  const captureRef = useRef<CaptureState>({
    active: false, buffer: "", live: "", timer: null, deadline: null,
  });

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }); }, [turns, partial]);

  const setLivePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // ---- Sleek earcons (synthesized, instant, no API round-trip) ----
  const playChime = useCallback((kind: "wake" | "commit" | "end") => {
    try {
      const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      let ctx = chimeCtxRef.current;
      if (!ctx || ctx.state === "closed") { ctx = new Ctor(); chimeCtxRef.current = ctx; }
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime;
      const tones = kind === "wake" ? [[880, 1320, 0.10]] :
                    kind === "commit" ? [[1320, 1760, 0.07]] :
                    [[660, 440, 0.16]];
      tones.forEach(([from, to, dur]) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(from, now);
        osc.frequency.exponentialRampToValueAtTime(to, now + dur);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.16, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + dur + 0.04);
        osc.connect(gain).connect(ctx!.destination);
        osc.start(now);
        osc.stop(now + dur + 0.08);
      });
    } catch (e) { console.warn("chime failed", e); }
  }, []);


  const scheduleScribeReconnect = useCallback(() => {
    if (!desiredAlwaysOnRef.current || modeRef.current !== "always_on" || reconnectTimerRef.current) return;
    reconnectTimerRef.current = window.setTimeout(async () => {
      reconnectTimerRef.current = null;
      if (!desiredAlwaysOnRef.current || modeRef.current !== "always_on") return;
      setLivePhase("wake_listening");
      setPartial("");
      await connectScribeRef.current(true);
    }, 1200);
  }, [setLivePhase]);

  const clearFollowupTimer = useCallback(() => {
    if (!followupTimerRef.current) return;
    window.clearTimeout(followupTimerRef.current);
    followupTimerRef.current = null;
  }, []);

  const clearFollowupPromptTimer = useCallback(() => {
    if (!followupPromptTimerRef.current) return;
    window.clearTimeout(followupPromptTimerRef.current);
    followupPromptTimerRef.current = null;
  }, []);

  const resetCapture = useCallback(() => {
    if (captureRef.current.timer) window.clearTimeout(captureRef.current.timer);
    if (captureRef.current.deadline) window.clearTimeout(captureRef.current.deadline);
    captureRef.current = { active: false, buffer: "", live: "", timer: null, deadline: null };
  }, []);

  const startCapture = useCallback((initial = "", timeoutMs = WAKE_CAPTURE_TIMEOUT_MS) => {
    resetCapture();
    captureRef.current = { active: true, buffer: initial.trim(), live: "", timer: null, deadline: null };
    captureRef.current.deadline = window.setTimeout(() => {
      const q = captureCandidate(captureRef.current);
      resetCapture();
      if (hasUsableCommand(q, awaitingFollowupRef.current)) {
        setPartial(q);
        void handleUserUtteranceRef.current(stripWake(q));
        return;
      }
      setPartial("");
      if (modeRef.current === "always_on") {
        awaitingFollowupRef.current = false;
        setLivePhase("wake_listening");
      }
    }, timeoutMs);
  }, [resetCapture, setLivePhase]);

  const scheduleCaptureCommit = useCallback((delayMs = CAPTURE_IDLE_MS) => {
    if (captureRef.current.timer) window.clearTimeout(captureRef.current.timer);
    captureRef.current.timer = window.setTimeout(() => {
      const q = captureCandidate(captureRef.current);
      resetCapture();
      if (hasUsableCommand(q, awaitingFollowupRef.current)) {
        setPartial(q);
        void handleUserUtteranceRef.current(stripWake(q));
      } else if (modeRef.current === "always_on") {
        setPartial("");
        awaitingFollowupRef.current = false;
        setLivePhase("wake_listening");
      }
    }, delayMs);
  }, [resetCapture, setLivePhase]);

  const stopLiveLevelLoop = useCallback(() => {
    if (liveLevelRafRef.current != null) {
      cancelAnimationFrame(liveLevelRafRef.current);
      liveLevelRafRef.current = null;
    }
    liveLevelRef.current = 0;
    setLiveLevel(0);
  }, []);

  const startLiveLevelLoop = useCallback(() => {
    if (liveLevelRafRef.current != null) return;
    let lastFlush = 0;
    const tick = (t: number) => {
      if (t - lastFlush > 70) {
        lastFlush = t;
        setLiveLevel(liveLevelRef.current);
      }
      liveLevelRafRef.current = requestAnimationFrame(tick);
    };
    liveLevelRafRef.current = requestAnimationFrame(tick);
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
    stopLiveLevelLoop();
  }, [stopLiveLevelLoop]);

  const stopBrowserRecognition = useCallback(() => {
    const recognition = browserRecognitionRef.current;
    if (!recognition) return;
    browserRecognitionRunningRef.current = false;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    try { recognition.abort(); } catch { console.warn("browser speech abort failed"); }
    browserRecognitionRef.current = null;
  }, []);

  const startBrowserRecognition = useCallback((): boolean => {
    const SpeechRecognitionCtor = ((window as Window & {
      SpeechRecognition?: BrowserSpeechRecognitionCtor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
    }).SpeechRecognition || (window as Window & {
      webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
    }).webkitSpeechRecognition);
    if (!SpeechRecognitionCtor) return false;

    stopBrowserRecognition();
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;
    recognition.lang = "en-GB";
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (phaseRef.current === "wake_listening") {
          const alternatives: string[] = [];
          for (let j = 0; j < Math.min(result.length, 5); j += 1) {
            const transcript = result[j]?.transcript?.trim();
            if (transcript) alternatives.push(transcript);
          }
          const wakeText = alternatives.find(hasWake);
          if (wakeText) {
            transcriptHandlerRef.current(wakeText, result.isFinal, "browser");
            return;
          }
          continue;
        }

        {
          const best = result[0]?.transcript?.trim();
          if (i === lastBrowserResultRef.current.index
            && best === lastBrowserResultRef.current.text
            && result.isFinal === lastBrowserResultRef.current.isFinal) continue;
          lastBrowserResultRef.current = { index: i, text: best || "", isFinal: result.isFinal };
          if (best) transcriptHandlerRef.current(best, result.isFinal, "browser");
          continue;
        }
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        browserRecognitionRunningRef.current = false;
        return;
      }
      console.warn("browser speech recognition", event.error);
    };
    recognition.onend = () => {
      browserRecognitionRunningRef.current = false;
      if (!desiredAlwaysOnRef.current && modeRef.current !== "call") return;
      window.setTimeout(() => {
        if (!desiredAlwaysOnRef.current && modeRef.current !== "call") return;
        try {
          recognition.start();
          browserRecognitionRunningRef.current = true;
        } catch (e) {
          console.warn("browser speech restart failed", e);
        }
      }, 250);
    };

    browserRecognitionRef.current = recognition;
    try {
      recognition.start();
      browserRecognitionRunningRef.current = true;
      return true;
    } catch (e) {
      console.warn("browser speech start failed", e);
      return false;
    }
  }, [stopBrowserRecognition]);

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
          const input = event.inputBuffer.getChannelData(0);
          const rms = getRms(input);

          // Live level for breathing orb (smoothed)
          liveLevelRef.current = liveLevelRef.current * 0.7 + Math.min(1, rms * 8) * 0.3;

          // Barge-in: user starts speaking while agent is speaking → cut TTS
          if (speakingRef.current && rms > BARGE_IN_RMS) {
            bargeFramesRef.current += 1;
            if (bargeFramesRef.current >= BARGE_IN_FRAMES) {
              bargeFramesRef.current = 0;
              ttsCancelRef.current.cancelled = true;
              try { audioRef.current?.pause(); } catch { /* ignore */ }
              speakingRef.current = false;
              setOutLevel(0);
              setLivePhase("listening");
            }
          } else if (rms < BARGE_IN_RMS * 0.5) {
            bargeFramesRef.current = 0;
          }

          const threshold = phaseRef.current === "wake_listening"
            ? Math.max(0.0006, Math.min(wakeProfileRef.current.minWakeRms, noiseFloorRef.current * 0.85))
            : Math.max(MIN_LISTENING_RMS, noiseFloorRef.current * 1.15);

          if (rms < threshold) {
            noiseFloorRef.current = noiseFloorRef.current * 0.96 + rms * 0.04;
            return;
          }

          // Record loudness for whisper-mode detection while we're capturing a user question.
          if (captureRef.current.active || phaseRef.current === "listening") {
            captureRmsSumRef.current += rms;
            captureRmsCountRef.current += 1;
          }
          // Snapshot the latest above-threshold mic energy for wake telemetry.
          if (phaseRef.current === "wake_listening") {
            lastWakeMeasurementRef.current = { rms, threshold };
          }

          sendAudioRef.current(pcm16ToBase64(resampleTo16k(input, audioContext.sampleRate)));
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
      startLiveLevelLoop();
      return true;
    } catch (e) {
      stopMicStream();
      toast.error("Couldn't keep the microphone open: " + errorMessage(e));
      return false;
    }
  }, [stopMicStream, startLiveLevelLoop]);

  // -------- Scribe (ElevenLabs realtime STT) --------
  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: 0.38,
    vadThreshold: 0.58,
    minSpeechDurationMs: 160,
    minSilenceDurationMs: 220,
    languageCode: "en",
    keyterms: WAKE_KEYTERMS,
    noVerbatim: false,
    onSessionStarted: () => {
      if (desiredAlwaysOnRef.current && modeRef.current === "always_on" && phaseRef.current === "idle") {
        setLivePhase("wake_listening");
      }
    },
    onPartialTranscript: (data: ScribeTranscript) => {
      if (speakingRef.current) return;
      const text = (data?.text || "").trim();
      if (!text) return;
      transcriptHandlerRef.current(text, false, "scribe");
    },
    onCommittedTranscript: (data: ScribeTranscript) => {
      if (speakingRef.current) return;
      const text = (data?.text || "").trim();
      if (!text) return;
      transcriptHandlerRef.current(text, true, "scribe");
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
        vadSilenceThresholdSecs: 0.38,
        vadThreshold: 0.58,
        minSpeechDurationMs: 160,
        minSilenceDurationMs: 220,
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
    ttsCancelRef.current.cancelled = true;
    ttsChainRef.current = Promise.resolve();
    ignoreSpeechUntilRef.current = Date.now() + SPEECH_ECHO_SUPPRESS_MS;
    try { audioRef.current?.pause(); } catch { console.warn("audio pause failed"); }
    try { outputAudioRef.current?.pause(); } catch { console.warn("output audio pause failed"); }
    audioRef.current = null;
    speakingRef.current = false;
    setOutLevel(0);
  }, []);

  const unlockAudioOutput = useCallback(() => {
    if (outputAudioRef.current) return;
    const audio = new Audio(SILENT_WAV);
    audio.preload = "auto";
    audio.volume = 1;
    outputAudioRef.current = audio;
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
    }).catch(() => undefined);
  }, []);

  const speakWithBrowser = useCallback(async (text: string, suppressInput = true): Promise<void> => {
    if (!window.speechSynthesis) return;
    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1.05;
      utterance.volume = 1;
      if (suppressInput) speakingRef.current = true;
      ignoreSpeechUntilRef.current = Date.now() + SPEECH_ECHO_SUPPRESS_MS;
      utterance.onend = () => { ignoreSpeechUntilRef.current = Date.now() + SPEECH_ECHO_SUPPRESS_MS; if (suppressInput) speakingRef.current = false; resolve(); };
      utterance.onerror = () => { ignoreSpeechUntilRef.current = Date.now() + SPEECH_ECHO_SUPPRESS_MS; if (suppressInput) speakingRef.current = false; resolve(); };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  useEffect(() => {
    cleanupRef.current = () => {
      stopMicStream();
      void disconnectScribe();
      stopAudio();
    };
  }, [disconnectScribe, stopAudio, stopMicStream]);

  // Fetches a single TTS chunk (no playback). Used by both one-shot speak and streaming pipeline.
  const fetchTTSChunk = useCallback(async (text: string): Promise<{ b64: string; mime: string } | null> => {
    // Offline fallback: skip the network round-trip entirely so the agent still acks instantly.
    if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
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
      if (!res.ok || !json.audio_base64) return null;
      return { b64: json.audio_base64, mime: json.mime || "audio/mpeg" };
    } catch (e) { console.warn("fetchTTSChunk failed", e); return null; }
  }, []);

  const playB64 = useCallback(async (b64: string, mime: string): Promise<void> => {
    await new Promise<void>((resolve) => {
      const audio = outputAudioRef.current || new Audio();
      try { audioRef.current?.pause(); } catch { /* ignore */ }
      ignoreSpeechUntilRef.current = Date.now() + SPEECH_ECHO_SUPPRESS_MS;
      audio.src = `data:${mime};base64,${b64}`;
      // Whisper-mode: if the user spoke softly, the agent responds softly too.
      audio.volume = captureWhisperRef.current ? WHISPER_VOLUME : NORMAL_VOLUME;
      audioRef.current = audio;
      audio.onended = () => { ignoreSpeechUntilRef.current = Date.now() + SPEECH_ECHO_SUPPRESS_MS; resolve(); };
      audio.onerror = () => { ignoreSpeechUntilRef.current = Date.now() + SPEECH_ECHO_SUPPRESS_MS; resolve(); };
      audio.play().catch(() => resolve());
    });
  }, []);

  const speak = useCallback(async (text: string, suppressInput = true): Promise<void> => {
    if (muted) return;
    const chunk = await fetchTTSChunk(text);
    if (!chunk) { await speakWithBrowser(text, suppressInput); return; }
    if (suppressInput) { speakingRef.current = true; setOutLevel(0.6); }
    try { await playB64(chunk.b64, chunk.mime); }
    finally { if (suppressInput) { speakingRef.current = false; setOutLevel(0); } }
  }, [muted, fetchTTSChunk, playB64, speakWithBrowser]);

  // Enqueue a sentence into the sequential TTS chain (parallel fetch, sequential play).
  const enqueueSentence = useCallback((text: string) => {
    const cancelHandle = ttsCancelRef.current;
    const fetchP = muted ? Promise.resolve(null) : fetchTTSChunk(text);
    ttsChainRef.current = ttsChainRef.current.then(async () => {
      if (cancelHandle.cancelled || muted) return;
      const chunk = await fetchP;
      if (cancelHandle.cancelled) return;
      if (!chunk) { await speakWithBrowser(text, false); return; }
      setOutLevel(0.7);
      await playB64(chunk.b64, chunk.mime);
      setOutLevel(0.3);
    }).catch(e => console.warn("tts chain error", e));
  }, [muted, fetchTTSChunk, playB64, speakWithBrowser]);

  // -------- Conversation flow --------
  const handleWakeDetected = useCallback((heardText: string) => {
    if (phaseRef.current !== "wake_listening") return;
    clearFollowupTimer();
    clearFollowupPromptTimer();
    awaitingFollowupRef.current = false;

    // ---- Wake telemetry + adaptive voice profile ----
    const { rms: wakeRms, threshold: wakeThreshold } = lastWakeMeasurementRef.current;
    logWakeTelemetry({
      ts: Date.now(),
      rms: Number(wakeRms.toFixed(5)),
      threshold: Number(wakeThreshold.toFixed(5)),
      text: heardText.slice(0, 80),
      accepted: true,
    });
    // If the manager regularly fires the wake word at a quieter level than our threshold,
    // gently lower the threshold so they don't have to project. Clamp to a safe floor.
    if (wakeRms > 0 && wakeRms < wakeProfileRef.current.minWakeRms * 0.85) {
      const next = Math.max(0.0006, wakeProfileRef.current.minWakeRms * 0.92);
      wakeProfileRef.current = { minWakeRms: next };
      saveWakeProfile(wakeProfileRef.current);
    }

    setLivePhase("listening");
    lastBrowserResultRef.current = { index: -1, text: "", isFinal: false };
    const tail = stripWake(heardText);
    setPartial(hasUsableCommand(tail) ? tail : WAKE_ACK);
    // Reset whisper accumulator at the start of each capture window.
    captureRmsSumRef.current = 0;
    captureRmsCountRef.current = 0;
    captureWhisperRef.current = false;
    startCapture(tail);
    if (hasUsableCommand(tail)) {
      scheduleCaptureCommit(250);
    } else {
      playChime("wake"); // instant earcon instead of speaking "Yes?"
    }
  }, [clearFollowupPromptTimer, clearFollowupTimer, scheduleCaptureCommit, setLivePhase, startCapture, playChime]);


  useEffect(() => {
    transcriptHandlerRef.current = (rawText: string, isFinal: boolean) => {
      if (speakingRef.current) return;
      const text = rawText.trim();
      if (!text) return;
      const normalizedIncoming = normalizeVoiceText(stripWake(text));
      const looksLikeFreshQuestion = hasWake(text) || QUESTION_START_PATTERN.test(normalizedIncoming);
      if (isLikelyAssistantEcho(text, recentAssistantEchoesRef.current)) return;
      if (Date.now() < ignoreSpeechUntilRef.current && !looksLikeFreshQuestion) return;
      if (responseInFlightRef.current && !looksLikeFreshQuestion) return;

      if (phaseRef.current === "wake_listening") {
        if (hasWake(text)) {
          console.info("[earpiece] wake detected", text);
          handleWakeDetected(text);
        }
        return;
      }

      if (captureRef.current.active || phaseRef.current === "listening") {
        clearFollowupTimer();
        clearFollowupPromptTimer();
        const stripped = stripWake(text);
        const cleaned = stripRecentQuestionEcho(stripped, recentQuestionNormsRef.current);
        if (!cleaned && !hasWake(text)) return;

        if (hasWake(text) && !captureCandidate(captureRef.current)) {
          captureRef.current.buffer = mergeTranscript(captureRef.current.buffer, cleaned);
        } else if (isFinal) {
          captureRef.current.buffer = mergeTranscript(captureRef.current.buffer, cleaned);
          captureRef.current.live = "";
        } else {
          captureRef.current.live = mergeTranscript(captureRef.current.live, cleaned);
        }

        const candidate = captureCandidate(captureRef.current);
        setPartial(candidate || WAKE_ACK);
        if (hasUsableCommand(candidate, awaitingFollowupRef.current)) {
          const normalized = normalizeVoiceText(candidate);
          const looksComplete = isFinal || normalized.length > 24 || QUESTION_START_PATTERN.test(normalized);
          scheduleCaptureCommit(looksComplete ? 300 : CAPTURE_IDLE_MS);
        }
      }
    };
  }, [clearFollowupPromptTimer, clearFollowupTimer, handleWakeDetected, scheduleCaptureCommit]);

  const endSession = useCallback(async () => {
    clearFollowupTimer();
    clearFollowupPromptTimer();
    desiredAlwaysOnRef.current = false;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    resetCapture();
    stopBrowserRecognition();
    stopMicStream();
    await disconnectScribe();
    stopAudio();
    playChime("end");
    setMode("idle");
    setLivePhase("idle");
    setPartial("");
    awaitingFollowupRef.current = false;
  }, [clearFollowupPromptTimer, clearFollowupTimer, disconnectScribe, resetCapture, setLivePhase, stopAudio, stopBrowserRecognition, stopMicStream, playChime]);

  const armFollowup = useCallback(() => {
    if ((modeRef.current as Mode) === "idle") return;
    resetCapture();
    awaitingFollowupRef.current = true;
    setLivePhase("listening");
    setPartial("");
    startCapture("", FOLLOWUP_PROMPT_DELAY_MS + FOLLOWUP_REPLY_TIMEOUT_MS + 3500);

    clearFollowupPromptTimer();
    followupPromptTimerRef.current = window.setTimeout(() => {
      followupPromptTimerRef.current = null;
      if ((modeRef.current as Mode) === "idle" || !awaitingFollowupRef.current) return;
      if (hasUsableCommand(captureCandidate(captureRef.current), true)) return;
      void (async () => {
        setTurns(t => [...t, { role: "assistant", content: FOLLOWUP, ts: Date.now() }]);
        setLivePhase("speaking");
        await speak(FOLLOWUP);
        if ((modeRef.current as Mode) === "idle" || !awaitingFollowupRef.current) return;
        setLivePhase("listening");
        startCapture("", FOLLOWUP_REPLY_TIMEOUT_MS);
      })();
    }, FOLLOWUP_PROMPT_DELAY_MS);

    clearFollowupTimer();
    followupTimerRef.current = window.setTimeout(() => {
      if (!awaitingFollowupRef.current) return;
      if (hasUsableCommand(captureCandidate(captureRef.current), true)) return;
      if (modeRef.current === "always_on") {
        awaitingFollowupRef.current = false;
        resetCapture();
        setPartial("");
        setLivePhase("wake_listening");
      } else if (modeRef.current === "call") {
        void endSession();
      }
      followupTimerRef.current = null;
    }, FOLLOWUP_PROMPT_DELAY_MS + FOLLOWUP_REPLY_TIMEOUT_MS + 4500);
  }, [clearFollowupPromptTimer, clearFollowupTimer, endSession, resetCapture, setLivePhase, speak, startCapture]);

  const handleUserUtterance = useCallback(async (text: string) => {
    if (!venue) return;
    clearFollowupPromptTimer();
    clearFollowupTimer();
    resetCapture();

    const question = repairSpeechRevisions(stripRecentQuestionEcho(text, recentQuestionNormsRef.current));
    if (!hasUsableCommand(question, awaitingFollowupRef.current)) {
      setPartial("");
      if (modeRef.current === "always_on") setLivePhase("wake_listening");
      return;
    }

    const normalizedQuestion = normalizeVoiceText(question);
    const now = Date.now();
    if (lastCommittedQuestionRef.current.normalized === normalizedQuestion && now - lastCommittedQuestionRef.current.at < 3500) return;
    lastCommittedQuestionRef.current = { normalized: normalizedQuestion, at: now };
    recentQuestionNormsRef.current = [normalizedQuestion, ...recentQuestionNormsRef.current.filter(q => q !== normalizedQuestion)].slice(0, 4);

    if (awaitingFollowupRef.current) {
      awaitingFollowupRef.current = false;
      if (NEGATIVE_PATTERNS.some(p => p.test(question)) && question.split(/\s+/).length <= 6) {
        setTurns(t => [...t, { role: "user", content: question, ts: Date.now() }, { role: "assistant", content: SIGNOFF, ts: Date.now() }]);
        setLivePhase("speaking");
        recentAssistantEchoesRef.current = rememberAssistantEcho(SIGNOFF, recentAssistantEchoesRef.current);
        await speak(SIGNOFF);
        responseInFlightRef.current = false;
        if (modeRef.current === "always_on") {
          setLivePhase("wake_listening");
        } else {
          endSession();
        }
        return;
      }
    }

    // Finalise whisper-mode decision from the rolling RMS over this capture window.
    const avgRms = captureRmsCountRef.current > 0
      ? captureRmsSumRef.current / captureRmsCountRef.current
      : 0;
    captureWhisperRef.current = avgRms > 0 && avgRms < WHISPER_RMS_AVG;

    setTurns(t => [...t, { role: "user", content: question, ts: Date.now() }]);
    setPartial("");
    setLivePhase("thinking");
    responseInFlightRef.current = true;
    playChime("commit");

    // Offline fallback: if there's no network, ack via local TTS and bail gracefully.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const offlineMsg = "I'm offline right now — I'll catch up the moment we're back.";
      setTurns(t => [...t, { role: "assistant", content: offlineMsg, ts: Date.now() }]);
      setLivePhase("speaking");
      recentAssistantEchoesRef.current = rememberAssistantEcho(offlineMsg, recentAssistantEchoesRef.current);
      await speakWithBrowser(offlineMsg, true);
      responseInFlightRef.current = false;
      armFollowup();
      return;
    }

    // Prep a streaming TTS session
    ttsCancelRef.current = { cancelled: false };
    const cancelHandle = ttsCancelRef.current;
    ttsChainRef.current = Promise.resolve();
    speakingRef.current = true;
    setOutLevel(0.4);

    let assistantTurnIndex = -1;
    const appendAssistantDelta = (delta: string) => {
      setTurns(t => {
        if (assistantTurnIndex === -1 || t[assistantTurnIndex]?.role !== "assistant") {
          assistantTurnIndex = t.length;
          return [...t, { role: "assistant", content: delta, ts: Date.now() }];
        }
        const copy = t.slice();
        copy[assistantTurnIndex] = { ...copy[assistantTurnIndex], content: copy[assistantTurnIndex].content + delta };
        return copy;
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manager-earpiece`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ venue_id: venue.id, question, page: pageRef.current }),
      });
      if (!res.ok || !res.body) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Stream failed: ${res.status}`);
      }

      // Pull the live context summary from response header (base64-encoded JSON)
      const ctxHeader = res.headers.get("X-Earpiece-Context");
      if (ctxHeader) { try { setCtx(JSON.parse(atob(ctxHeader))); } catch { /* ignore */ } }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";
      let spokenIndex = 0;
      let firstSpoken = false;

      const flushSentences = (force: boolean) => {
        // Speak as soon as we have a meaningful clause so the first audio
        // arrives before the LLM finishes the full sentence.
        // - For the very first chunk, flush at the first comma/clause-end ≥ 18 chars.
        // - After that, flush on sentence-ending punctuation as normal.
        while (true) {
          const remainder = fullAnswer.slice(spokenIndex);
          if (!remainder.trim()) return;
          const earlyPattern = !firstSpoken
            ? /^([\s\S]{18,}?[,;:.!?…])(\s|$)/
            : /^([\s\S]*?[.!?…][\s")\]]*)(\s|$)/;
          const m = remainder.match(earlyPattern);
          if (m) {
            const sentence = m[1].trim();
            spokenIndex += m[0].length;
            if (sentence) {
              if (!firstSpoken) { firstSpoken = true; setLivePhase("speaking"); }
              enqueueSentence(sentence);
            }
          } else if (force) {
            const tail = remainder.trim();
            if (tail) {
              if (!firstSpoken) { firstSpoken = true; setLivePhase("speaking"); }
              enqueueSentence(tail);
            }
            spokenIndex = fullAnswer.length;
            return;
          } else {
            return;
          }
        }
      };


      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (cancelHandle.cancelled) { try { reader.cancel(); } catch { /* ignore */ } break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta: string = parsed.choices?.[0]?.delta?.content || "";
            if (delta) {
              fullAnswer += delta;
              appendAssistantDelta(delta);
              flushSentences(false);
            }
          } catch { /* skip malformed */ }
        }
      }
      flushSentences(true);
      recentAssistantEchoesRef.current = rememberAssistantEcho(fullAnswer, recentAssistantEchoesRef.current);

      // Wait for TTS queue to drain (or barge-in cancellation)
      await ttsChainRef.current;
      speakingRef.current = false;
      setOutLevel(0);

      if (cancelHandle.cancelled) {
        // User barged in — go straight to listening
        responseInFlightRef.current = false;
        if (modeRef.current === "always_on") setLivePhase("wake_listening");
        return;
      }
      responseInFlightRef.current = false;
      armFollowup();
    } catch (e: unknown) {
      speakingRef.current = false;
      responseInFlightRef.current = false;
      setOutLevel(0);
      toast.error(errorMessage(e) || "Ear-piece failed");
      setLivePhase(modeRef.current === "always_on" ? "wake_listening" : "idle");
    }
  }, [venue, clearFollowupPromptTimer, clearFollowupTimer, resetCapture, setLivePhase, speak, speakWithBrowser, armFollowup, endSession, enqueueSentence, playChime]);

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
    setLivePhase("listening");
    unlockAudioOutput();
    stopAudio();
    startBrowserRecognition();
    const micReady = await startMicStream();
    if (!micReady) { stopBrowserRecognition(); return; }
    setMode("call");
    setLivePhase("listening");
    setPartial("");
    awaitingFollowupRef.current = false;
    startCapture("", 30000);
    const connected = await connectScribe();
    if (!connected) { endSession(); }
  };

  const toggleAlwaysOn = async () => {
    if (mode === "always_on") { endSession(); return; }
    if (!canUseMic()) return;
    desiredAlwaysOnRef.current = true;
    modeRef.current = "always_on";
    setLivePhase("wake_listening");
    unlockAudioOutput();
    stopAudio();
    startBrowserRecognition();
    const micReady = await startMicStream();
    if (!micReady) { desiredAlwaysOnRef.current = false; stopBrowserRecognition(); return; }
    setMode("always_on");
    setLivePhase("wake_listening");
    setPartial("");
    awaitingFollowupRef.current = false;
    resetCapture();
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

          {mode !== "idle" && (
            <div className="flex flex-col items-center pt-5 pb-3 select-none">
              {(() => {
                const speaking = phase === "speaking";
                const level = speaking ? Math.max(0.35, outLevel) : liveLevel;
                const scale = 1 + level * 0.35;
                const ringOpacity = 0.25 + level * 0.55;
                return (
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    <div
                      className={`absolute inset-0 rounded-full blur-2xl transition-colors ${speaking ? "bg-accent/40" : "bg-primary/40"}`}
                      style={{ transform: `scale(${scale * 1.1})`, opacity: 0.35 + level * 0.4 }}
                    />
                    <div
                      className={`absolute inset-0 rounded-full border ${speaking ? "border-accent/60" : "border-primary/60"}`}
                      style={{ transform: `scale(${scale})`, opacity: ringOpacity, transition: "transform 80ms linear, opacity 80ms linear" }}
                    />
                    <div
                      className={`absolute inset-2 rounded-full ${speaking ? "bg-accent/20" : "bg-primary/20"}`}
                      style={{ transform: `scale(${1 + level * 0.18})`, transition: "transform 80ms linear" }}
                    />
                    <div className={`relative w-12 h-12 rounded-full grid place-items-center ${speaking ? "bg-accent/30 text-accent" : "bg-primary/30 text-primary"}`}>
                      {phase === "thinking" ? <Loader2 className="w-5 h-5 animate-spin" /> :
                       speaking ? <Volume2 className="w-5 h-5" /> :
                       phase === "wake_listening" ? <Ear className="w-5 h-5" /> :
                       <Mic className="w-5 h-5" />}
                    </div>
                  </div>
                );
              })()}
              <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {statusLabel}
              </div>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
            {!turns.length && mode === "idle" && (
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
