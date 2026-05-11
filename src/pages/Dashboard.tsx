import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, CalendarDays, Users, Sparkles, ArrowUpRight, Mic, TrendingUp } from "lucide-react";
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
    { label: "Bookings", value: stats.bookings, icon: CalendarDays, hint: "All time", glow: "hsl(32 96% 58%)" },
    { label: "Calls handled", value: stats.calls, icon: Phone, hint: "AI voice", glow: "hsl(22 88% 52%)" },
    { label: "Covers upcoming", value: stats.covers, icon: Users, hint: "Next sessions", glow: "hsl(38 100% 70%)" },
    { label: "Active agents", value: stats.agents, icon: Sparkles, hint: "Online now", glow: "hsl(28 88% 60%)" },
  ];

  return (
    <>
      <PageHeader
        title={`Hello, ${venue?.name}`}
        subtitle="Your operating layer is awake. Bookings, calls, agents and revenue are flowing in real time."
        actions={
          <Link to="/app/voice">
            <Button size="lg" className="relative overflow-hidden bg-gradient-to-r from-primary via-primary to-accent text-primary-foreground
              shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.7),0_1px_0_hsl(36_100%_90%_/_0.25)_inset]
              hover:shadow-[0_16px_50px_-12px_hsl(var(--primary)/0.85),0_1px_0_hsl(36_100%_90%_/_0.3)_inset]
              transition-all duration-300 border border-primary/40 px-5 h-11 font-medium">
              <span className="absolute inset-0 stream-line" />
              <Mic className="h-4 w-4 mr-2 relative" />
              <span className="relative">Talk to your agent</span>
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
            whileHover={{ y: -3 }}
            className="card-cine p-5 cursor-default"
          >
            {/* Ambient glow per card */}
            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-40 pointer-events-none"
              style={{ background: c.glow }} />

            <div className="flex items-start justify-between mb-6">
              <div className="relative">
                <div className="absolute inset-0 rounded-xl blur-md opacity-60" style={{ background: c.glow }} />
                <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 grid place-items-center">
                  <c.icon className="h-[18px] w-[18px]" style={{ color: c.glow }} strokeWidth={2} />
                </div>
              </div>
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="h-3 w-3" /> Live
              </div>
            </div>

            <div className="num-cine text-[44px] font-semibold tracking-tight">
              <AnimatedNumber value={c.value} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-[12px] text-foreground/80 font-medium">{c.label}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.hint}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card-cine p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="label-micro mb-1.5">Diary · Next up</div>
              <div className="font-medium text-[15px]">Upcoming bookings</div>
            </div>
            <Link to="/app/diary" className="text-[11px] uppercase tracking-wider text-primary hover:text-primary-glow transition-colors flex items-center gap-1">
              Open diary <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-1.5">
            {upcoming.length === 0 && (
              <div className="text-center py-12 px-4">
                <div className="text-sm font-medium mb-1">Your AI host is ready to begin taking reservations.</div>
                <div className="text-xs text-muted-foreground">As bookings come in by voice, web or SMS — they'll appear here in real time.</div>
              </div>
            )}
            {upcoming.map((b, i) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-4 p-3.5 rounded-xl hover:bg-white/[0.03] border border-transparent hover:border-white/[0.06] transition-all group"
              >
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/15 grid place-items-center text-[13px] text-primary font-semibold tabular-nums">
                  {format(new Date(b.booking_time), "HH:mm")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium">{b.guest_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(b.booking_time), "EEE d MMM")} · party of {b.party_size}
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {b.status}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="card-cine p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="label-micro mb-1.5 flex items-center gap-2">
                <span className="pulse-amber !h-1.5 !w-1.5" /> Live Brain
              </div>
              <div className="font-medium text-[15px]">Decisions, narrated</div>
            </div>
            <Link to="/app/brain" className="text-[11px] uppercase tracking-wider text-primary hover:text-primary-glow transition-colors flex items-center gap-1">
              Open <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2 relative">
            {events.length === 0 && (
              <div className="text-center py-10">
                <div className="text-sm font-medium mb-1">Your AI is quietly observing.</div>
                <div className="text-xs text-muted-foreground">Every decision will stream here.</div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {events.map(e => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, x: 14, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.35 }}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-primary/20 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{
                      background: e.severity === 'success' ? 'hsl(var(--success))' : e.severity === 'warn' ? 'hsl(var(--warn))' : e.severity === 'critical' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
                      boxShadow: `0 0 8px ${e.severity === 'success' ? 'hsl(var(--success))' : e.severity === 'warn' ? 'hsl(var(--warn))' : e.severity === 'critical' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'}`
                    }} />
                    <div className="text-[12.5px] font-medium truncate flex-1">{e.title}</div>
                  </div>
                  {e.reason && <div className="text-[11.5px] text-muted-foreground line-clamp-2 ml-3.5">{e.reason}</div>}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const duration = 900;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + diff * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{display.toLocaleString()}</>;
}
