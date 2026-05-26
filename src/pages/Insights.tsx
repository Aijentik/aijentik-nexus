import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, TrendingUp, AlertTriangle, Zap, Search, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const impactStyle = (impact?: string) => {
  switch ((impact || "").toLowerCase()) {
    case "high":   return { color: "hsl(0 78% 60%)",   icon: AlertTriangle, label: "High impact" };
    case "medium": return { color: "hsl(36 96% 60%)",  icon: Zap,           label: "Medium impact" };
    default:       return { color: "hsl(32 96% 58%)",  icon: TrendingUp,    label: "Opportunity" };
  }
};

export default function Insights() {
  const { venue, session } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [impactFilter, setImpactFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const load = async () => {
    if (!venue) return;
    const { data } = await supabase.from("insights").select("*").eq("venue_id", venue.id).order("created_at", { ascending: false });
    setItems(data || []);
  };
  useEffect(() => { load(); }, [venue]);

  const dismiss = async (id: string) => {
    const prev = items;
    setItems(items.filter(i => i.id !== id));
    const { error } = await supabase.from("insights").delete().eq("id", id);
    if (error) { setItems(prev); toast.error("Could not dismiss"); }
  };

  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category).filter(Boolean))), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(i => {
      if (impactFilter !== "all" && (i.impact || "").toLowerCase() !== impactFilter) return false;
      if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
      if (q && !`${i.title} ${i.body} ${i.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, impactFilter, categoryFilter]);

  const counts = useMemo(() => ({
    all: items.length,
    high: items.filter(i => (i.impact || "").toLowerCase() === "high").length,
    medium: items.filter(i => (i.impact || "").toLowerCase() === "medium").length,
    low: items.filter(i => !["high","medium"].includes((i.impact || "").toLowerCase())).length,
  }), [items]);

  const hasFilters = query || impactFilter !== "all" || categoryFilter !== "all";

  const generate = async () => {
    if (!venue) return;
    setBusy(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ venue_id: venue.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Insights generated");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle="Overnight intelligence from your operations — what's working, what's leaking revenue, and what to do next."
        actions={
          <Button
            onClick={generate}
            disabled={busy}
            size="lg"
            className="relative overflow-hidden bg-gradient-to-r from-primary via-primary to-accent text-primary-foreground border border-primary/40 px-5 h-11
              shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.7),0_1px_0_hsl(36_100%_90%_/_0.25)_inset]"
          >
            <span className="absolute inset-0 stream-line" />
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2 relative" /> : <Sparkles className="h-4 w-4 mr-2 relative" />}
            <span className="relative">Generate now</span>
          </Button>
        }
      />

      {items.length === 0 ? (
        <div className="card-cine p-16 text-center">
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl" />
            <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center mx-auto border border-primary/40 shadow-[0_0_30px_hsl(var(--primary)/0.5)]">
              <Sparkles className="h-7 w-7 text-primary-foreground" strokeWidth={2} />
            </div>
          </div>
          <div className="text-lg font-medium mb-1">Your AI strategist is ready.</div>
          <div className="text-sm text-muted-foreground max-w-md mx-auto">Click <em>Generate now</em> to surface revenue opportunities, operational gaps and growth recommendations from the last 30 days.</div>
        </div>
      ) : (
        <>
          {/* Filter bar */}
          <div className="mb-5 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search insights…" className="pl-9 h-9 bg-white/[0.02] border-white/[0.06]" />
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setImpactFilter("all"); setCategoryFilter("all"); }} className="h-9 text-xs text-muted-foreground">
                  <X className="h-3 w-3 mr-1" /> Reset
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { k: "all", label: "All", n: counts.all },
                { k: "high", label: "High impact", n: counts.high },
                { k: "medium", label: "Medium", n: counts.medium },
                { k: "low", label: "Opportunity", n: counts.low },
              ].map(t => (
                <button key={t.k} onClick={() => setImpactFilter(t.k)}
                  className={`text-[11.5px] px-3 py-1.5 rounded-full border transition-all ${
                    impactFilter === t.k
                      ? "border-primary/50 bg-primary/[0.08] text-primary"
                      : "border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:text-foreground"
                  }`}>{t.label} <span className="opacity-60 ml-0.5">{t.n}</span></button>
              ))}
              {categories.length > 0 && (
                <>
                  <span className="mx-1 self-center text-white/10">|</span>
                  <button onClick={() => setCategoryFilter("all")} className={`text-[11.5px] px-3 py-1.5 rounded-full border transition-all ${categoryFilter === "all" ? "border-primary/50 bg-primary/[0.08] text-primary" : "border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:text-foreground"}`}>All categories</button>
                  {categories.map(c => (
                    <button key={c} onClick={() => setCategoryFilter(c)}
                      className={`text-[11.5px] px-3 py-1.5 rounded-full border transition-all ${
                        categoryFilter === c
                          ? "border-primary/50 bg-primary/[0.08] text-primary"
                          : "border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:text-foreground"
                      }`}>{c}</button>
                  ))}
                </>
              )}
            </div>
          </div>

          {filtered.length === 0 && (
            <div className="card-cine p-10 text-center text-sm text-muted-foreground">
              No insights match your filters.
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-5">
            <AnimatePresence mode="popLayout">
              {filtered.map((i, idx) => {
                const s = impactStyle(i.impact);
                return (
                  <motion.div
                    key={i.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.03, duration: 0.35 }}
                    className="card-cine p-6 group relative"
                  >
                    <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-30 pointer-events-none" style={{ background: s.color }} />

                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg grid place-items-center border" style={{ background: `${s.color}15`, borderColor: `${s.color}30` }}>
                          <s.icon className="h-4 w-4" style={{ color: s.color }} />
                        </div>
                        <span className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border" style={{ color: s.color, borderColor: `${s.color}30`, background: `${s.color}10` }}>
                          {i.category}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
                    </div>

                    <div className="font-medium text-[16px] tracking-tight mb-2">{i.title}</div>
                    <div className="text-[13.5px] leading-relaxed text-muted-foreground">{i.body}</div>

                    <div className="mt-5 pt-4 border-t border-white/[0.05] flex items-center justify-between">
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-primary" /> AI generated
                      </div>
                      <button onClick={() => dismiss(i.id)} className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
                        <Trash2 className="h-3 w-3" /> Dismiss
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}
    </>
  );
}
