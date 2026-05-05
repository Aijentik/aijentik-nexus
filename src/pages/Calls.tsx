import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Phone } from "lucide-react";
import { format } from "date-fns";

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
      <PageHeader title="Calls" subtitle="Every call answered by your AI host." />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="glass rounded-2xl divide-y divide-white/5 max-h-[70vh] overflow-y-auto">
          {calls.length === 0 && <div className="p-8 text-sm text-muted-foreground text-center">No calls yet.</div>}
          {calls.map(c => (
            <button key={c.id} onClick={() => setSel(c)} className={`w-full text-left p-4 hover:bg-secondary/30 transition-colors ${sel?.id === c.id ? 'bg-secondary/40' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/15 grid place-items-center"><Phone className="h-4 w-4 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.caller || "Unknown"}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(c.started_at), "d MMM HH:mm")} · {c.duration_seconds}s</div>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-primary/10 text-primary">{c.outcome}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="lg:col-span-2 glass-strong rounded-2xl p-6 min-h-[60vh]">
          {sel ? (
            <>
              <div className="mb-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Call summary</div>
                <div className="text-lg font-medium mt-1">{sel.summary || "—"}</div>
              </div>
              <div className="space-y-2">
                {(sel.transcript || []).map((t: any, i: number) => (
                  <div key={i} className={`p-3 rounded-xl text-sm ${t.role === 'user' ? 'bg-primary/10 ml-8' : 'bg-secondary/40 mr-8'}`}>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t.role}</div>{t.text}
                  </div>
                ))}
                {(!sel.transcript || sel.transcript.length === 0) && <div className="text-sm text-muted-foreground">No transcript captured.</div>}
              </div>
            </>
          ) : <div className="text-sm text-muted-foreground">Select a call to view transcript.</div>}
        </div>
      </div>
    </>
  );
}
