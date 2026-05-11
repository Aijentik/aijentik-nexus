import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { format, subDays } from "date-fns";
import { Sparkles, PhoneIncoming, Users, TrendingUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function Analytics() {
  const { venue } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [narrative, setNarrative] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!venue) return;
    supabase.from("bookings").select("*").eq("venue_id", venue.id).then(({data}) => setBookings(data || []));
    supabase.from("calls").select("*").eq("venue_id", venue.id).then(({data}) => setCalls(data || []));
    runNarrative();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue]);

  const runNarrative = async () => {
    if (!venue) return;
    setBusy(true);
    try {
      const { data } = await supabase.functions.invoke("analytics-narrative", { body: { venue_id: venue.id } });
      if (data?.ok) { setStats(data.stats); setNarrative(data.narrative); }
    } finally { setBusy(false); }
  };

  const days = Array.from({length: 14}, (_, i) => {
    const d = subDays(new Date(), 13 - i);
    const k = format(d, "MMM d");
    return {
      day: k,
      bookings: bookings.filter(b => format(new Date(b.created_at), "MMM d") === k).length,
      calls: calls.filter(c => format(new Date(c.started_at), "MMM d") === k).length,
    };
  });

  const sources = Object.entries(bookings.reduce((a: any, b) => { a[b.source || 'unknown'] = (a[b.source||'unknown']||0)+1; return a; }, {})).map(([source, count]) => ({ source, count }));

  const kpis = [
    { icon: PhoneIncoming, label: "Missed calls saved", value: stats?.missed_calls_saved ?? "—", sub: "AI converted to bookings", glow: "hsl(32 96% 58%)" },
    { icon: TrendingUp,    label: "Revenue influenced", value: stats ? `£${stats.revenue_influenced.toLocaleString()}` : "—", sub: "30-day estimate", glow: "hsl(38 100% 70%)" },
    { icon: Users,         label: "AI bookings",        value: stats?.ai_bookings ?? "—", sub: `of ${stats?.total_bookings ?? 0} total`, glow: "hsl(28 88% 60%)" },
    { icon: Sparkles,      label: "Avg call",           value: stats ? `${stats.avg_call_seconds}s` : "—", sub: `${stats?.total_calls ?? 0} calls handled`, glow: "hsl(22 88% 52%)" },
  ];

  return (
    <>
      <PageHeader title="Analytics" subtitle="Bloomberg-grade visibility across every call, booking and revenue source." />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
            className="card-cine p-5"
          >
            <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-30 pointer-events-none" style={{ background: k.glow }} />
            <div className="flex items-center justify-between mb-4">
              <div className="h-9 w-9 rounded-lg grid place-items-center border" style={{ background: `${k.glow}12`, borderColor: `${k.glow}30` }}>
                <k.icon className="h-4 w-4" style={{ color: k.glow }} />
              </div>
              <span className="label-micro">{k.label}</span>
            </div>
            <div className="num-cine text-[34px] font-semibold">{k.value}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{k.sub}</div>
          </motion.div>
        ))}
      </div>

      <div className="card-cine p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-primary/40 blur-md" />
              <div className="relative h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center border border-primary/40">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
            </div>
            <div>
              <div className="label-micro">AI narrative · last 30 days</div>
              <div className="font-medium text-[15px]">Operational story</div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={runNarrative} disabled={busy} className="border-white/10">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Refresh
          </Button>
        </div>
        <div className="text-[14px] leading-relaxed text-foreground/85 whitespace-pre-line min-h-[80px] pl-1 border-l-2 border-primary/40 pl-4">
          {narrative || (busy ? "Analysing your venue's performance…" : "Click refresh to generate a narrative summary.")}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card-cine p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="label-micro mb-1">14-day trend</div>
              <div className="font-medium text-[15px]">Bookings vs Calls</div>
            </div>
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" /> Bookings</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_hsl(var(--accent))]" /> Calls</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={days} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gBook" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCall" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" opacity={0.4} />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "hsl(28 18% 6% / 0.95)", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, backdropFilter: "blur(12px)" }} cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.3 }} />
              <Area type="monotone" dataKey="bookings" stroke="hsl(var(--primary))" strokeWidth={2.2} fill="url(#gBook)" />
              <Area type="monotone" dataKey="calls" stroke="hsl(var(--accent))" strokeWidth={2.2} fill="url(#gCall)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card-cine p-6">
          <div className="mb-5">
            <div className="label-micro mb-1">Distribution</div>
            <div className="font-medium text-[15px]">Booking sources</div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sources} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(38 100% 70%)" />
                  <stop offset="100%" stopColor="hsl(22 88% 50%)" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" opacity={0.4} />
              <XAxis dataKey="source" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "hsl(28 18% 6% / 0.95)", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, backdropFilter: "blur(12px)" }} cursor={{ fill: "hsl(var(--primary) / 0.06)" }} />
              <Bar dataKey="count" fill="url(#gBar)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
