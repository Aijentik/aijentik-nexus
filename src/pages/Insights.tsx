import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Insights() {
  const { venue, session } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!venue) return;
    const { data } = await supabase.from("insights").select("*").eq("venue_id", venue.id).order("created_at", { ascending: false });
    setItems(data || []);
  };
  useEffect(() => { load(); }, [venue]);

  const generate = async () => {
    if (!venue) return;
    setBusy(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ venue_id: venue.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Insights generated");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Insights" subtitle="Overnight intelligence — actionable recommendations from your operations."
        actions={<Button onClick={generate} disabled={busy} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">{busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />} Generate now</Button>} />
      <div className="grid md:grid-cols-2 gap-4">
        {items.length === 0 && <div className="glass rounded-2xl p-12 text-center text-muted-foreground md:col-span-2">No insights yet. Click "Generate now".</div>}
        {items.map(i => (
          <div key={i.id} className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">{i.category}</span>
              {i.impact && <span>· {i.impact} impact</span>}
            </div>
            <div className="font-medium">{i.title}</div>
            <div className="text-sm text-muted-foreground mt-2">{i.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}
