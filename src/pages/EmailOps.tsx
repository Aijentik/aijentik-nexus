import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Mail, Inbox, Sparkles, ShieldCheck, Crown, AlertTriangle, Check, X, Undo2,
  Send, Bot, User, Copy, Wand2, RefreshCcw, Settings2, Plug, Hand, Search,
} from "lucide-react";

type Thread = {
  id: string; subject: string | null; guest_name: string | null; guest_email: string;
  intent: string | null; status: string; ai_takeover: boolean; vip: boolean; unread: boolean;
  last_message_at: string; message_count: number;
};
type Message = {
  id: string; direction: "inbound" | "outbound"; from_address: string; to_address: string;
  subject: string | null; body_text: string | null; ai_generated: boolean; created_at: string;
};
type AIAction = {
  id: string; kind: string; status: string; confidence: number; reasoning: string | null;
  payload: any; result: any; created_at: string; executed_at: string | null;
};
type Inbox = {
  id: string; forwarding_address: string; reply_from_address: string | null;
  reply_from_name: string | null; auto_send_threshold: number; enabled: boolean;
};

const INTENT_LABEL: Record<string, string> = {
  new_booking: "New booking",
  modify_booking: "Modify booking",
  cancel_booking: "Cancel booking",
  dietary: "Dietary",
  vip_request: "VIP request",
  event_enquiry: "Event enquiry",
  function_enquiry: "Function enquiry",
  general_question: "Question",
  spam: "Spam",
  other: "Other",
};

const STATUS_COLOR: Record<string, string> = {
  pending_approval: "hsl(var(--warn))",
  approved: "hsl(var(--primary))",
  executed: "hsl(var(--success))",
  rejected: "hsl(var(--destructive))",
  undone: "hsl(32 14% 62%)",
  proposed: "hsl(var(--muted-foreground))",
  failed: "hsl(var(--destructive))",
};

function confidenceTier(c: number) {
  if (c >= 0.85) return { label: "High", color: "hsl(var(--success))" };
  if (c >= 0.6) return { label: "Medium", color: "hsl(var(--warn))" };
  return { label: "Low", color: "hsl(var(--destructive))" };
}

export default function EmailOps() {
  const { venue } = useAuth();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<AIAction[]>([]);
  const [draft, setDraft] = useState<{ subject: string; body: string; confidence: number; reasoning: string | null; action_id: string | null } | null>(null);
  const [tab, setTab] = useState("approvals");
  const [simOpen, setSimOpen] = useState(false);
  const [simForm, setSimForm] = useState({
    from_name: "Olivia Carter", from_email: "olivia@example.com",
    subject: "Booking for 6 on Friday",
    body: "Hi! Could we book a table for 6 this Friday at 7:30pm? One vegan in the group. Thanks, Olivia",
  });

  // Ensure inbox exists
  const ensureInbox = async () => {
    if (!venue) return;
    let { data } = await supabase.from("email_inboxes").select("*").eq("venue_id", venue.id).maybeSingle();
    if (!data) {
      const addr = `venue-${venue.id.slice(0, 8)}@inbound.aijentik.app`;
      const { data: created } = await supabase.from("email_inboxes").insert({
        venue_id: venue.id, forwarding_address: addr, reply_from_address: addr,
        reply_from_name: "Reservations",
      }).select("*").single();
      data = created;
    }
    setInbox(data as Inbox);
  };

  const loadThreads = async () => {
    if (!venue) return;
    const { data } = await supabase.from("email_threads")
      .select("*").eq("venue_id", venue.id)
      .order("last_message_at", { ascending: false }).limit(100);
    setThreads((data as Thread[]) || []);
    if (!activeId && data?.length) setActiveId(data[0].id);
  };

  const loadActive = async (id: string) => {
    const [{ data: m }, { data: a }, { data: d }] = await Promise.all([
      supabase.from("email_messages").select("*").eq("thread_id", id).order("created_at"),
      supabase.from("email_ai_actions").select("*").eq("thread_id", id).order("created_at", { ascending: false }),
      supabase.from("email_drafts").select("*").eq("thread_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setMessages((m as Message[]) || []);
    setActions((a as AIAction[]) || []);
    setDraft(d ? {
      subject: (d as any).subject || "",
      body: (d as any).body_text || "",
      confidence: Number((d as any).confidence || 0),
      reasoning: (d as any).reasoning || null,
      action_id: (d as any).action_id || null,
    } : null);
    // mark read
    await supabase.from("email_threads").update({ unread: false }).eq("id", id);
  };

  useEffect(() => { ensureInbox(); loadThreads(); }, [venue?.id]);
  useEffect(() => { if (activeId) loadActive(activeId); }, [activeId]);

  // Realtime
  useEffect(() => {
    if (!venue) return;
    const ch = supabase.channel(`email-ops-${venue.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "email_threads", filter: `venue_id=eq.${venue.id}` }, () => loadThreads())
      .on("postgres_changes", { event: "*", schema: "public", table: "email_messages", filter: `venue_id=eq.${venue.id}` }, (p: any) => {
        if (p.new?.thread_id === activeId) loadActive(activeId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "email_ai_actions", filter: `venue_id=eq.${venue.id}` }, (p: any) => {
        if (p.new?.thread_id === activeId) loadActive(activeId);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [venue?.id, activeId]);

  const pending = useMemo(() => threads.filter(t => t.status === "awaiting_staff"), [threads]);
  const activeThread = threads.find(t => t.id === activeId);

  const callAction = async (action_id: string, decision: "execute" | "reject" | "undo", edits?: { body?: string; subject?: string }) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action_id, decision, edited_body: edits?.body, edited_subject: edits?.subject }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Action failed");
    } else {
      toast.success(decision === "execute" ? "Sent" : decision === "reject" ? "Rejected" : "Undone");
      if (activeId) loadActive(activeId);
    }
  };

  const reanalyze = async (thread_id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    toast.message("Re-analysing thread…");
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ thread_id }),
    });
  };

  const toggleTakeover = async (thread_id: string, ai_takeover: boolean) => {
    await supabase.from("email_threads").update({ ai_takeover }).eq("id", thread_id);
    loadThreads();
  };

  const simulate = async () => {
    if (!venue) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-simulate-inbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ venue_id: venue.id, ...simForm }),
    });
    const json = await res.json();
    if (!res.ok) toast.error(json.error || "Simulation failed");
    else { toast.success("Inbound email received — AI analysing…"); setSimOpen(false); setTimeout(loadThreads, 1500); }
  };

  return (
    <div>
      <PageHeader
        title="Email Operations"
        subtitle="Inbound bookings, modifications, and enquiries handled by your AI."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSimOpen(s => !s)}>
              <Wand2 className="w-4 h-4 mr-1.5" /> Simulate inbound
            </Button>
          </div>
        }
      />

      {/* Inbox banner */}
      {inbox && (
        <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Inbox className="w-4 h-4" /></div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Forwarding address — auto-forward your venue inbox here</div>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono truncate">{inbox.forwarding_address}</code>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => { navigator.clipboard.writeText(inbox.forwarding_address); toast.success("Copied"); }}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5 text-success" />
            Auto-send threshold {Math.round(inbox.auto_send_threshold * 100)}%
          </div>
        </div>
      )}

      {/* Simulation panel */}
      <AnimatePresence>
        {simOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden">
            <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="From name" value={simForm.from_name} onChange={e => setSimForm(s => ({ ...s, from_name: e.target.value }))} />
                <Input placeholder="From email" value={simForm.from_email} onChange={e => setSimForm(s => ({ ...s, from_email: e.target.value }))} />
              </div>
              <Input placeholder="Subject" value={simForm.subject} onChange={e => setSimForm(s => ({ ...s, subject: e.target.value }))} />
              <Textarea className="md:col-span-2" rows={3} value={simForm.body} onChange={e => setSimForm(s => ({ ...s, body: e.target.value }))} />
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={simulate}><Send className="w-4 h-4 mr-1.5" /> Inject into inbox</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_360px] gap-4 min-h-[60vh]">
        {/* Thread list */}
        <div className="rounded-xl border border-white/[0.06] bg-card/40 overflow-hidden flex flex-col">
          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
            <TabsList className="grid grid-cols-2 m-2">
              <TabsTrigger value="approvals">Approvals · {pending.length}</TabsTrigger>
              <TabsTrigger value="all">All · {threads.length}</TabsTrigger>
            </TabsList>
            <div className="flex-1 overflow-y-auto">
              {(tab === "approvals" ? pending : threads).map(t => (
                <button key={t.id} onClick={() => setActiveId(t.id)}
                  className={`w-full text-left px-3 py-3 border-l-2 transition-all ${activeId === t.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-white/[0.02]"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {t.vip && <Crown className="w-3 h-3 text-primary" />}
                    {t.unread && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    <div className="text-sm font-medium truncate flex-1">{t.guest_name || t.guest_email}</div>
                    <div className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(t.last_message_at), { addSuffix: false })}</div>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{t.subject || "(no subject)"}</div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {t.intent && <Badge variant="outline" className="text-[10px] py-0 px-1.5">{INTENT_LABEL[t.intent] || t.intent}</Badge>}
                    {t.status === "awaiting_staff" && <Badge className="text-[10px] py-0 px-1.5 bg-warn/20 text-warn border-warn/30">Needs review</Badge>}
                    {!t.ai_takeover && <Badge variant="outline" className="text-[10px] py-0 px-1.5"><Hand className="w-2.5 h-2.5 mr-0.5" />Manual</Badge>}
                  </div>
                </button>
              ))}
              {!threads.length && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No emails yet. Use "Simulate inbound" to see the AI in action.
                </div>
              )}
            </div>
          </Tabs>
        </div>

        {/* Thread view */}
        <div className="rounded-xl border border-white/[0.06] bg-card/40 overflow-hidden flex flex-col">
          {activeThread ? (
            <>
              <div className="p-4 border-b border-white/[0.04] flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{activeThread.subject || "(no subject)"}</h3>
                    {activeThread.vip && <Crown className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {activeThread.guest_name ? `${activeThread.guest_name} · ` : ""}{activeThread.guest_email}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">AI takeover</span>
                  <Switch checked={activeThread.ai_takeover} onCheckedChange={(v) => toggleTakeover(activeThread.id, v)} />
                  <Button size="sm" variant="ghost" onClick={() => reanalyze(activeThread.id)} title="Re-analyse">
                    <RefreshCcw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(m => (
                  <div key={m.id} className={`flex gap-3 ${m.direction === "outbound" ? "flex-row-reverse" : ""}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.direction === "outbound" ? (m.ai_generated ? "bg-primary/15 text-primary" : "bg-success/15 text-success") : "bg-white/[0.06] text-muted-foreground"}`}>
                      {m.direction === "outbound" ? (m.ai_generated ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />) : <User className="w-4 h-4" />}
                    </div>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.direction === "outbound" ? "bg-primary/[0.08] border border-primary/20" : "bg-white/[0.03] border border-white/[0.06]"}`}>
                      <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-2">
                        {m.direction === "outbound" ? (m.ai_generated ? "AI · sent" : "Staff · sent") : m.from_address}
                        <span>· {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
                      </div>
                      {m.subject && m.direction === "inbound" && <div className="text-xs font-medium mb-1">{m.subject}</div>}
                      <div className="text-sm whitespace-pre-wrap">{m.body_text}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Draft + actions */}
              {draft && draft.action_id && (
                <DraftPanel draft={draft} onSend={(body, subject) => callAction(draft.action_id!, "execute", { body, subject })}
                  onReject={() => callAction(draft.action_id!, "reject")} />
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Select a thread</div>
          )}
        </div>

        {/* AI activity rail */}
        <div className="rounded-xl border border-white/[0.06] bg-card/40 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-white/[0.04] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <div className="text-sm font-medium">AI activity</div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {actions.map(a => {
              const tier = confidenceTier(Number(a.confidence));
              return (
                <div key={a.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] py-0">{a.kind.replace(/_/g, " ")}</Badge>
                    <Badge className="text-[10px] py-0" style={{ background: `${STATUS_COLOR[a.status]}22`, color: STATUS_COLOR[a.status], borderColor: `${STATUS_COLOR[a.status]}55` }}>{a.status.replace(/_/g, " ")}</Badge>
                    <div className="ml-auto text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</div>
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="text-[10px] text-muted-foreground">Confidence</div>
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full" style={{ width: `${Math.round(Number(a.confidence) * 100)}%`, background: tier.color }} />
                    </div>
                    <div className="text-[10px] font-medium" style={{ color: tier.color }}>{tier.label} · {Math.round(Number(a.confidence) * 100)}%</div>
                  </div>
                  {a.reasoning && <p className="text-xs text-muted-foreground italic">"{a.reasoning}"</p>}
                  {a.status === "executed" && (
                    <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs" onClick={() => callAction(a.id, "undo")}>
                      <Undo2 className="w-3 h-3 mr-1" /> Undo
                    </Button>
                  )}
                </div>
              );
            })}
            {!actions.length && <div className="text-xs text-muted-foreground text-center py-6">No AI activity for this thread yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftPanel({ draft, onSend, onReject }: {
  draft: { subject: string; body: string; confidence: number; reasoning: string | null; action_id: string | null };
  onSend: (body: string, subject: string) => void;
  onReject: () => void;
}) {
  const [body, setBody] = useState(draft.body);
  const [subject, setSubject] = useState(draft.subject);
  useEffect(() => { setBody(draft.body); setSubject(draft.subject); }, [draft.action_id]);
  const tier = confidenceTier(draft.confidence);
  return (
    <div className="border-t border-white/[0.06] bg-gradient-to-b from-primary/[0.03] to-transparent p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Bot className="w-3.5 h-3.5 text-primary" />
        <span className="font-medium">AI draft reply</span>
        <span className="text-muted-foreground">·</span>
        <span style={{ color: tier.color }} className="font-medium">{tier.label} · {Math.round(draft.confidence * 100)}%</span>
        <div className="ml-auto text-[10px] text-muted-foreground italic truncate max-w-[50%]">{draft.reasoning}</div>
      </div>
      <Input value={subject} onChange={e => setSubject(e.target.value)} className="text-sm" />
      <Textarea rows={6} value={body} onChange={e => setBody(e.target.value)} className="text-sm" />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onReject}><X className="w-4 h-4 mr-1" /> Reject</Button>
        <Button size="sm" onClick={() => onSend(body, subject)}><Check className="w-4 h-4 mr-1" /> Approve & send</Button>
      </div>
    </div>
  );
}
