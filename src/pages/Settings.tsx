import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function Settings() {
  const { venue, refreshVenues } = useAuth();
  const [v, setV] = useState<any>(null);

  useEffect(() => {
    if (!venue) return;
    supabase.from("venues").select("*").eq("id", venue.id).single().then(({data}) => setV(data));
  }, [venue]);

  const save = async () => {
    if (!v) return;
    const { error } = await supabase.from("venues").update({
      name: v.name, phone: v.phone, website: v.website, address: v.address, city: v.city,
      brand_voice: v.brand_voice, description: v.description, capacity: v.capacity, forwarded_number: v.forwarded_number,
    }).eq("id", v.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    refreshVenues();
  };

  if (!v) return <PageHeader title="Settings" />;

  return (
    <>
      <PageHeader title="Settings" subtitle="Venue profile, brand voice, and call forwarding." />
      <div className="glass-strong rounded-2xl p-6 space-y-4 max-w-3xl">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Venue name</Label><Input className="mt-1.5" value={v.name || ""} onChange={e => setV({...v, name: e.target.value})} /></div>
          <div><Label>Phone</Label><Input className="mt-1.5" value={v.phone || ""} onChange={e => setV({...v, phone: e.target.value})} /></div>
          <div><Label>Website</Label><Input className="mt-1.5" value={v.website || ""} onChange={e => setV({...v, website: e.target.value})} /></div>
          <div><Label>Capacity</Label><Input type="number" className="mt-1.5" value={v.capacity || 0} onChange={e => setV({...v, capacity: +e.target.value})} /></div>
          <div className="sm:col-span-2"><Label>Address</Label><Input className="mt-1.5" value={v.address || ""} onChange={e => setV({...v, address: e.target.value})} /></div>
          <div><Label>City</Label><Input className="mt-1.5" value={v.city || ""} onChange={e => setV({...v, city: e.target.value})} /></div>
          <div><Label>Forwarded number</Label><Input className="mt-1.5" value={v.forwarded_number || ""} placeholder="+1 …" onChange={e => setV({...v, forwarded_number: e.target.value})} /></div>
          <div className="sm:col-span-2"><Label>Brand voice</Label><Input className="mt-1.5" value={v.brand_voice || ""} onChange={e => setV({...v, brand_voice: e.target.value})} /></div>
          <div className="sm:col-span-2"><Label>Description</Label><Textarea className="mt-1.5" rows={3} value={v.description || ""} onChange={e => setV({...v, description: e.target.value})} /></div>
        </div>
        <Button onClick={save} className="bg-primary text-primary-foreground">Save changes</Button>
      </div>
    </>
  );
}
