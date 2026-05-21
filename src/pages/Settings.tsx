import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Phone, Sparkles, Loader2, Users, Plus, Trash2, ShieldCheck, Crown } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Member = { id: string; user_id: string; role: string; display_name?: string | null };

export default function Settings() {
  const { user, venue, refreshVenues, setActiveVenue } = useAuth();
  const [v, setV] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [newVenueOpen, setNewVenueOpen] = useState(false);
  const [newVenueName, setNewVenueName] = useState("");
  const [creatingVenue, setCreatingVenue] = useState(false);

  const loadVenue = async () => {
    if (!venue) return;
    const { data } = await supabase.from("venues").select("*").eq("id", venue.id).single();
    setV(data);
    setOwnerId(data?.owner_id ?? null);
  };

  const loadMembers = async () => {
    if (!venue) return;
    const { data: roles } = await supabase.from("user_roles").select("id, user_id, role").eq("venue_id", venue.id);
    const ids = Array.from(new Set((roles || []).map(r => r.user_id)));
    let profilesById: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ids);
      profilesById = Object.fromEntries((profs || []).map(p => [p.user_id, p.display_name || ""]));
    }
    setMembers((roles || []).map(r => ({ ...r, display_name: profilesById[r.user_id] })));
  };

  useEffect(() => { loadVenue(); loadMembers(); }, [venue?.id]);

  const isOwner = !!user && !!ownerId && user.id === ownerId;

  const save = async () => {
    if (!v) return;
    setSaving(true);
    const { error } = await supabase.from("venues").update({
      name: v.name, phone: v.phone, website: v.website, address: v.address, city: v.city,
      brand_voice: v.brand_voice, description: v.description, capacity: v.capacity,
      forwarded_number: v.forwarded_number, features: v.features || {},
    }).eq("id", v.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    refreshVenues();
  };

  const toggleFeature = (key: string) => {
    const features = { ...(v.features || {}) };
    features[key] = !features[key];
    setV({ ...v, features });
  };

  const changeRole = async (id: string, role: string) => {
    const { error } = await supabase.from("user_roles").update({ role: role as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    loadMembers();
  };

  const removeMember = async (id: string, user_id: string) => {
    if (user_id === ownerId) return toast.error("Cannot remove venue owner");
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Member removed");
    loadMembers();
  };

  const createVenue = async () => {
    if (!user) return;
    const name = newVenueName.trim();
    if (!name) return toast.error("Venue name is required");
    setCreatingVenue(true);
    const { data, error } = await supabase
      .from("venues")
      .insert({ name, owner_id: user.id })
      .select("id")
      .single();
    if (!error && data) {
      await supabase.from("user_roles").insert({ user_id: user.id, venue_id: data.id, role: "owner" as any });
    }
    setCreatingVenue(false);
    if (error) return toast.error(error.message);
    toast.success("Venue created");
    setNewVenueOpen(false);
    setNewVenueName("");
    await refreshVenues();
    if (data?.id) await setActiveVenue(data.id);
  };

  if (!v) return <PageHeader title="Settings" />;

  const Section = ({ icon: Icon, title, hint, actions, children }: any) => (
    <div className="card-cine p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="h-10 w-10 rounded-xl bg-primary/12 border border-primary/25 grid place-items-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[15px]">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
        </div>
        {actions}
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
      <PageHeader
        title="Settings"
        subtitle="Venue profile, voice, routing and team — the foundation your AI works from."
        actions={
          <Dialog open={newVenueOpen} onOpenChange={setNewVenueOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="lg" className="h-11 border-white/[0.08]">
                <Plus className="h-4 w-4 mr-2" /> New venue
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create a new venue</DialogTitle></DialogHeader>
              <div className="space-y-2 pt-2">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Venue name</Label>
                <Input value={newVenueName} onChange={e => setNewVenueName(e.target.value)} placeholder="e.g. The Wharf, Soho" />
                <p className="text-xs text-muted-foreground pt-1">You'll be set as owner. The new venue starts empty — add team, integrations and floor plan from this page.</p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setNewVenueOpen(false)}>Cancel</Button>
                <Button onClick={createVenue} disabled={creatingVenue}>
                  {creatingVenue ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create venue
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid lg:grid-cols-2 gap-5 max-w-5xl">
        <Section icon={Building2} title="Venue profile" hint="The basics your AI needs to introduce your brand.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Venue name"><Input className="bg-black/30 border-white/[0.06]" value={v.name || ""} onChange={e => setV({...v, name: e.target.value})} /></Field>
            <Field label="Capacity"><Input type="number" min={0} className="bg-black/30 border-white/[0.06]" value={v.capacity || 0} onChange={e => setV({...v, capacity: +e.target.value})} /></Field>
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

        <Section icon={Sparkles} title="Capabilities" hint="Turn on modules as you need them. Saved when you hit Save changes.">
          <FeatureToggle
            label="Ordering"
            hint="Live order kanban across WhatsApp, Instagram, SMS, phone and web."
            enabled={!!v.features?.ordering}
            onToggle={() => toggleFeature("ordering")}
          />
        </Section>


        <Section
          icon={Users}
          title="Team & roles"
          hint={isOwner ? "Owners and managers can edit; staff can view operations." : "Only the venue owner can change roles."}
        >
          {members.length === 0 ? (
            <div className="text-sm text-muted-foreground">No members yet.</div>
          ) : (
            <div className="space-y-2">
              {members.map(m => {
                const isVenueOwner = m.user_id === ownerId;
                const isSelf = m.user_id === user?.id;
                return (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/[0.05]">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-xs font-semibold text-primary-foreground border border-white/10 shrink-0">
                      {(m.display_name?.[0] || "?").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate flex items-center gap-1.5">
                        {m.display_name || m.user_id.slice(0, 8)}
                        {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
                        {isVenueOwner && <Crown className="h-3 w-3 text-primary" />}
                      </div>
                      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <ShieldCheck className="h-2.5 w-2.5" /> {m.role}
                      </div>
                    </div>
                    {isOwner && !isVenueOwner ? (
                      <>
                        <Select value={m.role} onValueChange={(r) => changeRole(m.id, r)}>
                          <SelectTrigger className="h-8 w-32 bg-black/40 border-white/[0.06] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => removeMember(m.id, m.user_id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          title="Remove member"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          {!isOwner && (
            <div className="text-[11px] text-muted-foreground italic pt-1">
              Ask the venue owner to invite new members or change roles.
            </div>
          )}
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
