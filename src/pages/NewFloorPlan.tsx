import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const TEMPLATES = {
  intimate: { label: "Intimate bistro · ~24 seats", tables: [
    { label: "T1", capacity: 2, shape: "round", x: 80, y: 80 }, { label: "T2", capacity: 2, shape: "round", x: 200, y: 80 },
    { label: "T3", capacity: 2, shape: "round", x: 320, y: 80 }, { label: "T4", capacity: 4, shape: "square", x: 80, y: 220 },
    { label: "T5", capacity: 4, shape: "square", x: 220, y: 220 }, { label: "T6", capacity: 4, shape: "square", x: 360, y: 220 },
    { label: "Bar", capacity: 6, shape: "square", x: 540, y: 80 },
  ]},
  standard: { label: "Standard restaurant · ~60 seats", tables: [
    { label: "T1", capacity: 2, shape: "round", x: 60, y: 60 }, { label: "T2", capacity: 2, shape: "round", x: 180, y: 60 },
    { label: "T3", capacity: 2, shape: "round", x: 300, y: 60 }, { label: "T4", capacity: 2, shape: "round", x: 420, y: 60 },
    { label: "T5", capacity: 4, shape: "square", x: 60, y: 200 }, { label: "T6", capacity: 4, shape: "square", x: 200, y: 200 },
    { label: "T7", capacity: 4, shape: "square", x: 340, y: 200 }, { label: "T8", capacity: 4, shape: "square", x: 480, y: 200 },
    { label: "T9", capacity: 6, shape: "square", x: 60, y: 360 }, { label: "T10", capacity: 6, shape: "square", x: 220, y: 360 },
    { label: "T11", capacity: 8, shape: "square", x: 380, y: 360 }, { label: "Bar", capacity: 8, shape: "square", x: 600, y: 60 },
  ]},
  large: { label: "Large brasserie · ~120 seats", tables: [
    ...Array.from({ length: 6 }, (_, i) => ({ label: `D${i+1}`, capacity: 2, shape: "round", x: 60 + i * 110, y: 60 })),
    ...Array.from({ length: 6 }, (_, i) => ({ label: `M${i+1}`, capacity: 4, shape: "square", x: 60 + i * 110, y: 200 })),
    ...Array.from({ length: 4 }, (_, i) => ({ label: `L${i+1}`, capacity: 6, shape: "square", x: 60 + i * 160, y: 360 })),
    { label: "Private", capacity: 10, shape: "square", x: 700, y: 360 },
    { label: "Bar", capacity: 12, shape: "square", x: 720, y: 60 },
  ]},
};

export default function NewFloorPlan() {
  const nav = useNavigate();
  const { refreshVenues, setActiveVenue } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", venue_type: "restaurant", template: "standard" as keyof typeof TEMPLATES });

  const create = async () => {
    if (!form.name.trim()) return toast.error("Name your venue");
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: venue, error } = await supabase.from("venues").insert({
        owner_id: user.id, name: form.name, venue_type: form.venue_type, status: "live",
      }).select().single();
      if (error) throw error;
      await supabase.from("user_roles").insert({ user_id: user.id, venue_id: venue.id, role: "owner" }).then(() => {});

      const tpl = TEMPLATES[form.template];
      await supabase.from("tables").insert(tpl.tables.map(t => ({ ...t, venue_id: venue.id, width: 80, height: 80 })));
      await supabase.from("brain_events").insert({ venue_id: venue.id, title: "Floor plan created", reason: `${tpl.label} template applied · ${tpl.tables.length} tables`, severity: "success" });

      await refreshVenues();
      await setActiveVenue(venue.id);
      toast.success(`${venue.name} ready`);
      nav("/app/floor");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="New floor plan" subtitle="Spin up a new venue with a starter table layout your AI can use immediately."
        actions={<Button variant="outline" onClick={() => nav("/app/floor")}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>}
      />
      <div className="grid lg:grid-cols-[420px,1fr] gap-4">
        <div className="glass-strong rounded-2xl p-6 space-y-4 h-fit">
          <div><Label>Venue name</Label><Input className="mt-1.5" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Lumière West End" /></div>
          <div><Label>Type</Label>
            <select className="mt-1.5 w-full h-10 rounded-md bg-input border border-input px-3 text-sm" value={form.venue_type} onChange={e => setForm({ ...form, venue_type: e.target.value })}>
              <option value="restaurant">Restaurant</option><option value="bar">Bar</option><option value="cafe">Café</option><option value="hotel">Hotel</option><option value="club">Club</option>
            </select>
          </div>
          <div>
            <Label>Starter template</Label>
            <div className="grid gap-2 mt-1.5">
              {(Object.keys(TEMPLATES) as Array<keyof typeof TEMPLATES>).map(k => (
                <button key={k} onClick={() => setForm({ ...form, template: k })}
                  className={`text-left rounded-xl p-3 border transition ${form.template === k ? "border-primary bg-primary/10" : "border-white/10 bg-secondary/40 hover:border-primary/40"}`}>
                  <div className="text-sm font-medium">{TEMPLATES[k].label}</div>
                  <div className="text-xs text-muted-foreground">{TEMPLATES[k].tables.length} tables</div>
                </button>
              ))}
            </div>
          </div>
          <Button onClick={create} disabled={busy} className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />} Create venue + floor plan
          </Button>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Preview · {TEMPLATES[form.template].label}</div>
          <div className="relative grid-bg rounded-xl min-h-[520px] overflow-hidden">
            {TEMPLATES[form.template].tables.map((t, i) => (
              <div key={i} style={{ left: t.x, top: t.y, width: 80, height: 80, borderRadius: t.shape === "round" ? "50%" : "12px" }}
                className="absolute bg-secondary/70 border border-white/10 flex flex-col items-center justify-center text-center">
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="text-[10px] text-muted-foreground">{t.capacity}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
