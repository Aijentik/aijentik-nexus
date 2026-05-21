import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, Mic, MicOff, Volume2, VolumeX, Sparkles, Send, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";

type Turn = { role: "user" | "assistant"; content: string; ts: number };

const QUICK_PROMPTS = [
  "How's tonight looking?",
  "Any VIPs in tonight?",
  "What needs my attention right now?",
  "Walk me through the next two hours.",
  "Any emails I need to handle?",
];

export default function ManagerEarpiece() {
  const { venue } = useAuth();
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState("");
  const [ctx, setCtx] = useState<{ bookings: number; covers: number; vips: number; pending_emails: number } | null>(null);
  const recRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" });
  }, [turns, partial]);

  const speak = async (text: string) => {
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
      if (json.audio_base64) {
        const audio = new Audio(`data:${json.mime};base64,${json.audio_base64}`);
        audioRef.current?.pause();
        audioRef.current = audio;
        audio.play().catch(() => {});
      }
    } catch {}
  };

  const ask = async (question: string) => {
    if (!venue || !question.trim()) return;
    setThinking(true);
    setInput("");
    const userTurn: Turn = { role: "user", content: question, ts: Date.now() };
    const next = [...turns, userTurn];
    setTurns(next);
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
          venue_id: venue.id, question,
          history: next.slice(-6).map(t => ({ role: t.role, content: t.content })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      const ans: Turn = { role: "assistant", content: json.answer, ts: Date.now() };
      setTurns(t => [...t, ans]);
      setCtx(json.context_summary);
      speak(json.answer);
    } catch (e: any) {
      toast.error(e.message || "Ear-piece failed");
    } finally {
      setThinking(false);
    }
  };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input not supported in this browser. Type instead.");
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-GB";
    rec.onresult = (e: any) => {
      let txt = "";
      for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript;
      setPartial(txt);
      if (e.results[e.results.length - 1].isFinal) {
        setPartial("");
        rec.stop();
        ask(txt);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); setPartial(""); };
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stopListening = () => { recRef.current?.stop(); setListening(false); };

  return (
    <div>
      <PageHeader
        title="Manager Ear-Piece"
        subtitle="Your live AI co-pilot. Ask anything — get whispered insight in seconds."
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
                <h3 className="text-lg font-medium mb-1">Tap the mic. Ask anything.</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  I see your live bookings, VIPs, emails and calls. Speak naturally — I'll whisper back.
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
            {thinking && (
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

          {/* Composer */}
          <div className="border-t border-white/[0.06] p-3 flex items-center gap-2 bg-background/40 backdrop-blur">
            <button
              onClick={listening ? stopListening : startListening}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 ${
                listening
                  ? "bg-destructive/20 text-destructive ring-2 ring-destructive/40"
                  : "bg-primary/15 text-primary hover:bg-primary/25"
              }`}
            >
              {listening ? (
                <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Radio className="w-5 h-5" />
                </motion.div>
              ) : <Mic className="w-5 h-5" />}
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
              placeholder={listening ? "Listening…" : "Or type a question…"}
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/60"
            />
            <Button size="sm" onClick={() => ask(input)} disabled={!input.trim() || thinking}>
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
                  onClick={() => ask(p)}
                  disabled={thinking}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] transition-colors disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 text-xs text-muted-foreground space-y-2">
            <div className="flex items-center gap-1.5 text-foreground font-medium">
              <Headphones className="w-3.5 h-3.5 text-primary" /> Designed for service
            </div>
            <p>Wear an AirPod. Tap the mic when you need a fast read of the room. The AI uses your live bookings, VIPs, emails and call history.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
