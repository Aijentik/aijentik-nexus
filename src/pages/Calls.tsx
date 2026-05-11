import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Phone, PhoneIncoming, PhoneOff, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";

const outcomeStyle = (o?: string) => {
  switch (o) {
    case "booking":  return { color: "hsl(var(--success))",     label: "Booking" };
    case "info":     return { color: "hsl(32 96% 58%)",         label: "Info" };
    case "transfer": return { color: "hsl(38 100% 70%)",        label: "Transfer" };
    case "missed":   return { color: "hsl(var(--destructive))", label: "Missed" };
    default:         return { color: "hsl(var(--muted-foreground))", label: o || "Other" };
  }
};

export default function Calls() {
  const { venue } = useAuth();
  const [calls, setCalls] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);

  useEffect(() => {
    if (!venue) return;
    supabase.from("calls").select("*").eq("venue_id", venue.id).order("started_at", { ascending: false }).limit(60)
      .then(({ data }) => { setCalls(data || []); setSel((data || [])[0]); });
  }, [venue]);

  return (
    <>
      <PageHeader title="Calls" subtitle="Every conversation your AI host handled — fully transcribed, fully searchable." />

      <div className="grid lg:grid-cols-[360px_1fr] gap-5">
        <div className="card-cine flex flex-col max-h-[72vh]">
          <div className="p-4 border-b border-white/[0.05]">
            <div className="label-micro">Inbox</div>
            <div className="font-medium text-[15px] mt-0.5">Recent calls · {calls.length}</div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
            {calls.length === 0 && (
              <div className="p-12 text-center">
                <Phone className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <div className="text-sm font-medium mb-1">No calls yet.</div>
                <div className="text-xs text-muted-foreground">When your number rings, the conversation streams here.</div>
              </div>
            )}
            {calls.map((c, i) => {
              const o = outcomeStyle(c.outcome);
              const active = sel?.id === c.id;
              return (
                <motion.button
                  key={c.id}
                  onClick={() => setSel(c)}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.25) }}
                  className={`w-full text-left p-4 transition-all relative ${active ? 'bg-primary/[0.06]' : 'hover:bg-white/[0.025]'}`}
                >
                  {active && <span className="absolute left-0 top-3 bottom-3 w-[2.5px] rounded-r-full bg-gradient-to-b from-primary-glow to-primary shadow-[0_0_10px_hsl(var(--primary)/0.7)]" />}
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 grid place-items-center">
                      <PhoneIncoming className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate font-mono">{c.caller || "Unknown"}</div>
                      <div className="text-[11px] text-muted-foreground">{format(new Date(c.started_at), "d MMM HH:mm")} · {c.duration_seconds}s</div>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border" style={{ color: o.color, borderColor: `${o.color}30`, background: `${o.color}10` }}>
                      {o.label}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="card-cine p-7 min-h-[72vh]">
          {sel ? (
            <>
              <div className="flex items-start justify-between mb-6 pb-5 border-b border-white/[0.05]">
                <div>
                  <div className="label-micro mb-1.5 flex items-center gap-2">
                    <Sparkles className="h-3 w-3 text-primary" /> AI summary
                  </div>
                  <div className="text-lg font-medium tracking-tight">{sel.summary || "—"}</div>
                  <div className="text-[11px] text-muted-foreground mt-2 font-mono">
                    {sel.caller || "Unknown"} · {format(new Date(sel.started_at), "EEE d MMM HH:mm")} · {sel.duration_seconds}s
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border" style={{
                  color: outcomeStyle(sel.outcome).color,
                  borderColor: `${outcomeStyle(sel.outcome).color}30`,
                  background: `${outcomeStyle(sel.outcome).color}10`
                }}>
                  {outcomeStyle(sel.outcome).label}
                </span>
              </div>
              <div className="space-y-2.5">
                {(sel.transcript || []).map((t: any, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className={`p-3.5 rounded-xl text-[13.5px] leading-relaxed border ${
                      t.role === 'user'
                        ? 'bg-primary/[0.06] ml-10 border-primary/15'
                        : 'bg-white/[0.02] mr-10 border-white/[0.06]'
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
                      style={{ color: t.role === 'user' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>
                      {t.role === 'user' ? <><span className="pulse-amber !h-1 !w-1" /> Caller</> : <><Sparkles className="h-2.5 w-2.5" /> Agent</>}
                    </div>
                    {t.text}
                  </motion.div>
                ))}
                {(!sel.transcript || sel.transcript.length === 0) && (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    <PhoneOff className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No transcript captured for this call.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              Select a call to view the full transcript.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
