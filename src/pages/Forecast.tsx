import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { TrendingUp, AlertTriangle, Users, Clock, Sparkles, RefreshCcw, Loader2, ChefHat, ConciergeBell, PoundSterling } from "lucide-react";
import { toast } from "sonner";

type Risk = { id: string; guest_name: string; booking_time: string; party_size: number; risk: number; tier: "high" | "medium" | "low"; reasons: string[] };
type Forecast = {
  target_date: string; venue_name: string; total_seats: number; narrative: string;
  today: { bookings: number; covers: number; expected_show_covers: number; projected_revenue: number };
  history: { avg_covers_same_dow: number; no_show_rate: number; sample_days: number };
  hours: { hour: number; covers: number; utilization: number }[];
  overbooked_hours: { hour: number; covers: number; utilization: number }[];
  staffing: { foh: number; boh: number; peak_hour: number | null };
  no_show_risks: Risk[];
};

const TIER_COLOR: Record<string, string> = {
  high: "hsl(var(--destructive))",
  medium: "hsl(var(--warn))",
  low: "hsl(var(--success))",
};

export default function Forecast() {
  const { venue } = useAuth();
  const [f, setF] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = async (d = date) => {
    if (!venue) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/predictive-forecast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ venue_id: venue.id, target_date: new Date(d).toISOString() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Forecast failed");
      setF(j);
    } catch (e: any) {
      toast.error(e.message || "Forecast failed");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(date); /* eslint-disable-next-line */ }, [venue?.id]);

  const maxHourCovers = f ? Math.max(...f.hours.map(h => h.covers), 1) : 1;

  return (
    <div>
      <PageHeader
        title="Predictive AI"
        subtitle="Hybrid forecasting — rules-based math, AI-reasoned briefing. Plan your shift before it happens."
        actions={
          <div className="flex items-center gap-2">
            <input
              type="date" value={date} onChange={e => { setDate(e.target.value); load(e.target.value); }}
              className="text-sm bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 outline-none focus:border-primary/40"
            />
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-1.5" />}
              Recalculate
            </Button>
          </div>
        }
      />

      {!f && loading && (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Crunching your shift…
        </div>
      )}

      {f && (
        <div className="space-y-4">
          {/* AI briefing */}
          {f.narrative && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.06] to-transparent p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary mb-2">
                <Sparkles className="w-3.5 h-3.5" /> AI shift briefing
              </div>
              <p className="text-base leading-relaxed">{f.narrative}</p>
            </motion.div>
          )}

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={Users} label="Expected covers" value={f.today.expected_show_covers}
              sub={`of ${f.today.covers} booked`} accent="primary" />
            <Kpi icon={PoundSterling} label="Projected revenue" value={`£${f.today.projected_revenue.toLocaleString()}`}
              sub={`vs ${f.history.avg_covers_same_dow} avg covers`} accent="success" />
            <Kpi icon={ConciergeBell} label="FOH staff" value={f.staffing.foh}
              sub={`peak at ${f.staffing.peak_hour ?? "?"}:00`} accent="default" />
            <Kpi icon={ChefHat} label="BOH staff" value={f.staffing.boh}
              sub={`for ${f.today.covers} covers`} accent="default" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
            {/* Hour-by-hour load */}
            <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5"><Clock className="w-4 h-4 text-primary" /> Cover load by hour</div>
                  <div className="text-xs text-muted-foreground">Capacity: {f.total_seats} seats</div>
                </div>
                {f.overbooked_hours.length > 0 && (
                  <Badge className="bg-destructive/15 text-destructive border-destructive/30">
                    <AlertTriangle className="w-3 h-3 mr-1" /> {f.overbooked_hours.length} overbooked hour{f.overbooked_hours.length > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                {f.hours.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No bookings this day.</p>}
                {f.hours.map(h => {
                  const pct = (h.covers / maxHourCovers) * 100;
                  const over = h.utilization > 0.95;
                  return (
                    <div key={h.hour} className="flex items-center gap-3 text-xs">
                      <div className="w-12 text-muted-foreground tabular-nums">{String(h.hour).padStart(2, "0")}:00</div>
                      <div className="flex-1 h-6 bg-white/[0.03] rounded-md overflow-hidden relative">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className={`h-full ${over ? "bg-destructive/60" : h.utilization > 0.7 ? "bg-warn/60" : "bg-primary/60"}`}
                        />
                        <div className="absolute inset-0 flex items-center px-2 text-[11px] font-medium">
                          {h.covers} covers · {Math.round(h.utilization * 100)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* No-show risks */}
            <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-primary" /> No-show risk
                </div>
                <div className="text-xs text-muted-foreground">{Math.round(f.history.no_show_rate * 100)}% baseline</div>
              </div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {f.no_show_risks.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No bookings to score.</p>}
                {f.no_show_risks.map(r => (
                  <div key={r.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-sm font-medium flex-1 truncate">{r.guest_name}</div>
                      <Badge style={{ background: `${TIER_COLOR[r.tier]}22`, color: TIER_COLOR[r.tier], borderColor: `${TIER_COLOR[r.tier]}55` }}
                        className="text-[10px] py-0">{Math.round(r.risk * 100)}%</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(r.booking_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · party of {r.party_size}
                    </div>
                    {r.reasons.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.reasons.map(reason => (
                          <span key={reason} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground">{reason}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: any; sub: string; accent: "primary" | "success" | "default" }) {
  const colors = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    default: "bg-white/[0.04] text-foreground",
  };
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors[accent]}`}><Icon className="w-3.5 h-3.5" /></div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
