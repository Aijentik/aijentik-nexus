import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { format, subDays } from "date-fns";
import { Sparkles, PhoneIncoming, Users, TrendingUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    { icon: PhoneIncoming, label: "Missed calls saved", value: stats?.missed_calls_saved ?? "—", sub: "AI converted to bookings" },
    { icon: TrendingUp, label: "Revenue influenced", value: stats ? `£${stats.revenue_influenced.toLocaleString()}` : "—", sub: "30-day estimate" },
    { icon: Users, label: "AI bookings", value: stats?.ai_bookings ?? "—", sub: `of ${stats?.total_bookings ?? 0} total` },
    { icon: Sparkles, label: "Avg call", value: stats ? `${stats.avg_call_seconds}s` : "—", sub: `${stats?.total_calls ?? 0} calls handled` },
  ];

  return (
    <>
      <PageHeader title="Analytics" subtitle="Trends across calls, bookings, sources." />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {kpis.map((k, i) => (
          <div key={i} className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><k.icon className="h-3.5 w-3.5 text-primary" />{k.label}</div>
            <div className="text-2xl font-semibold mt-2">{k.value}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="glass-strong rounded-2xl p-5 mb-4 bg-gradient-to-br from-primary/5 to-accent/5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4 text-primary" /><span className="font-medium">AI narrative · last 30 days</span></div>
          <Button size="sm" variant="ghost" onClick={runNarrative} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}</Button>
        </div>
        <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line min-h-[80px]">{narrative || (busy ? "Analysing…" : "Click refresh to generate.")}</div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5">
          <div className="font-medium mb-4">Bookings vs Calls (14d)</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={days}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Line type="monotone" dataKey="bookings" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="calls" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="font-medium mb-4">Booking sources</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sources}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="source" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
