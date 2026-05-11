import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/Layout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Activity, Phone, CalendarCheck2, Users, Crown, Sparkles, TrendingUp,
  AlertTriangle, Bot, Mic, Workflow, Zap, Play, Radio
} from "lucide-react";

// ───────────────────────── Demo orchestration ─────────────────────────
const DEMO_TEMPLATES: { title: string; reason: string; severity: "info" | "success" | "warn" | "critical"; agent: string; meta?: any }[] = [
  { title: "Voice Host answered missed call",      reason: "Inbound +61 412 909 221 · 00:42",                severity: "info",     agent: "Voice Host",       meta: { confidence: 0.97 } },
  { title: "Booking secured · table for 4",        reason: "Friday 7:30pm · outdoor · deposit pending",      severity: "success",  agent: "Booking Agent",    meta: { confidence: 0.94, party: 4 } },
  { title: "Deposit link sent via WhatsApp",       reason: "$80 hold · expires in 30 min",                   severity: "info",     agent: "Payments",         meta: { amount: 80 } },
  { title: "Payment received",                     reason: "Stripe · card_visa_4242",                        severity: "success",  agent: "Payments" },
  { title: "Table allocation optimised",           reason: "Moved 7:00pm party to T12 · freed T4 for VIP",   severity: "info",     agent: "Ops Brain",        meta: { confidence: 0.88 } },
  { title: "VIP guest profile detected",           reason: "Returning · 9 visits · prefers booth seating",   severity: "success",  agent: "Concierge",        meta: { vip: true } },
  { title: "Manager notified · anniversary",       reason: "Soft alert · arriving 8:15pm · table 6",         severity: "info",     agent: "Concierge" },
  { title: "Waitlist pressure rising",             reason: "12 in queue · avg wait 18 min",                  severity: "warn",     agent: "Ops Brain",        meta: { confidence: 0.81 } },
  { title: "No-show risk flagged",                 reason: "Past pattern · auto-confirm SMS dispatched",     severity: "warn",     agent: "Ops Brain",        meta: { confidence: 0.76 } },
  { title: "Outbound winback sent",                reason: "Lapsed guest · personalised by Concierge",       severity: "info",     agent: "Marketing" },
  { title: "Sentiment dip on call #1042",          reason: "Auto-escalated to floor manager",                severity: "critical", agent: "Voice Host",       meta: { confidence: 0.74 } },
  { title: "Friday demand exceeded forecast",      reason: "+16% vs last 4 weeks · revenue uplift $2,140",   severity: "success",  agent: "Insights" },
];

const sevColor: Record<string, string> = {
  info:     "hsl(36 96% 62%)",
  success:  "hsl(158 70% 52%)",
  warn:     "hsl(36 96% 62%)",
  critical: "hsl(0 78% 62%)",
};

type BrainEvent = {
  id: string;
  title: string;
  reason: string | null;
  severity: "info" | "success" | "warn" | "critical";
  meta: any;
  created_at: string;
};

// ───────────────────────── Live Tile ─────────────────────────
function LiveTile({
  icon: Icon, label, value, sub, glow = "primary",
}: { icon: any; label: string; value: string; sub?: string; glow?: string }) {
  return (
    <div className="card-cine relative p-5 overflow-hidden group">
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-50 group-hover:opacity-80 transition-opacity blur-3xl"
        style={{ background: `radial-gradient(circle, hsl(var(--${glow}) / 0.35), transparent 70%)` }} />
      <div className="relative flex items-start justify-between">
        <div className="space-y-1">
          <div className="label-micro">{label}</div>
          <div className="text-[26px] font-semibold tracking-tight num-cine">{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
        <div className="h-9 w-9 rounded-xl grid place-items-center bg-white/[0.03] border border-white/[0.06]">
          <Icon className="h-4 w-4 text-primary" strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Workforce orb ─────────────────────────
function AgentOrb({ name, role, busy, icon: Icon }: { name: string; role: string; busy: number; icon: any }) {
  return (
    <div className="card-cine relative p-4 flex items-center gap-3 overflow-hidden">
      <div className="absolute inset-0 opacity-40"
        style={{ background: "radial-gradient(circle at 0% 0%, hsl(var(--primary)/0.12), transparent 60%)" }} />
      <div className="relative">
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full bg-primary/40 blur-md"
        />
        <div className="relative h-11 w-11 rounded-full grid place-items-center bg-gradient-to-br from-primary via-primary to-primary-deep border border-white/10 shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.6)]">
          <Icon className="h-5 w-5 text-primary-foreground" strokeWidth={2.2} />
        </div>
      </div>
      <div className="relative flex-1 min-w-0">
        <div className="text-[13px] font-semibold truncate">{name}</div>
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground truncate">{role}</div>
        <div className="mt-1.5 h-1 rounded-full bg-white/[0.05] overflow-hidden">
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${busy}%` }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-primary to-primary-glow"
          />
        </div>
      </div>
      <div className="relative text-[11px] tabular-nums text-muted-foreground">{busy}%</div>
    </div>
  );
}

// ───────────────────────── Page ─────────────────────────
export default function VenueLive() {
  const { venue } = useAuth();
  const [events, setEvents] = useState<BrainEvent[]>([]);
  const [demoOn, setDemoOn] = useState(false);
  const [counters, setCounters] = useState({ calls: 12, bookings: 38, revenue: 7820, vip: 4, waitlist: 12 });

  // load recent events
  useEffect(() => {
    if (!venue) return;
    (async () => {
      const { data } = await supabase
        .from("brain_events")
        .select("id,title,reason,severity,meta,created_at")
        .eq("venue_id", venue.id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (data) setEvents(data as any);
    })();

    const ch = supabase
      .channel(`brain_events:${venue.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "brain_events", filter: `venue_id=eq.${venue.id}` },
        (p) => setEvents((prev) => [p.new as any, ...prev].slice(0, 40)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [venue?.id]);

  // demo mode — pump synthetic events into brain_events
  useEffect(() => {
    if (!demoOn || !venue) return;
    const tick = async () => {
      const t = DEMO_TEMPLATES[Math.floor(Math.random() * DEMO_TEMPLATES.length)];
      await supabase.from("brain_events").insert({
        venue_id: venue.id,
        title: t.title,
        reason: t.reason,
        severity: t.severity,
        meta: t.meta || {},
      });
      setCounters((c) => ({
        calls: c.calls + (Math.random() > 0.6 ? 1 : 0),
        bookings: c.bookings + (Math.random() > 0.55 ? 1 : 0),
        revenue: c.revenue + Math.floor(60 + Math.random() * 280),
        vip: c.vip + (Math.random() > 0.85 ? 1 : 0),
        waitlist: Math.max(0, c.waitlist + (Math.random() > 0.5 ? 1 : -1)),
      }));
    };
    const id = setInterval(tick, 2200);
    tick();
    return () => clearInterval(id);
  }, [demoOn, venue?.id]);

  const occupancy = useMemo(() => 62 + (counters.bookings % 20), [counters.bookings]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Venue Live"
        subtitle="Air-traffic control for your venue. AI agents, guests and revenue moving in real time."
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] text-[11px] uppercase tracking-wider text-muted-foreground">
              <Radio className="h-3 w-3 text-primary" />
              {events.length} events streaming
            </div>
            <Button
              onClick={() => setDemoOn((v) => !v)}
              variant={demoOn ? "secondary" : "default"}
              className={demoOn ? "" : "shadow-[0_8px_30px_-8px_hsl(var(--primary)/0.6)]"}
            >
              {demoOn ? <><Activity className="h-4 w-4 mr-2 animate-pulse" /> Demo Live</> : <><Play className="h-4 w-4 mr-2" /> Launch Demo</>}
            </Button>
          </div>
        }
      />

      {/* Live tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <LiveTile icon={Phone} label="Calls handled" value={String(counters.calls)} sub="last 60 min" />
        <LiveTile icon={CalendarCheck2} label="Bookings today" value={String(counters.bookings)} sub="+ live waitlist" />
        <LiveTile icon={TrendingUp} label="Revenue influenced" value={`$${counters.revenue.toLocaleString()}`} sub="AI attributed" />
        <LiveTile icon={Crown} label="VIP arrivals" value={String(counters.vip)} sub="next: 8:15pm" />
        <LiveTile icon={Users} label="Waitlist pressure" value={String(counters.waitlist)} sub={`avg ${10 + (counters.waitlist % 12)} min`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2 card-cine relative p-6 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.25), transparent 70%)" }} />
          <div className="relative flex items-center justify-between mb-5">
            <div>
              <div className="label-micro mb-1.5 flex items-center gap-2">
                <span className="pulse-amber" /> AI Timeline
              </div>
              <div className="text-[19px] font-semibold tracking-tight">Live operational stream</div>
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {events.length ? "streaming" : "idle"}
            </div>
          </div>

          {events.length === 0 ? (
            <div className="relative py-14 text-center">
              <Sparkles className="h-7 w-7 mx-auto text-primary/70 mb-3" />
              <div className="text-[14px] font-medium">Your operational intelligence feed will appear here.</div>
              <div className="text-[12px] text-muted-foreground mt-1">Press <span className="text-foreground font-medium">Launch Demo</span> to see your venue come alive.</div>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[15px] top-1 bottom-1 w-px bg-gradient-to-b from-primary/40 via-white/[0.06] to-transparent" />
              <ul className="space-y-3 max-h-[560px] overflow-y-auto pr-2">
                <AnimatePresence initial={false}>
                  {events.map((ev) => {
                    const t = new Date(ev.created_at);
                    const conf = ev.meta?.confidence ? Math.round(ev.meta.confidence * 100) : null;
                    return (
                      <motion.li
                        key={ev.id}
                        layout
                        initial={{ opacity: 0, x: -10, filter: "blur(6px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
                        className="relative pl-10"
                      >
                        <span
                          className="absolute left-[8px] top-3 h-3.5 w-3.5 rounded-full"
                          style={{
                            background: sevColor[ev.severity],
                            boxShadow: `0 0 0 3px hsl(28 18% 6%), 0 0 14px ${sevColor[ev.severity]}`,
                          }}
                        />
                        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.035] transition-colors p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[13.5px] font-medium leading-snug">{ev.title}</div>
                              {ev.reason && <div className="text-[12px] text-muted-foreground mt-1">{ev.reason}</div>}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[11px] tabular-nums text-muted-foreground">
                                {t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </div>
                              {conf !== null && (
                                <div className="mt-1 text-[10px] uppercase tracking-wider text-primary/90">
                                  conf {conf}%
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Operational health */}
          <div className="card-cine relative p-6 overflow-hidden">
            <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-40 blur-3xl"
              style={{ background: "radial-gradient(circle, hsl(158 70% 50% / 0.25), transparent 70%)" }} />
            <div className="label-micro mb-1.5">Operational Health</div>
            <div className="text-[19px] font-semibold tracking-tight mb-4">Service running smoothly</div>
            <div className="space-y-3">
              {[
                { label: "Floor occupancy", v: occupancy, color: "from-primary to-primary-glow" },
                { label: "Kitchen load", v: 48, color: "from-emerald-400 to-emerald-300" },
                { label: "AI handling rate", v: 91, color: "from-primary to-amber-300" },
                { label: "Guest sentiment", v: 86, color: "from-amber-300 to-rose-300" },
              ].map((m) => (
                <div key={m.label}>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="tabular-nums">{m.v}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${m.v}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className={`h-full bg-gradient-to-r ${m.color}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Workforce */}
          <div className="card-cine relative p-6 overflow-hidden">
            <div className="label-micro mb-1.5">AI Workforce</div>
            <div className="text-[19px] font-semibold tracking-tight mb-4">Five agents on shift</div>
            <div className="space-y-2.5">
              <AgentOrb name="Voice Host"      role="Inbound · phone"        busy={82} icon={Mic} />
              <AgentOrb name="Booking Agent"   role="Reservations · waitlist" busy={64} icon={CalendarCheck2} />
              <AgentOrb name="Ops Brain"       role="Optimisation · routing" busy={48} icon={Workflow} />
              <AgentOrb name="Concierge"       role="Guest intelligence"     busy={37} icon={Crown} />
              <AgentOrb name="Marketing"       role="Winback · campaigns"    busy={22} icon={Zap} />
            </div>
          </div>

          {/* Risk callout */}
          <div className="card-cine relative p-5 overflow-hidden">
            <div className="absolute inset-0 opacity-50"
              style={{ background: "radial-gradient(circle at 100% 0%, hsl(36 96% 60% / 0.18), transparent 60%)" }} />
            <div className="relative flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl grid place-items-center bg-amber-500/15 border border-amber-400/30">
                <AlertTriangle className="h-4 w-4 text-amber-300" />
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">Friday demand trending +16%</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  Open 4 outdoor tables and extend deposit window to capture est. <span className="text-foreground">$2,140</span> uplift.
                </div>
                <Button size="sm" variant="secondary" className="mt-3">
                  <Bot className="h-3.5 w-3.5 mr-1.5" /> Apply recommendation
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
