import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { motion, AnimatePresence } from "framer-motion";
import { Brain as BrainIcon } from "lucide-react";

export default function LiveBrain() {
  const { venue } = useAuth();
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!venue) return;
    let active = true;
    supabase.from("brain_events").select("*").eq("venue_id", venue.id).order("created_at", { ascending: false }).limit(80)
      .then(({ data }) => { if (active) setEvents(data || []); });
    const ch = supabase.channel("brain:" + venue.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "brain_events", filter: `venue_id=eq.${venue.id}` },
        (p) => setEvents(e => [p.new, ...e].slice(0, 100))).subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [venue]);

  const sevColor = (s: string) => s === 'success' ? 'hsl(var(--success))' : s === 'warn' ? 'hsl(var(--warn))' : s === 'critical' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))';

  return (
    <>
      <PageHeader title="Live Brain" subtitle="Every decision your AI makes — narrated in real time." />
      <div className="glass-strong rounded-3xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <BrainIcon className="h-5 w-5 text-primary" />
          <span className="text-sm">Streaming · {events.length} events</span>
          <span className="pulse-dot ml-2" />
        </div>
        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
          <AnimatePresence initial={false}>
            {events.map(e => (
              <motion.div key={e.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                className="glass rounded-xl p-4 flex items-start gap-3 hover:border-primary/20 transition-colors">
                <div className="h-2 w-2 rounded-full mt-2 shrink-0" style={{ background: sevColor(e.severity) }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{e.title}</div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{new Date(e.created_at).toLocaleTimeString()}</span>
                  </div>
                  {e.reason && <div className="text-sm text-muted-foreground mt-1">{e.reason}</div>}
                </div>
              </motion.div>
            ))}
            {events.length === 0 && <div className="text-sm text-muted-foreground text-center py-12">Brain is quiet. Make a call or seed demo data.</div>}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
