import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEMEANORS = [
  { v: "warm", label: "Warm & welcoming" },
  { v: "professional", label: "Polished & professional" },
  { v: "playful", label: "Playful & witty" },
  { v: "luxury", label: "Luxury concierge" },
  { v: "casual", label: "Casual local" },
  { v: "custom", label: "Custom (write your own)" },
];

const VOICES = [
  { v: "sarah", label: "Sarah — warm female" },
  { v: "jessica", label: "Jessica — friendly female" },
  { v: "matilda", label: "Matilda — bright female" },
  { v: "brian", label: "Brian — relaxed male" },
  { v: "charlie", label: "Charlie — confident male" },
];

const LANGUAGES = [
  { v: "en", label: "English" }, { v: "es", label: "Spanish" }, { v: "fr", label: "French" },
  { v: "de", label: "German" }, { v: "it", label: "Italian" }, { v: "pt", label: "Portuguese" },
  { v: "nl", label: "Dutch" }, { v: "ja", label: "Japanese" }, { v: "zh", label: "Chinese" },
];

export type AgentConfig = {
  intention?: string;
  demeanor?: string;
  voice?: string;
  language?: string;
  firstMessage?: string;
  responseLength?: "short" | "medium" | "detailed";
  customInstructions?: string;
  tools?: { create_booking?: boolean; update_booking?: boolean; take_message?: boolean; transfer_call?: boolean; transfer_number?: string };
  speed?: number;
  stability?: number;
  similarity_boost?: number;
  style?: number;
};

const DEFAULTS: AgentConfig = {
  intention: "Greet guests, take reservations, and answer questions about the menu, hours, location, and policies.",
  demeanor: "warm",
  voice: "sarah",
  language: "en",
  firstMessage: "",
  responseLength: "medium",
  customInstructions: "",
  tools: { create_booking: true, take_message: true, transfer_call: false, transfer_number: "" },
  speed: 1.0, stability: 0.35, similarity_boost: 0.7, style: 0.45,
};

export function AgentConfigDialog({ agent, open, onOpenChange, onSaved }: {
  agent: any; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const [cfg, setCfg] = useState<AgentConfig>(DEFAULTS);
  const [demeanorMode, setDemeanorMode] = useState<string>("warm");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agent) return;
    const merged = { ...DEFAULTS, ...(agent.config || {}) };
    setCfg(merged);
    const presetKeys = DEMEANORS.map(d => d.v).filter(v => v !== "custom");
    setDemeanorMode(presetKeys.includes(merged.demeanor || "") ? (merged.demeanor as string) : "custom");
  }, [agent]);

  if (!agent) return null;

  const update = (patch: Partial<AgentConfig>) => setCfg(c => ({ ...c, ...patch }));
  const updateTool = (patch: Partial<NonNullable<AgentConfig["tools"]>>) => setCfg(c => ({ ...c, tools: { ...c.tools, ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      const finalCfg = { ...cfg };
      if (demeanorMode !== "custom") finalCfg.demeanor = demeanorMode;
      const { data, error } = await supabase.functions.invoke("agent-configure", {
        body: { agent_id: agent.id, config: finalCfg },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || "Save failed");
      toast.success("Agent configuration synced live");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Could not save configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Configure {agent.name}</DialogTitle>
          <DialogDescription>Changes sync live to the AI voice host instantly — the next call will use this config.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="brain" className="mt-2">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="brain">Brain</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
            <TabsTrigger value="tools">Functions</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="brain" className="space-y-4 mt-4">
            <div>
              <Label>Primary intention</Label>
              <Textarea rows={3} value={cfg.intention || ""} onChange={e => update({ intention: e.target.value })} placeholder="What is this agent meant to do on every call?" />
              <p className="text-[11px] text-muted-foreground mt-1">e.g. "Take reservations and screen press enquiries — escalate VIPs to Sam."</p>
            </div>

            <div>
              <Label>Demeanor</Label>
              <Select value={demeanorMode} onValueChange={setDemeanorMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DEMEANORS.map(d => <SelectItem key={d.v} value={d.v}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
              {demeanorMode === "custom" && (
                <Textarea rows={2} className="mt-2" value={cfg.demeanor === demeanorMode ? "" : (cfg.demeanor || "")} onChange={e => update({ demeanor: e.target.value })} placeholder="Describe the personality in your own words…" />
              )}
            </div>

            <div>
              <Label>Opening line (first message)</Label>
              <Input value={cfg.firstMessage || ""} onChange={e => update({ firstMessage: e.target.value })} placeholder="Hi, thanks for calling — how can I help?" />
            </div>

            <div>
              <Label>Response length</Label>
              <Select value={cfg.responseLength || "medium"} onValueChange={(v: any) => update({ responseLength: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short — 1 sentence</SelectItem>
                  <SelectItem value="medium">Medium — 1–3 sentences</SelectItem>
                  <SelectItem value="detailed">Detailed — full answers when asked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Custom instructions</Label>
              <Textarea rows={4} value={cfg.customInstructions || ""} onChange={e => update({ customInstructions: e.target.value })} placeholder="Any non-negotiable rules, e.g. 'Never quote prices for the chef's tasting menu — always offer to take a message.'" />
            </div>
          </TabsContent>

          <TabsContent value="voice" className="space-y-4 mt-4">
            <div>
              <Label>Voice</Label>
              <Select value={cfg.voice || "sarah"} onValueChange={v => update({ voice: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VOICES.map(v => <SelectItem key={v.v} value={v.v}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Select value={cfg.language || "en"} onValueChange={v => update({ language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LANGUAGES.map(l => <SelectItem key={l.v} value={l.v}>{l.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <SliderRow label="Speed" value={cfg.speed ?? 1} min={0.7} max={1.2} step={0.05} onChange={v => update({ speed: v })} />
            <SliderRow label="Stability" value={cfg.stability ?? 0.35} min={0} max={1} step={0.05} onChange={v => update({ stability: v })} hint="Lower = more expressive, higher = more consistent" />
            <SliderRow label="Similarity" value={cfg.similarity_boost ?? 0.7} min={0} max={1} step={0.05} onChange={v => update({ similarity_boost: v })} />
            <SliderRow label="Style" value={cfg.style ?? 0.45} min={0} max={1} step={0.05} onChange={v => update({ style: v })} />
          </TabsContent>

          <TabsContent value="tools" className="space-y-3 mt-4">
            <ToolRow label="Create bookings" desc="Agent can confirm and write reservations to the diary." checked={cfg.tools?.create_booking !== false} onChange={v => updateTool({ create_booking: v })} />
            <ToolRow label="Take messages" desc="Agent can record a message for the team for anything it can't resolve." checked={!!cfg.tools?.take_message} onChange={v => updateTool({ take_message: v })} />
            <ToolRow label="Transfer to a human" desc="If the caller insists on a person, the agent transfers the call." checked={!!cfg.tools?.transfer_call} onChange={v => updateTool({ transfer_call: v })} />
            {cfg.tools?.transfer_call && (
              <div>
                <Label>Transfer number (E.164)</Label>
                <Input value={cfg.tools?.transfer_number || ""} onChange={e => updateTool({ transfer_number: e.target.value })} placeholder="+14155551212" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="advanced" className="space-y-3 mt-4">
            <div className="text-xs text-muted-foreground">The full system prompt is generated automatically from your venue, knowledge base, intention, and demeanor — and is pushed live to ElevenLabs every time you save.</div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save & sync live
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SliderRow({ label, value, min, max, step, onChange, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div>
      <div className="flex justify-between items-center"><Label>{label}</Label><span className="text-xs text-muted-foreground">{value.toFixed(2)}</span></div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function ToolRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-white/5 bg-secondary/20">
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
