import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type Msg = { role: "user" | "assistant"; content: string };

const PROMPTS = [
  "What's our policy on large parties?",
  "Suggest an upsell for table 5",
  "Draft a reply to a complaint about the wait time",
  "Summarise tonight's covers",
];

export function StaffCopilot() {
  const { venue, session } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || !venue) return;
    const next = [...messages, { role: "user" as const, content: value }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-chat`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ venue_id: venue.id, messages: next }),
      });
      if (!res.ok || !res.body) throw new Error("chat failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let assistant = "";
      setMessages(m => [...m, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") continue;
          try {
            const p = JSON.parse(json);
            const c = p.choices?.[0]?.delta?.content;
            if (c) {
              assistant += c;
              setMessages(m => m.map((mm, i) => i === m.length - 1 ? { ...mm, content: assistant } : mm));
            }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Sorry — I couldn't reach the AI just now." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!venue) return null;

  return (
    <>
      {/* Floating Jarvis trigger */}
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.04, y: -2 }}
        whileTap={{ scale: 0.96 }}
        className="fixed bottom-6 right-6 z-40 group"
      >
        <span className="absolute -inset-2 rounded-full blur-xl opacity-60 animate-aura"
          style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.55), transparent 70%)" }} />
        <span className="relative flex items-center gap-2.5 h-12 px-5 rounded-full
          bg-[hsl(28_18%_5%_/_0.85)] backdrop-blur-xl
          border border-primary/40
          shadow-[0_12px_40px_-8px_hsl(0_0%_0%_/_0.6),0_0_30px_-4px_hsl(var(--primary)/0.5),0_1px_0_hsl(36_100%_90%_/_0.1)_inset]
          group-hover:border-primary/70 transition-all">
          <span className="relative flex h-6 w-6 rounded-full grid place-items-center"
            style={{ background: "radial-gradient(circle at 35% 30%, hsl(38 100% 78%), hsl(32 96% 58%) 50%, hsl(22 88% 42%))" }}>
            <Sparkles className="h-3 w-3 text-primary-foreground" strokeWidth={2.4} />
            <span className="absolute inset-0 rounded-full border border-primary/40 animate-ring-out" />
          </span>
          <span className="text-sm font-medium tracking-tight">Ask Copilot</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:inline border-l border-white/10 pl-2.5">
            ⌘K
          </span>
        </span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ y: 30, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", damping: 26, stiffness: 240 }}
              className="fixed bottom-6 right-6 z-50 w-full sm:w-[440px] h-[600px] flex flex-col
                bg-[hsl(28_18%_6%_/_0.92)] backdrop-blur-2xl
                rounded-3xl border border-white/10
                shadow-[0_40px_100px_-20px_hsl(0_0%_0%_/_0.8),0_0_60px_-10px_hsl(var(--primary)/0.3),0_1px_0_hsl(36_100%_90%_/_0.06)_inset]
                overflow-hidden"
            >
              {/* Ambient glow at top */}
              <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none opacity-50"
                style={{ background: "radial-gradient(ellipse at top, hsl(32 96% 58% / 0.25), transparent 70%)" }} />

              <div className="relative p-4 border-b border-white/[0.05] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-xl bg-primary/40 blur-md" />
                    <div className="relative h-9 w-9 rounded-xl grid place-items-center border border-primary/40"
                      style={{ background: "radial-gradient(circle at 35% 30%, hsl(38 100% 78%), hsl(32 96% 58%) 50%, hsl(22 88% 42%))" }}>
                      <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2.4} />
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-[14px]">Staff Copilot</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <span className="pulse-amber !h-1 !w-1" /> Trained on {venue.name}
                    </div>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative flex-1 overflow-y-auto p-4 space-y-2.5">
                {messages.length === 0 && (
                  <div className="py-6">
                    <div className="text-center mb-5">
                      <div className="text-[15px] font-medium mb-1">How can I help?</div>
                      <div className="text-xs text-muted-foreground">Ask anything about your venue, staff, or guests.</div>
                    </div>
                    <div className="space-y-1.5">
                      {PROMPTS.map(s => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.05] hover:border-primary/30 transition-all flex items-center gap-2 group"
                        >
                          <Sparkles className="h-3 w-3 text-primary opacity-60 group-hover:opacity-100" />
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-3.5 rounded-xl text-[13.5px] leading-relaxed border ${
                      m.role === "user"
                        ? "bg-primary/[0.08] ml-6 border-primary/20"
                        : "bg-white/[0.02] mr-6 border-white/[0.06]"
                    }`}
                  >
                    {m.role === "assistant" && (
                      <div className="text-[10px] uppercase tracking-wider text-primary mb-1.5 flex items-center gap-1.5">
                        <Sparkles className="h-2.5 w-2.5" /> Copilot
                      </div>
                    )}
                    {m.content || (loading && i === messages.length - 1
                      ? <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> thinking…
                        </span>
                      : null)}
                  </motion.div>
                ))}
                <div ref={endRef} />
              </div>

              <div className="relative p-3 border-t border-white/[0.05] flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
                  placeholder="Ask anything…"
                  className="flex-1 bg-black/30 border border-white/[0.06] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/30 transition-all"
                />
                <Button
                  onClick={() => send()}
                  disabled={loading || !input.trim()}
                  size="icon"
                  className="bg-gradient-to-br from-primary to-accent text-primary-foreground border border-primary/40 h-10 w-10 shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.5)]"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
