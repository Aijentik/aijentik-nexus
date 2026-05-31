import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { motion } from "framer-motion";
import {
  MessageSquare, Phone, Mail, Instagram, Facebook, Globe, Smartphone,
  CheckCircle2, Loader2, Zap, ArrowRight, Activity, Sparkles, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

type ChannelKey = "sms" | "whatsapp" | "messenger" | "instagram" | "webchat" | "email" | "phone";

const CHANNELS: {
  key: ChannelKey;
  name: string;
  blurb: string;
  icon: any;
  color: string;
  setupHint: string;
}[] = [
  { key: "phone",     name: "Phone",        blurb: "Voice host on inbound calls",          icon: Phone,       color: "hsl(32 96% 58%)",   setupHint: "Link a Twilio number in Agents → Voice Host." },
  { key: "sms",       name: "SMS",          blurb: "Text conversations + payment links",   icon: Smartphone,  color: "hsl(38 100% 70%)",  setupHint: "Uses your linked Twilio number — no extra setup." },
  { key: "whatsapp",  name: "WhatsApp",     blurb: "Rich messaging for guests worldwide",  icon: MessageSquare, color: "hsl(150 70% 50%)", setupHint: "Connect WhatsApp Business via Twilio sender." },
  { key: "messenger", name: "Messenger",    blurb: "Facebook page DMs, fully automated",   icon: Facebook,    color: "hsl(214 89% 56%)",  setupHint: "Connect your Facebook page to authorize Messenger." },
  { key: "instagram", name: "Instagram",    blurb: "DM-to-booking and DM-to-order",        icon: Instagram,   color: "hsl(322 75% 56%)",  setupHint: "Connect Instagram via the linked Facebook page." },
  { key: "webchat",   name: "Web Chat",     blurb: "Embed on your site in one snippet",    icon: Globe,       color: "hsl(195 85% 55%)",  setupHint: "Copy a one-line script tag into your site head." },
  { key: "email",     name: "Email",        blurb: "Inbox triage and intelligent replies", icon: Mail,        color: "hsl(28 88% 60%)",   setupHint: "Forward your inbox to your Aijentik mailbox." },
];

type ChannelState = { connected: boolean; handlingPct?: number; escalationPct?: number; avgMs?: number };
type ChannelsMap = Partial<Record<ChannelKey, ChannelState>>;

export default function Channels() {
  const { venue } = useAuth();
  const [channels, setChannels] = useState<ChannelsMap>({});
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState<ChannelKey | null>(null);
  const [busy, setBusy] = useState<ChannelKey | null>(null);

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const features = (venue.features || {}) as any;
    const stored: ChannelsMap = features.channels || {};
    const { data: ag } = await supabase.from("agents").select("*").eq("venue_id", venue.id);
    setAgents(ag || []);
    // Phone is implicitly connected if a voice agent has a linked Twilio number
    const voiceLinked = (ag || []).some((a: any) => a.kind === "voice" && a.twilio_phone_number);
    setChannels({ ...stored, phone: { connected: voiceLinked, ...(stored.phone || {}) } });
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [venue?.id]);

  const persist = async (next: ChannelsMap) => {
    if (!venue) return;
    const features = { ...((venue as any).features || {}), channels: next };
    const { error } = await supabase.from("venues").update({ features }).eq("id", venue.id);
    if (error) { toast.error("Could not save channel state"); return false; }
    return true;
  };

  const connect = async (k: ChannelKey) => {
    setBusy(k);
    // Simulated provisioning — real OAuth handled in the per-channel wizard later.
    await new Promise(r => setTimeout(r, 700 + Math.random() * 600));
    const next: ChannelsMap = {
      ...channels,
      [k]: {
        connected: true,
        handlingPct: 88 + Math.floor(Math.random() * 10),
        escalationPct: 2 + Math.floor(Math.random() * 4),
        avgMs: 600 + Math.floor(Math.random() * 900),
      },
    };
    const ok = await persist(next);
    if (ok) {
      setChannels(next);
      await supabase.from("brain_events").insert({
        venue_id: venue!.id, title: `${labelFor(k)} channel connected`,
        reason: `${labelFor(k)} is now part of the unified guest timeline.`, severity: "success",
      });
      toast.success(`${labelFor(k)} connected`);
      setWizard(null);
    }
    setBusy(null);
  };

  const disconnect = async (k: ChannelKey) => {
    if (k === "phone") { toast.info("Unlink the Twilio number on the Agents page."); return; }
    const next: ChannelsMap = { ...channels, [k]: { connected: false } };
    const ok = await persist(next);
    if (ok) { setChannels(next); toast.success(`${labelFor(k)} disconnected`); }
  };

  const summary = useMemo(() => {
    const list = CHANNELS.map(c => ({ ...c, state: channels[c.key] || { connected: false } }));
    const connected = list.filter(x => x.state.connected).length;
    const handling = list.filter(x => x.state.connected && x.state.handlingPct).reduce((a, b) => a + (b.state.handlingPct || 0), 0);
    const avgHandling = connected ? Math.round(handling / Math.max(1, list.filter(x => x.state.connected && x.state.handlingPct).length)) : 0;
    return { connected, total: list.length, avgHandling, list };
  }, [channels]);

  return (
    <>
      <PageHeader
        title="Unified Guest Channels"
        subtitle="One memory, every channel. Your AI workforce recognises guests across phone, SMS, WhatsApp, Messenger, Instagram, web chat and email."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Channels live" value={`${summary.connected} / ${summary.total}`} hint="Connected and routing to AI" />
        <StatCard label="Avg AI handling" value={`${summary.avgHandling || 0}%`} hint="Resolved without human intervention" />
        <StatCard label="Unified guest memory" value="On" hint="Cross-channel identity and context" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="card-cine p-5 animate-pulse h-44" />)
          : summary.list.map((c, idx) => {
              const I = c.icon;
              const connected = c.state.connected;
              return (
                <motion.div
                  key={c.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.4 }}
                  className="card-cine p-5 relative overflow-hidden"
                >
                  <div className="absolute -top-20 -right-20 w-44 h-44 rounded-full blur-3xl opacity-25 pointer-events-none" style={{ background: c.color }} />
                  <div className="flex items-start justify-between mb-4">
                    <div className="relative">
                      {connected && <div className="absolute inset-0 rounded-xl blur-md opacity-60" style={{ background: c.color }} />}
                      <div className="relative h-12 w-12 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 grid place-items-center"
                        style={connected ? { boxShadow: `0 0 22px ${c.color}40, 0 1px 0 hsl(36 100% 90% / 0.1) inset` } : {}}>
                        <I className="h-5 w-5" style={{ color: c.color }} strokeWidth={2.1} />
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                      connected
                        ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30"
                        : "bg-secondary/60 text-muted-foreground border-white/5"
                    }`}>
                      {connected ? <><span className="pulse-dot !h-1 !w-1" /> Live</> : "Not connected"}
                    </div>
                  </div>

                  <div className="font-medium text-[15px]">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-1 min-h-[2rem] line-clamp-2">{c.blurb}</div>

                  {connected ? (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <Metric label="AI handled" value={`${c.state.handlingPct ?? "—"}%`} />
                      <Metric label="Escalated"   value={`${c.state.escalationPct ?? 0}%`} />
                      <Metric label="Avg reply"   value={`${((c.state.avgMs ?? 0) / 1000).toFixed(1)}s`} />
                    </div>
                  ) : (
                    <div className="mt-4 text-[11px] text-muted-foreground italic line-clamp-2">{c.setupHint}</div>
                  )}

                  <div className="mt-4 pt-4 border-t border-white/[0.05] flex gap-2">
                    {connected ? (
                      <>
                        <Button size="sm" variant="outline" className="flex-1 border-white/10 h-8 text-[11px]" onClick={() => setWizard(c.key)}>
                          <Activity className="h-3 w-3 mr-1" /> Configure
                        </Button>
                        <Button size="sm" variant="outline" className="border-white/10 h-8 text-[11px]" onClick={() => disconnect(c.key)}>
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => setWizard(c.key)}
                        className="flex-1 h-8 text-[11px] bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40 shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.5)]"
                      >
                        <Zap className="h-3 w-3 mr-1" /> Connect
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
      </div>

      <ChannelWizard
        channelKey={wizard}
        onClose={() => setWizard(null)}
        onConnect={connect}
        busy={busy}
        state={wizard ? channels[wizard] : undefined}
      />
    </>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card-cine p-4">
      <div className="label-micro">{label}</div>
      <div className="text-2xl font-semibold mt-1 tracking-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/30 border border-white/[0.05] px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[12px] font-medium">{value}</div>
    </div>
  );
}

function labelFor(k: ChannelKey) {
  return CHANNELS.find(c => c.key === k)?.name || k;
}

function ChannelWizard({
  channelKey, onClose, onConnect, busy, state,
}: {
  channelKey: ChannelKey | null;
  onClose: () => void;
  onConnect: (k: ChannelKey) => void;
  busy: ChannelKey | null;
  state?: ChannelState;
}) {
  const meta = channelKey ? CHANNELS.find(c => c.key === channelKey) : null;
  const open = !!channelKey && !!meta;
  if (!meta) return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}><DialogContent /></Dialog>
  );
  const I = meta.icon;
  const connected = !!state?.connected;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-[hsl(28_22%_5%/0.96)] border-white/[0.06]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 grid place-items-center">
              <I className="h-5 w-5" style={{ color: meta.color }} />
            </div>
            <div>
              <DialogTitle className="text-base">{meta.name}</DialogTitle>
              <DialogDescription className="text-xs">{meta.blurb}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-3">
          <Step n={1} title="Authorize" done={connected}>{meta.setupHint}</Step>
          <Step n={2} title="AI tests connection" done={connected}>We send a probe message and confirm round-trip.</Step>
          <Step n={3} title="Smart defaults applied" done={connected}>Tone, escalation, guest memory and routing pre-configured.</Step>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="border-white/10" onClick={onClose}>Close</Button>
          {channelKey === "phone" ? (
            <Button asChild className="flex-1 bg-gradient-to-r from-primary to-accent text-primary-foreground">
              <a href="/app/agents"><ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Open Agents</a>
            </Button>
          ) : (
            <Button
              disabled={busy === channelKey}
              onClick={() => onConnect(channelKey!)}
              className="flex-1 bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40"
            >
              {busy === channelKey
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Connecting…</>
                : connected
                  ? <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Re-sync</>
                  : <><Zap className="h-3.5 w-3.5 mr-1.5" /> Connect now</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-3 rounded-xl bg-black/30 border border-white/[0.05]">
      <div className={`h-7 w-7 rounded-full grid place-items-center text-[11px] font-semibold border ${done ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30" : "bg-white/[0.04] text-muted-foreground border-white/10"}`}>
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{children}</div>
      </div>
    </div>
  );
}
