import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, X, Sparkles, Undo2, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Event = {
  id: string;
  title: string;
  reason?: string | null;
  severity: string;
  meta?: any;
  agent_id?: string | null;
  created_at: string;
};

export function FloatingBrain() {
  const { venue } = useAuth();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [pulse, setPulse] = useState(false);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!venue) return;
    let active = true;
    supabase.from("brain_events").select("*").eq("venue_id", venue.id)
      .order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => { if (active) setEvents((data as any) || []); });

    const ch = supabase.channel(`brain-float:${venue.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "brain_events", filter: `venue_id=eq.${venue.id}` },
        (p) => {
          setEvents(e => [p.new as Event, ...e].slice(0, 60));
          setPulse(true);
          setTimeout(() => setPulse(false), 2500);
        }).subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [venue?.id]);

  const explain = useCallback(async (ev: Event) => {
    if (explanations[ev.id]) return;
    setExplaining(ev.id);
    try {
      const { data, error } = await supabase.functions.invoke("brain-explain", {
        body: { event_id: ev.id, venue_id: venue?.id },
      });
      if (error) throw error;
      setExplanations(x => ({ ...x, [ev.id]: data?.explanation || "No explanation available." }));
    } catch (e: any) {
      toast.error(e.message || "Could not explain");
    } finally {
      setExplaining(null);
    }
  }, [venue?.id, explanations]);

  const undo = useCallback(async (ev: Event) => {
    try {
      const { data, error } = await supabase.functions.invoke("brain-undo", {
        body: { event_id: ev.id, venue_id: venue?.id },
      });
      if (error) throw error;
      toast.success(data?.message || "Action reversed");
    } catch (e: any) {
      toast.error(e.message || "Cannot undo");
    }
  }, [venue?.id]);

  const recent = events.length;
  const sevColor = (s: string) =>
    s === "success" ? "hsl(var(--success))" :
    s === "warn" ? "hsl(var(--warn))" :
    s === "critical" ? "hsl(var(--destructive))" : "hsl(var(--primary))";

  if (!venue) return null;

  return (
    <>
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        className="fixed top-5 right-5 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_0_40px_hsl(var(--primary)/0.55)] border border-primary/30"
        aria-label="Open Live Brain"
      >
        <motion.div
          animate={{ scale: pulse ? [1, 1.25, 1] : [1, 1.06, 1] }}
          transition={{ duration: pulse ? 0.6 : 2.4, repeat: Infinity }}
        >
          <Brain className="h-6 w-6 text-primary-foreground" />
        </motion.div>
        {recent > 0 && (
          <span className="absolute -bottom-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-background text-[10px] font-bold text-primary border border-primary/40 grid place-items-center">
            {recent > 99 ? "99+" : recent}
          </span>
        )}
        <span className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: 480, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 480, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[440px] glass-strong border-l border-white/10 flex flex-col"
            >
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_0_18px_hsl(var(--primary)/0.5)]">
                    <Brain className="h-4.5 w-4.5 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="font-semibold tracking-tight">Live Brain</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span className="pulse-dot" /> Streaming · {events.length} actions
                    </div>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-secondary/60">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {events.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-12">
                    Quiet for now. Your AI's actions will stream here in real time.
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {events.map(ev => (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="glass rounded-xl p-3.5 group"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ background: sevColor(ev.severity) }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium truncate">{ev.title}</div>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                              {new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          {ev.reason && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{ev.reason}</div>}

                          {explanations[ev.id] && (
                            <div className="mt-2 p-2.5 rounded-lg bg-primary/5 border border-primary/15 text-xs text-foreground/90">
                              <div className="text-[10px] uppercase tracking-wider text-primary mb-1 flex items-center gap-1">
                                <Sparkles className="h-3 w-3" /> Why
                              </div>
                              {explanations[ev.id]}
                            </div>
                          )}

                          <div className="flex gap-1.5 mt-2.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2"
                              onClick={() => explain(ev)}
                              disabled={explaining === ev.id || !!explanations[ev.id]}>
                              {explaining === ev.id
                                ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                : <Sparkles className="h-3 w-3 mr-1" />}
                              Explain
                            </Button>
                            {(ev.meta?.undoable || ev.title?.toLowerCase().includes("booking")) && (
                              <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2 text-muted-foreground hover:text-destructive"
                                onClick={() => undo(ev)}>
                                <Undo2 className="h-3 w-3 mr-1" /> Undo
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <div className="p-4 border-t border-white/5 text-[11px] text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5" />
                Every action is logged, explainable, and reversible.
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
