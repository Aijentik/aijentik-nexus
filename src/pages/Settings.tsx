import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Phone, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { venue, refreshVenues } = useAuth();
  const [v, setV] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!venue) return;
    supabase.from("venues").select("*").eq("id", venue.id).single().then(({data}) => setV(data));
  }, [venue]);

  const save = async () => {
    if (!v) return;
    setSaving(true);
    const { error } = await supabase.from("venues").update({
      name: v.name, phone: v.phone, website: v.website, address: v.address, city: v.city,
      brand_voice: v.brand_voice, description: v.description, capacity: v.capacity, forwarded_number: v.forwarded_number,
    }).eq("id", v.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    refreshVenues();
  };

  if (!v) return <PageHeader title="Settings" />;

  const Section = ({ icon: Icon, title, hint, children }: any) => (
    <div className="card-cine p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="h-10 w-10 rounded-xl bg-primary/12 border border-primary/25 grid place-items-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="font-medium text-[15px]">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );

  const Field = ({ label, children }: any) => (
    <div>
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );

  return (
    <>
      <PageHeader title="Settings" subtitle="Venue profile, voice and call routing — the foundation your AI works from." />

      <div className="grid lg:grid-cols-2 gap-5 max-w-5xl">
        <Section icon={Building2} title="Venue profile" hint="The basics your AI needs to introduce your brand.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Venue name"><Input className="bg-black/30 border-white/[0.06]" value={v.name || ""} onChange={e => setV({...v, name: e.target.value})} /></Field>
            <Field label="Capacity"><Input type="number" className="bg-black/30 border-white/[0.06]" value={v.capacity || 0} onChange={e => setV({...v, capacity: +e.target.value})} /></Field>
            <Field label="Website"><Input className="bg-black/30 border-white/[0.06]" value={v.website || ""} onChange={e => setV({...v, website: e.target.value})} /></Field>
            <Field label="City"><Input className="bg-black/30 border-white/[0.06]" value={v.city || ""} onChange={e => setV({...v, city: e.target.value})} /></Field>
            <div className="sm:col-span-2">
              <Field label="Address"><Input className="bg-black/30 border-white/[0.06]" value={v.address || ""} onChange={e => setV({...v, address: e.target.value})} /></Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Description"><Textarea rows={3} className="bg-black/30 border-white/[0.06]" value={v.description || ""} onChange={e => setV({...v, description: e.target.value})} /></Field>
            </div>
          </div>
        </Section>

        <Section icon={Phone} title="Call routing" hint="Where calls land, and where they go if you need a human.">
          <Field label="Public phone"><Input className="bg-black/30 border-white/[0.06] font-mono" value={v.phone || ""} onChange={e => setV({...v, phone: e.target.value})} /></Field>
          <Field label="Forwarded number"><Input className="bg-black/30 border-white/[0.06] font-mono" placeholder="+1 …" value={v.forwarded_number || ""} onChange={e => setV({...v, forwarded_number: e.target.value})} /></Field>
        </Section>

        <Section icon={Sparkles} title="Brand voice" hint="How your AI host speaks. One line, set the tone.">
          <Field label="Voice direction">
            <Input className="bg-black/30 border-white/[0.06]" placeholder="warm, professional, concise" value={v.brand_voice || ""} onChange={e => setV({...v, brand_voice: e.target.value})} />
          </Field>
          <div className="text-[11px] text-muted-foreground italic">e.g. "warm and conspiratorial, like a head waiter who's seen everything"</div>
        </Section>

        <div className="lg:col-span-2 flex justify-end">
          <Button
            onClick={save}
            disabled={saving}
            size="lg"
            className="bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40 px-6 h-11
              shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.7),0_1px_0_hsl(36_100%_90%_/_0.25)_inset]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save changes
          </Button>
        </div>
      </div>
    </>
  );
}
