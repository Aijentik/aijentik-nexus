import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, X, Sparkles, Undo2, Loader2, AlertCircle, Search, Filter, Pin, PinOff, Copy, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Event = {
  id: string;
  title: string;
  reason?: string | null;
  severity: string;
  meta?: any;
  agent_id?: string | null;
  created_at: string;
};

type SevFilter = "all" | "info" | "success" | "warn" | "critical";

const SEV_LABEL: Record<SevFilter, string> = {
  all: "All",
  info: "Info",
  success: "Success",
  warn: "Warnings",
  critical: "Critical",
};

const PIN_KEY = "aijentik:brainPinned";

export function FloatingBrain() {
  const { venue } = useAuth();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState<boolean>(() => {
    try { return localStorage.getItem(PIN_KEY) === "1"; } catch { return false; }
  });
  const [events, setEvents] = useState<Event[]>([]);
  const [query, setQuery] = useState("");
  const [sev, setSev] = useState<SevFilter>("all");
  const [copied, setCopied] = useState<string | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("aijentik:open-brain", onOpen);
    return () => window.removeEventListener("aijentik:open-brain", onOpen);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(PIN_KEY, pinned ? "1" : "0"); } catch {}
    if (pinned) setOpen(true);
  }, [pinned]);

  useEffect(() => {
    if (!venue) return;
    let active = true;
    supabase.from("brain_events").select("*").eq("venue_id", venue.id)
      .order("created_at", { ascending: false }).limit(80)
      .then(({ data }) => { if (active) setEvents((data as any) || []); });

    const ch = supabase.channel(`brain-float:${venue.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "brain_events", filter: `venue_id=eq.${venue.id}` },
        (p) => {
          setEvents(e => [p.new as Event, ...e].slice(0, 100));
          window.dispatchEvent(new CustomEvent("aijentik:brain-pulse", { detail: { count: 1 } }));
        }).subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [venue?.id]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("aijentik:brain-count", { detail: { count: events.length } }));
  }, [events.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(ev => {
      if (sev !== "all" && ev.severity !== sev) return false;
      if (q && !`${ev.title} ${ev.reason ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, query, sev]);

  // Group by relative day for action history feel
  const grouped = useMemo(() => {
    const groups: { label: string; items: Event[] }[] = [];
    const now = new Date();
    const todayKey = now.toDateString();
    const yKey = new Date(now.getTime() - 86400000).toDateString();
    for (const ev of filtered) {
      const d = new Date(ev.created_at);
      const k = d.toDateString();
      const label = k === todayKey ? "Today" : k === yKey ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      const g = groups[groups.length - 1];
      if (g && g.label === label) g.items.push(ev);
      else groups.push({ label, items: [ev] });
    }
    return groups;
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length, info: 0, success: 0, warn: 0, critical: 0 };
    for (const e of events) c[e.severity] = (c[e.severity] || 0) + 1;
    return c;
  }, [events]);

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

  const copy = (ev: Event) => {
    const txt = `${ev.title}${ev.reason ? `\n${ev.reason}` : ""}\n${new Date(ev.created_at).toLocaleString()}`;
    navigator.clipboard?.writeText(txt);
    setCopied(ev.id);
    setTimeout(() => setCopied(null), 1400);
  };

  const sevColor = (s: string) =>
    s === "success" ? "hsl(var(--success))" :
    s === "warn" ? "hsl(var(--warn))" :
    s === "critical" ? "hsl(var(--destructive))" : "hsl(var(--primary))";

  if (!venue) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {!pinned && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/55"
            />
          )}
          <motion.aside
            initial={{ x: 480, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 480, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[460px] glass-strong border-l border-white/10 flex flex-col"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_0_18px_hsl(var(--primary)/0.5)]">
                  <Brain className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <div className="font-semibold tracking-tight">Live Brain</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <span className="pulse-dot" /> Streaming · {filtered.length} of {events.length}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPinned(p => !p)}
                  title={pinned ? "Unpin panel" : "Pin panel open"}
                  aria-label={pinned ? "Unpin" : "Pin"}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    pinned ? "text-primary bg-primary/10 border border-primary/30" : "hover:bg-secondary/60 text-muted-foreground"
                  )}
                >
                  {pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
                </button>
                <button onClick={() => { setPinned(false); setOpen(false); }} className="p-2 rounded-lg hover:bg-secondary/60" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Controls */}
            <div className="px-4 pt-3 pb-2 space-y-2 border-b border-white/5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search actions, reasons…"
                  className="w-full bg-black/30 border border-white/[0.06] rounded-lg pl-8 pr-3 py-2 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/30 transition-all"
                />
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <Filter className="h-3 w-3 text-muted-foreground/70 mr-0.5" />
                {(Object.keys(SEV_LABEL) as SevFilter[]).map(k => (
                  <button
                    key={k}
                    onClick={() => setSev(k)}
                    className={cn(
                      "text-[10.5px] px-2 py-1 rounded-full border transition-all inline-flex items-center gap-1.5",
                      sev === k
                        ? "border-primary/50 bg-primary/[0.1] text-primary"
                        : "border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {k !== "all" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: sevColor(k) }} />}
                    {SEV_LABEL[k]}
                    <span className="opacity-60 tabular-nums">{counts[k] ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {filtered.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-12">
                  {events.length === 0 ? "Quiet for now. Your AI's actions will stream here in real time." : "No actions match your filters."}
                </div>
              )}
              <AnimatePresence initial={false}>
                {grouped.map(group => (
                  <div key={group.label} className="space-y-2">
                    <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-background/90 text-[9.5px] uppercase tracking-[0.22em] text-muted-foreground/70 font-medium">
                      {group.label}
                    </div>
                    {group.items.map(ev => (
                      <motion.div
                        key={ev.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="glass rounded-xl p-3.5 group"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="h-2 w-2 rounded-full mt-1.5 shrink-0 shadow-[0_0_8px_currentColor]" style={{ background: sevColor(ev.severity), color: sevColor(ev.severity) }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium truncate">{ev.title}</div>
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 tabular-nums">
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

                            <div className="flex gap-1 mt-2.5 opacity-60 group-hover:opacity-100 transition-opacity">
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
                              <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2 ml-auto text-muted-foreground"
                                onClick={() => copy(ev)}>
                                {copied === ev.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
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
  );
}
