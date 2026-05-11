import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Bot, Mic, Calendar, Megaphone, Sparkles, Phone, Copy, Check, Loader2, Settings2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { AgentConfigDialog } from "@/components/AgentConfigDialog";

const meta: any = {
  voice:    { icon: Mic,      tag: "Voice Host",    color: "hsl(32 96% 58%)",  desc: "Answers calls, takes bookings" },
  booking:  { icon: Calendar, tag: "Reservations",  color: "hsl(38 100% 70%)", desc: "Manages diary & deposits" },
  ops:      { icon: Bot,      tag: "Operations",    color: "hsl(22 88% 52%)",  desc: "Watches floor, sends alerts" },
  marketing:{ icon: Megaphone,tag: "Marketing",     color: "hsl(28 88% 60%)",  desc: "Re-engages past guests" },
  concierge:{ icon: Sparkles, tag: "Concierge",     color: "hsl(38 100% 78%)", desc: "VIP recall and recs" },
};

const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/twilio-voice-webhook`;

export default function Agents() {
  const { venue } = useAuth();
  const [agents, setAgents] = useState<any[]>([]);
  const [phoneEdits, setPhoneEdits] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [configAgent, setConfigAgent] = useState<any | null>(null);

  const load = async () => {
    if (!venue) return;
    const { data } = await supabase.from("agents").select("*").eq("venue_id", venue.id).order("created_at");
    setAgents(data || []);
    const seed: Record<string, string> = {};
    (data || []).forEach((a: any) => { seed[a.id] = a.twilio_phone_number || ""; });
    setPhoneEdits(seed);
  };
  useEffect(() => { load(); }, [venue]);

  const toggle = async (a: any) => {
    const next = a.status === "active" ? "paused" : "active";
    await supabase.from("agents").update({ status: next }).eq("id", a.id);
    await supabase.from("brain_events").insert({ venue_id: venue!.id, title: `Agent ${next}`, reason: `${a.name} ${next === 'active' ? 'resumed' : 'paused'} by operator.`, severity: next === 'active' ? 'success' : 'warn' });
    toast.success(`${a.name} ${next}`);
    load();
  };

  const savePhone = async (a: any) => {
    const raw = (phoneEdits[a.id] || "").trim();
    const value = raw === "" ? null : raw;
    if (value && !/^\+[1-9]\d{6,14}$/.test(value)) {
      toast.error("Use E.164 format, e.g. +14155551212");
      return;
    }
    setSavingId(a.id);
    try {
      if (value && !a.elevenlabs_agent_id) {
        const { data, error } = await supabase.functions.invoke("voice-token", { body: { venue_id: a.venue_id } });
        if (error || !data?.agent_id) throw new Error(error?.message || data?.error || "Could not prepare the voice agent");
      }
      const { error } = await supabase.from("agents").update({ twilio_phone_number: value }).eq("id", a.id);
      if (error) throw error;
      toast.success(value ? "Phone number linked and voice host ready" : "Phone number cleared");
      load();
    } catch (e: any) {
      toast.error(e.message?.includes("unique") ? "That number is already linked to another agent." : (e.message || "Could not link phone number"));
    } finally {
      setSavingId(null);
    }
  };

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
    toast.success("Webhook URL copied");
  };

  return (
    <>
      <PageHeader
        title="Your AI workforce"
        subtitle="Five intelligent agents working in concert. Monitor, configure and route real phone numbers."
      />

      <div className="card-cine p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-primary/40 blur-md" />
            <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary-deep grid place-items-center shadow-[0_0_20px_hsl(var(--primary)/0.5),0_1px_0_hsl(36_100%_90%_/_0.3)_inset] border border-primary/40">
              <Phone className="h-5 w-5 text-primary-foreground" strokeWidth={2.2} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="label-micro mb-1">Twilio Voice Webhook</div>
            <div className="font-medium mb-1">Route real phone calls to your AI host</div>
            <div className="text-sm text-muted-foreground mb-3">In Twilio → your number → <em>Voice configuration</em>, set <strong>A call comes in</strong> to <strong>Webhook (HTTP POST)</strong> with this URL:</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-black/30 border border-white/[0.06] rounded-lg px-3 py-2.5 truncate font-mono">{WEBHOOK_URL}</code>
              <Button size="sm" variant="outline" onClick={copyWebhook} className="border-white/10 h-9">
                {copied ? <Check className="h-3.5 w-3.5 mr-1.5 text-[hsl(var(--success))]" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}{copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {agents.map((a, idx) => {
          const m = meta[a.kind] || { icon: Bot, tag: "Agent", color: "hsl(32 96% 58%)", desc: "" };
          const I = m.icon;
          const linked = !!a.twilio_phone_number;
          const isActive = a.status === "active";
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.45 }}
              className="card-cine p-5 flex flex-col"
            >
              <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-30 pointer-events-none" style={{ background: m.color }} />

              <div className="flex items-start justify-between mb-5">
                <div className="relative">
                  {isActive && <div className="absolute inset-0 rounded-xl blur-lg opacity-70" style={{ background: m.color }} />}
                  <div className="relative h-12 w-12 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 grid place-items-center"
                    style={isActive ? { boxShadow: `0 0 24px ${m.color}40, 0 1px 0 hsl(36 100% 90% / 0.1) inset` } : {}}>
                    <I className="h-[20px] w-[20px]" style={{ color: m.color }} strokeWidth={2.1} />
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                  isActive
                    ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30'
                    : 'bg-secondary/60 text-muted-foreground border-white/5'
                }`}>
                  {isActive && <span className="pulse-dot !h-1 !w-1" />}
                  {a.status}
                </div>
              </div>

              <div className="font-medium text-[15px]">{a.name}</div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5" style={{ color: m.color, opacity: 0.85 }}>{m.tag}</div>
              <div className="text-xs text-muted-foreground mt-3 line-clamp-2 min-h-[2rem]">{a.prompt || m.desc}</div>

              {/* Live activity strip */}
              {isActive && (
                <div className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Activity className="h-3 w-3" style={{ color: m.color }} />
                  <span className="flex items-end gap-[2px] h-3">
                    {[0.4, 0.8, 0.6, 1, 0.7].map((s, i) => (
                      <motion.span key={i} className="w-[2px] rounded-full" style={{ background: m.color }}
                        animate={{ scaleY: [s * 0.4, s, s * 0.5] }}
                        transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.1, ease: "easeInOut" }} />
                    ))}
                  </span>
                  <span>Idle · listening</span>
                </div>
              )}

              {a.kind === "voice" && (
                <div className="mt-4 pt-4 border-t border-white/[0.05]">
                  <Label className="label-micro">Twilio number</Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input
                      value={phoneEdits[a.id] ?? ""}
                      onChange={e => setPhoneEdits(p => ({ ...p, [a.id]: e.target.value }))}
                      placeholder="+14155551212"
                      className="text-xs font-mono bg-black/30 border-white/[0.06]"
                    />
                    <Button size="sm" variant="outline" className="border-white/10" onClick={() => savePhone(a)} disabled={savingId === a.id}>
                      {savingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Link"}
                    </Button>
                  </div>
                  <div className={`text-[10px] mt-1.5 flex items-center gap-1 ${linked ? 'text-[hsl(var(--success))]' : 'text-muted-foreground'}`}>
                    {linked ? <><span className="pulse-dot !h-1 !w-1" /> Live · {a.twilio_phone_number}</> : "Not linked yet"}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-white/[0.05]">
                <Button size="sm" variant="outline" onClick={() => setConfigAgent(a)} className="flex-1 border-white/10 h-8 text-[11px]">
                  <Settings2 className="h-3 w-3 mr-1" /> Configure
                </Button>
                {a.kind === "voice" && (
                  <Link to="/app/voice" className="flex-1">
                    <Button size="sm" className="w-full h-8 text-[11px] bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40 shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.5)]">
                      <Mic className="h-3 w-3 mr-1" /> Talk
                    </Button>
                  </Link>
                )}
                <Button size="sm" variant="outline" onClick={() => toggle(a)} className="flex-1 border-white/10 h-8 text-[11px]">
                  {isActive ? 'Pause' : 'Activate'}
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <AgentConfigDialog agent={configAgent} open={!!configAgent} onOpenChange={(o) => !o && setConfigAgent(null)} onSaved={load} />
    </>
  );
}
