import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Msg = { role: "user" | "assistant"; content: string };

export function StaffCopilot() {
  const { venue, session } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || !venue) return;
    const next = [...messages, { role: "user" as const, content: input }];
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
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-5 right-5 z-40 h-12 px-4 rounded-full bg-card/80 backdrop-blur-xl border border-primary/30 hover:border-primary/60 flex items-center gap-2 shadow-lg"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Ask Copilot</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
            <motion.div
              initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
              className="fixed bottom-5 right-5 z-50 w-full sm:w-[420px] h-[560px] glass-strong rounded-2xl border border-white/10 flex flex-col"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Staff Copilot</div>
                    <div className="text-[10px] text-muted-foreground">Trained on {venue.name}</div>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-secondary/60"><X className="h-4 w-4" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 && (
                  <div className="text-sm text-muted-foreground p-4 text-center space-y-2">
                    <div>Ask anything about your venue.</div>
                    <div className="grid gap-1.5 mt-3 text-xs">
                      {["What's our policy on large parties?", "Suggest an upsell for table 5", "Draft a reply to a complaint"].map(s => (
                        <button key={s} onClick={() => setInput(s)} className="text-left px-3 py-2 rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-white/5">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`p-3 rounded-xl text-sm ${m.role === "user" ? "bg-primary/10 ml-6 border border-primary/20" : "bg-secondary/40 mr-6 border border-white/5"}`}>
                    {m.content || (loading && i === messages.length - 1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null)}
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              <div className="p-3 border-t border-white/5 flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
                  placeholder="Ask anything…"
                  className="flex-1 bg-input border border-white/5 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/60"
                />
                <Button onClick={send} disabled={loading || !input.trim()} size="icon" className="bg-primary text-primary-foreground">
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
