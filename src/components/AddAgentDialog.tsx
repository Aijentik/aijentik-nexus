import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ShoppingBag, Calendar, Sparkles, Megaphone, Users, Mic, Loader2, Check, Plus,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

type AgentDef = {
  kind: string;
  name: string;
  tag: string;
  icon: any;
  color: string;
  desc: string;
  capabilities: string[];
  channels: string[];
  impact: string;
  enablesFeature?: string;
};

const CATALOG: AgentDef[] = [
  { kind: "voice",     name: "Voice Host",      tag: "Calls",         icon: Mic,         color: "hsl(32 96% 58%)",  desc: "Answers calls, takes bookings and handles changes.", capabilities: ["Bookings", "Modifications", "Waitlist", "Transfers"], channels: ["Phone"], impact: "+12% answered calls" },
  { kind: "booking",   name: "Reservations AI", tag: "Diary",         icon: Calendar,    color: "hsl(38 100% 70%)", desc: "Confirms, reminds, takes deposits, handles no-shows.", capabilities: ["Deposits", "Reminders", "Wait list"], channels: ["SMS", "Email", "WhatsApp"], impact: "-38% no-shows" },
  { kind: "ordering",  name: "Ordering Agent",  tag: "Takeaway · Delivery", icon: ShoppingBag, color: "hsl(150 70% 50%)", desc: "Takes orders by voice and chat with menu memory and upsells.", capabilities: ["Voice ordering", "Menu intelligence", "Upsells", "Payment links", "POS sync"], channels: ["Phone", "SMS", "WhatsApp", "Instagram", "Messenger", "Web chat"], impact: "+18% avg basket", enablesFeature: "ordering" },
  { kind: "concierge", name: "VIP Concierge",   tag: "Loyalty",       icon: Sparkles,    color: "hsl(38 100% 78%)", desc: "Recognises regulars, remembers preferences, surprises guests.", capabilities: ["Guest memory", "Preferences", "Surprise & delight"], channels: ["All"], impact: "Higher LTV" },
  { kind: "marketing", name: "Re-engagement",   tag: "Marketing",     icon: Megaphone,   color: "hsl(28 88% 60%)",  desc: "Wins back lapsed guests with timed, on-brand outreach.", capabilities: ["Lapsed targeting", "On-brand copy", "Quiet hours"], channels: ["SMS", "Email", "WhatsApp"], impact: "Recover 8-14% lapsed" },
  { kind: "events",    name: "Events AI",       tag: "Events",        icon: Users,       color: "hsl(214 89% 56%)", desc: "Qualifies enquiries, sends proposals, holds dates.", capabilities: ["Qualification", "Proposals", "Holds"], channels: ["Email", "Web chat"], impact: "2x faster quotes" },
];

export function AddAgentDialog({
  open, onOpenChange, existingKinds, onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existingKinds: string[];
  onAdded: () => void;
}) {
  const { venue, setActiveVenue } = useAuth();
  const [adding, setAdding] = useState<string | null>(null);

  const add = async (def: AgentDef) => {
    if (!venue) return;
    setAdding(def.kind);
    try {
      const exists = existingKinds.includes(def.kind);
      if (!exists) {
        const { error } = await supabase.from("agents").insert({
          venue_id: venue.id,
          kind: def.kind,
          name: def.name,
          status: "active",
          prompt: def.desc,
        });
        if (error) throw error;
      }
      if (def.enablesFeature) {
        const features = { ...((venue as any).features || {}) };
        features[def.enablesFeature] = true;
        const { error: fe } = await supabase.from("venues").update({ features }).eq("id", venue.id);
        if (fe) throw fe;
        setActiveVenue(venue.id);
      }
      await supabase.from("brain_events").insert({
        venue_id: venue.id,
        title: `${def.name} added to workforce`,
        reason: `${def.tag} agent provisioned with smart defaults.`,
        severity: "success",
      });
      toast.success(`${def.name} is live`);
      onAdded();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Could not add agent");
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-[hsl(28_22%_5%/0.96)] border-white/[0.06] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Hire a new AI agent</DialogTitle>
          <DialogDescription>Each agent is an autonomous teammate. Smart defaults applied instantly — refine anytime.</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4 mt-2">
          {CATALOG.map((def, i) => {
            const I = def.icon;
            const already = existingKinds.includes(def.kind);
            return (
              <motion.div
                key={def.kind}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="card-cine p-4 relative overflow-hidden"
              >
                <div className="absolute -top-16 -right-16 w-36 h-36 rounded-full blur-3xl opacity-25 pointer-events-none" style={{ background: def.color }} />
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 grid place-items-center shrink-0"
                    style={{ boxShadow: `0 0 18px ${def.color}30 inset` }}>
                    <I className="h-5 w-5" style={{ color: def.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-[14px] truncate">{def.name}</div>
                      {already && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border border-[hsl(var(--success))]/30">Active</span>}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: def.color, opacity: 0.85 }}>{def.tag}</div>
                    <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{def.desc}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {def.capabilities.slice(0, 4).map(c => (
                    <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-muted-foreground">{c}</span>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[10.5px]">
                  <div className="rounded-lg bg-black/30 border border-white/[0.05] px-2 py-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Channels</div>
                    <div className="truncate">{def.channels.join(" · ")}</div>
                  </div>
                  <div className="rounded-lg bg-black/30 border border-white/[0.05] px-2 py-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Impact</div>
                    <div className="truncate">{def.impact}</div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-white/[0.05] flex gap-2">
                  <Button
                    size="sm"
                    disabled={adding === def.kind || (already && !def.enablesFeature)}
                    onClick={() => add(def)}
                    className="flex-1 h-8 text-[11px] bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40"
                  >
                    {adding === def.kind
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Provisioning…</>
                      : already && !def.enablesFeature
                        ? <><Check className="h-3 w-3 mr-1" /> In your workforce</>
                        : already && def.enablesFeature
                          ? <><Sparkles className="h-3 w-3 mr-1" /> Re-enable module</>
                          : <><Plus className="h-3 w-3 mr-1" /> Add agent</>}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
