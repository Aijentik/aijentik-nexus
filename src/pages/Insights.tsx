import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, TrendingUp, AlertTriangle, Zap } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

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

  const load = async () => {
    if (!venue) return;
    const { data } = await supabase.from("insights").select("*").eq("venue_id", venue.id).order("created_at", { ascending: false });
    setItems(data || []);
  };
  useEffect(() => { load(); }, [venue]);

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

      {items.length === 0 && (
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
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {items.map((i, idx) => {
          const s = impactStyle(i.impact);
          return (
            <motion.div
              key={i.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.4 }}
              className="card-cine p-6 group"
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
                <div className="text-[10px] uppercase tracking-wider text-primary opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  Apply →
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
