import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { motion, AnimatePresence } from "framer-motion";
import { Brain as BrainIcon, Sparkles, Undo2, Loader2, ShieldCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Ev = {
  id: string;
  title: string;
  reason: string | null;
  severity: string;
  created_at: string;
  meta: any;
};

export default function LiveBrain() {
  const { venue } = useAuth();
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "info" | "warn" | "critical" | "success">("all");
  const [query, setQuery] = useState("");
  const [explainOpen, setExplainOpen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, "explain" | "undo" | null>>({});
  const [undone, setUndone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!venue) return;
    let active = true;
    setLoading(true);
    supabase
      .from("brain_events")
      .select("*")
      .eq("venue_id", venue.id)
      .order("created_at", { ascending: false })
      .limit(120)
      .then(({ data }) => {
        if (!active) return;
        setEvents((data as any) || []);
        setLoading(false);
      });
    const ch = supabase
      .channel("brain:" + venue.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "brain_events", filter: `venue_id=eq.${venue.id}` },
        (p) => setEvents((e) => [p.new as Ev, ...e].slice(0, 150))
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [venue]);

  const sevColor = (s: string) =>
    s === "success"
      ? "hsl(var(--success))"
      : s === "warn"
      ? "hsl(var(--warn))"
      : s === "critical"
      ? "hsl(var(--destructive))"
      : "hsl(var(--primary))";

  const callFn = async (path: string, body: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
    return j;
  };

  const explain = async (e: Ev) => {
    if (!venue) return;
    if (explainOpen[e.id]) {
      const next = { ...explainOpen };
      delete next[e.id];
      setExplainOpen(next);
      return;
    }
    setBusy((b) => ({ ...b, [e.id]: "explain" }));
    try {
      const { explanation } = await callFn("brain-explain", { event_id: e.id, venue_id: venue.id });
      setExplainOpen((o) => ({ ...o, [e.id]: explanation }));
    } catch (err: any) {
      toast.error(err.message || "Could not explain");
    } finally {
      setBusy((b) => ({ ...b, [e.id]: null }));
    }
  };

  const undo = async (e: Ev) => {
    if (!venue) return;
    setBusy((b) => ({ ...b, [e.id]: "undo" }));
    try {
      const { message } = await callFn("brain-undo", { event_id: e.id, venue_id: venue.id });
      setUndone((u) => ({ ...u, [e.id]: true }));
      toast.success(message || "Reversed");
    } catch (err: any) {
      toast.error(err.message || "Could not undo");
    } finally {
      setBusy((b) => ({ ...b, [e.id]: null }));
    }
  };

  const filtered = filter === "all" ? events : events.filter((e) => e.severity === filter);
  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.severity] = (acc[e.severity] || 0) + 1;
    return acc;
  }, {});

  const isUndoable = (e: Ev) =>
    !undone[e.id] &&
    !e.title?.toLowerCase().includes("reversed") &&
    (e.meta?.booking_id || e.title?.toLowerCase().includes("booking"));

  return (
    <>
      <PageHeader
        title="Live Brain"
        subtitle="Every decision your AI makes — narrated in real time, explainable, reversible."
      />
      <div className="glass-strong rounded-3xl p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="flex items-center gap-2 mr-2">
            <BrainIcon className="h-5 w-5 text-primary" />
            <span className="text-sm">
              Streaming · {events.length} events
            </span>
            <span className="pulse-dot ml-1" />
          </div>
          <div className="flex flex-wrap gap-1 ml-auto">
            {(["all", "info", "success", "warn", "critical"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full border transition-colors ${
                  filter === k
                    ? "border-primary/60 text-primary bg-primary/10"
                    : "border-border/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {k}
                {k !== "all" && counts[k] ? ` · ${counts[k]}` : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1 md:pr-2">
          {loading && (
            <>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="glass rounded-xl p-4 animate-pulse">
                  <div className="h-3 w-1/3 bg-muted/40 rounded mb-2" />
                  <div className="h-3 w-2/3 bg-muted/30 rounded" />
                </div>
              ))}
            </>
          )}
          {!loading && (
            <AnimatePresence initial={false}>
              {filtered.map((e) => (
                <motion.div
                  key={e.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="glass rounded-xl p-4 hover:border-primary/20 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="h-2 w-2 rounded-full mt-2 shrink-0"
                      style={{ background: sevColor(e.severity) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-medium">{e.title}</div>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {new Date(e.created_at).toLocaleTimeString()}
                        </span>
                        {undone[e.id] && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-warn">
                            <ShieldCheck className="h-3 w-3" /> reversed
                          </span>
                        )}
                      </div>
                      {e.reason && (
                        <div className="text-sm text-muted-foreground mt-1">{e.reason}</div>
                      )}
                      <div className="mt-2 flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => explain(e)}
                          disabled={busy[e.id] === "explain"}
                        >
                          {busy[e.id] === "explain" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          {explainOpen[e.id] ? "Hide" : "Explain"}
                        </Button>
                        {isUndoable(e) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs gap-1 text-warn hover:text-warn"
                            onClick={() => undo(e)}
                            disabled={busy[e.id] === "undo"}
                          >
                            {busy[e.id] === "undo" ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Undo2 className="h-3 w-3" />
                            )}
                            Undo
                          </Button>
                        )}
                      </div>
                      <AnimatePresence>
                        {explainOpen[e.id] && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 text-sm text-foreground/90 bg-primary/5 border border-primary/15 rounded-lg p-3 leading-relaxed">
                              {explainOpen[e.id]}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              ))}
              {filtered.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-12">
                  {events.length === 0
                    ? "Brain is quiet. Make a call or seed demo data."
                    : "No events match this filter."}
                </div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </>
  );
}
