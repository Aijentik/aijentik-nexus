import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { motion } from "framer-motion";
import { Phone, CalendarDays, TrendingUp, Users, Sparkles, ArrowUpRight, Mic } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default function Dashboard() {
  const { venue } = useAuth();
  const [stats, setStats] = useState({ bookings: 0, calls: 0, covers: 0, agents: 0 });
  const [events, setEvents] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);

  useEffect(() => {
    if (!venue) return;
    let active = true;
    (async () => {
      const [{ count: bk }, { count: cl }, { data: bks }, { data: ag }, { data: ev }] = await Promise.all([
        supabase.from("bookings").select("*", { count: "exact", head: true }).eq("venue_id", venue.id),
        supabase.from("calls").select("*", { count: "exact", head: true }).eq("venue_id", venue.id),
        supabase.from("bookings").select("*").eq("venue_id", venue.id).gte("booking_time", new Date().toISOString()).order("booking_time").limit(6),
        supabase.from("agents").select("id,status").eq("venue_id", venue.id),
        supabase.from("brain_events").select("*").eq("venue_id", venue.id).order("created_at", { ascending: false }).limit(6),
      ]);
      if (!active) return;
      const covers = (bks || []).reduce((s, b: any) => s + (b.party_size || 0), 0);
      setStats({ bookings: bk || 0, calls: cl || 0, covers, agents: (ag || []).filter((a: any) => a.status === "active").length });
      setUpcoming(bks || []);
      setEvents(ev || []);
    })();

    const ch = supabase.channel("dash:" + venue.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "brain_events", filter: `venue_id=eq.${venue.id}` }, (p) => setEvents(e => [p.new, ...e].slice(0, 6)))
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [venue]);

  const cards = [
    { label: "Bookings", value: stats.bookings, icon: CalendarDays, color: "from-primary/20 to-primary/5" },
    { label: "Calls handled", value: stats.calls, icon: Phone, color: "from-accent/20 to-accent/5" },
    { label: "Covers (upcoming)", value: stats.covers, icon: Users, color: "from-primary/20 to-accent/10" },
    { label: "Active agents", value: stats.agents, icon: Sparkles, color: "from-accent/20 to-primary/10" },
  ];

  return (
    <>
      <PageHeader title={`Hello, ${venue?.name}`} subtitle="Your operating layer is live."
        actions={<Link to="/app/voice"><Button className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground"><Mic className="h-4 w-4 mr-2" /> Talk to your agent</Button></Link>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`glass rounded-2xl p-5 bg-gradient-to-br ${c.color}`}>
            <div className="flex items-center justify-between mb-3"><c.icon className="h-5 w-5 text-primary" /><ArrowUpRight className="h-4 w-4 text-muted-foreground" /></div>
            <div className="text-3xl font-semibold tracking-tight">{c.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div><div className="font-medium">Upcoming bookings</div><div className="text-xs text-muted-foreground">Next confirmations in your diary</div></div>
            <Link to="/app/diary" className="text-xs text-primary hover:underline">View diary</Link>
          </div>
          <div className="space-y-2">
            {upcoming.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">No upcoming bookings yet.</div>}
            {upcoming.map((b) => (
              <div key={b.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-secondary/40 transition-colors">
                <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center text-xs text-primary font-semibold">{format(new Date(b.booking_time), "HH:mm")}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{b.guest_name}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(b.booking_time), "EEE d MMM")} · party of {b.party_size}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-primary/10 text-primary">{b.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div><div className="font-medium">Live Brain</div><div className="text-xs text-muted-foreground">Decisions, narrated.</div></div>
            <Link to="/app/brain" className="text-xs text-primary hover:underline">Open</Link>
          </div>
          <div className="space-y-2">
            {events.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">Quiet for now.</div>}
            {events.map(e => (
              <motion.div key={e.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="p-3 rounded-xl bg-secondary/30 border border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${e.severity === 'success' ? 'bg-[hsl(var(--success))]' : e.severity === 'warn' ? 'bg-[hsl(var(--warn))]' : e.severity === 'critical' ? 'bg-destructive' : 'bg-primary'}`} />
                  <div className="text-xs font-medium">{e.title}</div>
                </div>
                {e.reason && <div className="text-xs text-muted-foreground line-clamp-2">{e.reason}</div>}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
