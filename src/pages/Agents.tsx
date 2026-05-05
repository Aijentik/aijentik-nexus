import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Bot, Mic, Calendar, Megaphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const icons: any = { voice: Mic, booking: Calendar, ops: Bot, marketing: Megaphone, concierge: Sparkles };

export default function Agents() {
  const { venue } = useAuth();
  const [agents, setAgents] = useState<any[]>([]);

  const load = async () => {
    if (!venue) return;
    const { data } = await supabase.from("agents").select("*").eq("venue_id", venue.id).order("created_at");
    setAgents(data || []);
  };
  useEffect(() => { load(); }, [venue]);

  const toggle = async (a: any) => {
    const next = a.status === "active" ? "paused" : "active";
    await supabase.from("agents").update({ status: next }).eq("id", a.id);
    await supabase.from("brain_events").insert({ venue_id: venue!.id, title: `Agent ${next}`, reason: `${a.name} ${next === 'active' ? 'resumed' : 'paused'} by operator.`, severity: next === 'active' ? 'success' : 'warn' });
    toast.success(`${a.name} ${next}`);
    load();
  };

  return (
    <>
      <PageHeader title="Agents" subtitle="Your AI workforce." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(a => {
          const I = icons[a.kind] || Bot;
          return (
            <div key={a.id} className="glass rounded-2xl p-5 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="h-11 w-11 rounded-xl bg-primary/15 grid place-items-center"><I className="h-5 w-5 text-primary" /></div>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${a.status === 'active' ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]' : 'bg-secondary text-muted-foreground'}`}>{a.status}</span>
              </div>
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-muted-foreground capitalize mt-0.5">{a.kind} agent</div>
              <div className="text-xs text-muted-foreground mt-3 line-clamp-2 min-h-[2rem]">{a.prompt || "—"}</div>
              <div className="flex gap-2 mt-4">
                {a.kind === "voice" && <Link to="/app/voice" className="flex-1"><Button size="sm" className="w-full bg-primary text-primary-foreground"><Mic className="h-3 w-3 mr-1.5" /> Talk</Button></Link>}
                <Button size="sm" variant="outline" onClick={() => toggle(a)} className="flex-1 border-white/10">{a.status === 'active' ? 'Pause' : 'Activate'}</Button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
