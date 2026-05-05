import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Sparkles, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Step = { step: string; message: string; data?: any; venue_id?: string };

export default function Onboarding() {
  const nav = useNavigate();
  const { refreshVenues, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [form, setForm] = useState({ name: "", website: "", venue_type: "restaurant", cuisine: "", city: "", phone: "" });

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return toast.error("Venue name required");
    setBusy(true); setSteps([]);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboard-venue`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify(form),
      });
      if (!res.ok || !res.body) throw new Error(`Build failed: ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let venueId: string | undefined;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const ev = JSON.parse(line.slice(6)) as Step;
          setSteps(s => [...s, ev]);
          if (ev.venue_id) venueId = ev.venue_id;
          if (ev.step === "done") {
            await refreshVenues();
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/seed-demo`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
              body: JSON.stringify({ venue_id: venueId }),
            });
            setTimeout(() => nav("/app"), 1200);
          }
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="p-8 md:p-12 flex flex-col justify-center max-w-2xl">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_0_20px_hsl(var(--primary)/0.6)]">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="font-semibold tracking-tight">Aijentik</div>
        </div>

        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2">Build your venue in 60 seconds.</h1>
        <p className="text-muted-foreground mb-8">Tell us about your venue. We'll spin up your voice host, knowledge base, agents, and diary.</p>

        <form onSubmit={start} className="space-y-4 glass-strong rounded-2xl p-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Label>Venue name *</Label><Input className="mt-1.5" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Lumière" /></div>
            <div><Label>Website</Label><Input className="mt-1.5" value={form.website} onChange={e => setForm({...form, website: e.target.value})} placeholder="https://…" /></div>
            <div><Label>Phone</Label><Input className="mt-1.5" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+1 …" /></div>
            <div><Label>Type</Label>
              <select className="mt-1.5 w-full h-10 rounded-md bg-input border border-input px-3 text-sm" value={form.venue_type} onChange={e => setForm({...form, venue_type: e.target.value})}>
                <option value="restaurant">Restaurant</option><option value="bar">Bar</option><option value="cafe">Café</option>
                <option value="hotel">Hotel</option><option value="club">Club</option>
              </select>
            </div>
            <div><Label>Cuisine / vibe</Label><Input className="mt-1.5" value={form.cuisine} onChange={e => setForm({...form, cuisine: e.target.value})} placeholder="Modern French" /></div>
            <div className="sm:col-span-2"><Label>City</Label><Input className="mt-1.5" value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="London" /></div>
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2"/> Building…</> : <>Build my venue <ArrowRight className="ml-2 h-4 w-4" /></>}
          </Button>
        </form>
      </div>

      <div className="hidden lg:flex flex-col p-12 relative overflow-hidden bg-gradient-to-br from-card/50 to-background">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute top-20 right-20 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">Live build feed</div>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
            <AnimatePresence>
              {steps.length === 0 && (
                <div className="text-sm text-muted-foreground glass rounded-xl p-4">Awaiting input — your build feed will stream here.</div>
              )}
              {steps.map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass rounded-xl p-4 flex items-start gap-3">
                  {s.step === "done" ? <CheckCircle2 className="h-5 w-5 text-primary shrink-0" /> : <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.step}</div>
                    <div className="text-sm">{s.message}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
