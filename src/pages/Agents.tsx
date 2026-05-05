import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Bot, Mic, Calendar, Megaphone, Sparkles, Phone, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const icons: any = { voice: Mic, booking: Calendar, ops: Bot, marketing: Megaphone, concierge: Sparkles };

const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/twilio-voice-webhook`;

export default function Agents() {
  const { venue } = useAuth();
  const [agents, setAgents] = useState<any[]>([]);
  const [phoneEdits, setPhoneEdits] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

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
    const { error } = await supabase.from("agents").update({ twilio_phone_number: value }).eq("id", a.id);
    if (error) return toast.error(error.message.includes("unique") ? "That number is already linked to another agent." : error.message);
    toast.success(value ? "Phone number linked" : "Phone number cleared");
    load();
  };

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
    toast.success("Webhook URL copied");
  };

  return (
    <>
      <PageHeader title="Agents" subtitle="Your AI workforce. Link a Twilio number to route real phone calls." />

      <div className="glass rounded-2xl p-5 mb-6 border border-primary/15">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 grid place-items-center shrink-0"><Phone className="h-5 w-5 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <div className="font-medium mb-1">Twilio Voice webhook</div>
            <div className="text-sm text-muted-foreground mb-3">In Twilio → Phone Numbers → your number → <em>Voice configuration</em>, set <strong>A call comes in</strong> to <strong>Webhook (HTTP POST)</strong> with this URL:</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-secondary/40 rounded-lg px-3 py-2 truncate">{WEBHOOK_URL}</code>
              <Button size="sm" variant="outline" onClick={copyWebhook} className="border-white/10">
                {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}{copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">Same URL for every agent — calls are routed to the agent whose number matches the dialed number below.</div>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(a => {
          const I = icons[a.kind] || Bot;
          const linked = !!a.twilio_phone_number;
          return (
            <div key={a.id} className="glass rounded-2xl p-5 hover:border-primary/30 transition-colors flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="h-11 w-11 rounded-xl bg-primary/15 grid place-items-center"><I className="h-5 w-5 text-primary" /></div>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${a.status === 'active' ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]' : 'bg-secondary text-muted-foreground'}`}>{a.status}</span>
              </div>
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-muted-foreground capitalize mt-0.5">{a.kind} agent</div>
              <div className="text-xs text-muted-foreground mt-3 line-clamp-2 min-h-[2rem]">{a.prompt || "—"}</div>

              {a.kind === "voice" && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Twilio number</Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input
                      value={phoneEdits[a.id] ?? ""}
                      onChange={e => setPhoneEdits(p => ({ ...p, [a.id]: e.target.value }))}
                      placeholder="+14155551212"
                      className="text-xs"
                    />
                    <Button size="sm" variant="outline" className="border-white/10" onClick={() => savePhone(a)}>Save</Button>
                  </div>
                  <div className={`text-[10px] mt-1.5 ${linked ? 'text-[hsl(var(--success))]' : 'text-muted-foreground'}`}>
                    {linked ? `● Live — calls to ${a.twilio_phone_number} reach this agent` : "Not linked yet"}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                {a.kind === "voice" && <Link to="/app/voice" className="flex-1"><Button size="sm" className="w-full bg-primary text-primary-foreground"><Mic className="h-3 w-3 mr-1.5" /> Talk</Button></Link>}
                <Button size="sm" variant="outline" onClick={() => toggle(a)} className="flex-1 border-white/10">{a.status === 'active' ? 'Pause' : 'Activate'}</Button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
