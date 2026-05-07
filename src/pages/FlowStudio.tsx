import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Bot, CalendarPlus, CreditCard, MessageSquare, Clock, GitBranch,
  Plug, UserCheck, Bell, Star, CheckCircle2, AlertTriangle, Loader2, Sparkles,
  Play, Save, Upload, Copy, History, Workflow as WorkflowIcon, Search,
  ChevronRight, Trash2, Wand2, Shield, Zap, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ------------------------------ TYPES ------------------------------ */
type NodeKind =
  | "trigger" | "ai" | "booking" | "payment" | "message" | "wait"
  | "condition" | "integration" | "review" | "notify" | "survey" | "end";

type RunStatus = "idle" | "running" | "done" | "failed" | "waiting" | "skipped" | "review";

interface FlowNodeData extends Record<string, unknown> {
  kind: NodeKind;
  label: string;
  description?: string;
  agent?: string;
  systems?: string[];
  timing?: string;
  status?: RunStatus;
  config?: Record<string, any>;
}

const KIND_META: Record<NodeKind, { label: string; icon: any; color: string; ring: string }> = {
  trigger:     { label: "Trigger",      icon: Phone,        color: "from-amber-500/30 to-orange-500/10", ring: "ring-amber-400/40" },
  ai:          { label: "AI Decision",  icon: Bot,          color: "from-violet-500/30 to-fuchsia-500/10", ring: "ring-violet-400/40" },
  booking:     { label: "Booking",      icon: CalendarPlus, color: "from-emerald-500/30 to-teal-500/10",  ring: "ring-emerald-400/40" },
  payment:     { label: "Payment",      icon: CreditCard,   color: "from-cyan-500/30 to-sky-500/10",      ring: "ring-cyan-400/40" },
  message:     { label: "Message",      icon: MessageSquare,color: "from-blue-500/30 to-indigo-500/10",   ring: "ring-blue-400/40" },
  wait:        { label: "Wait",         icon: Clock,        color: "from-zinc-500/30 to-slate-500/10",    ring: "ring-zinc-400/40" },
  condition:   { label: "Condition",    icon: GitBranch,    color: "from-yellow-500/30 to-amber-500/10",  ring: "ring-yellow-400/40" },
  integration: { label: "Integration",  icon: Plug,         color: "from-pink-500/30 to-rose-500/10",     ring: "ring-pink-400/40" },
  review:      { label: "Human Review", icon: UserCheck,    color: "from-orange-500/30 to-red-500/10",    ring: "ring-orange-400/40" },
  notify:      { label: "Notify",       icon: Bell,         color: "from-lime-500/30 to-green-500/10",    ring: "ring-lime-400/40" },
  survey:      { label: "Survey",       icon: Star,         color: "from-fuchsia-500/30 to-pink-500/10",  ring: "ring-fuchsia-400/40" },
  end:         { label: "End",          icon: CheckCircle2, color: "from-neutral-500/30 to-stone-500/10", ring: "ring-neutral-400/40" },
};

const STATUS_META: Record<RunStatus, { label: string; cls: string }> = {
  idle:    { label: "Idle",     cls: "text-muted-foreground" },
  running: { label: "Running",  cls: "text-amber-400" },
  done:    { label: "Done",     cls: "text-emerald-400" },
  failed:  { label: "Failed",   cls: "text-red-400" },
  waiting: { label: "Waiting",  cls: "text-blue-400" },
  skipped: { label: "Skipped",  cls: "text-zinc-500" },
  review:  { label: "Review",   cls: "text-orange-400" },
};

/* ------------------------------ CUSTOM NODE ------------------------------ */
function FlowNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const meta = KIND_META[d.kind];
  const Icon = meta.icon;
  const status = d.status ?? "idle";
  const isRunning = status === "running";
  const isWaiting = status === "waiting";

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        "relative w-[220px] rounded-2xl border border-white/10 bg-gradient-to-br backdrop-blur-xl p-3 shadow-xl",
        meta.color,
        selected && "ring-2 ring-primary/70",
        isRunning && `ring-2 ${meta.ring} shadow-[0_0_30px_hsl(var(--primary)/0.5)]`,
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary !w-2 !h-2 !border-0" />
      {isRunning && (
        <motion.div
          className="absolute inset-0 rounded-2xl ring-2 ring-amber-400/60 pointer-events-none"
          animate={{ opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      )}
      <div className="flex items-start gap-2.5">
        <div className="h-9 w-9 rounded-xl bg-black/40 grid place-items-center shrink-0 border border-white/10">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-white/20 bg-black/30 uppercase tracking-wider">
              {meta.label}
            </Badge>
            {status !== "idle" && (
              <span className={cn("text-[9px] uppercase tracking-wider flex items-center gap-1", STATUS_META[status].cls)}>
                {status === "done" && <CheckCircle2 className="h-2.5 w-2.5" />}
                {status === "failed" && <AlertTriangle className="h-2.5 w-2.5" />}
                {isRunning && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                {isWaiting && <Clock className="h-2.5 w-2.5" />}
                {STATUS_META[status].label}
              </span>
            )}
          </div>
          <div className="text-sm font-semibold leading-tight truncate">{d.label}</div>
          {d.description && (
            <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{d.description}</div>
          )}
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {d.agent && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300">{d.agent}</span>}
            {d.timing && <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-500/15 text-zinc-300">{d.timing}</span>}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2 !h-2 !border-0" />
    </motion.div>
  );
}

const nodeTypes = { flow: FlowNode };

/* ------------------------------ SAMPLE FLOW ------------------------------ */
function makeSampleFlow(): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const steps: Array<Partial<FlowNodeData> & { label: string; kind: NodeKind }> = [
    { kind: "trigger",     label: "Call Received",          description: "Inbound call from Twilio", agent: "Voice Agent" },
    { kind: "ai",          label: "Identify Intent",        description: "Booking · change · cancel", agent: "Voice Agent" },
    { kind: "ai",          label: "Check Availability",     description: "Query diary for slots",     agent: "Booking Agent" },
    { kind: "ai",          label: "Collect Details",        description: "Party, date, time, name",   agent: "Voice Agent" },
    { kind: "booking",     label: "Create Booking",         description: "Tentative hold",            systems: ["Diary"] },
    { kind: "condition",   label: "Deposit Required?",      description: "Party ≥ 6 OR Fri/Sat" },
    { kind: "payment",     label: "Send Payment Link",      description: "Stripe · 30 min expiry",    timing: "30m" },
    { kind: "booking",     label: "Confirm Booking",        description: "Mark confirmed" },
    { kind: "message",     label: "SMS Confirmation",       description: "Template: confirmation" },
    { kind: "message",     label: "WhatsApp Confirmation",  description: "If channel enabled" },
    { kind: "wait",        label: "Wait Until Day Before",  description: "T-24h",                     timing: "−24h" },
    { kind: "message",     label: "Send Reminder",          description: "Template: reminder" },
    { kind: "wait",        label: "Wait Until Day Of",      description: "T-2h",                      timing: "−2h" },
    { kind: "message",     label: "Arrival Reminder",       description: "Template: arrival" },
    { kind: "booking",     label: "Mark Attendance",        description: "Arrived · no-show · late" },
    { kind: "wait",        label: "Wait 2h After Visit",    description: "Cool-down",                 timing: "+2h" },
    { kind: "survey",      label: "Post-Visit Survey",      description: "NPS + service" },
    { kind: "condition",   label: "Negative Feedback?",     description: "Rating ≤ 6" },
    { kind: "review",      label: "Alert Manager",          description: "Slack · in-app" },
    { kind: "end",         label: "End",                    description: "Flow complete" },
  ];

  const nodes: Node<FlowNodeData>[] = steps.map((s, i) => ({
    id: `n${i + 1}`,
    type: "flow",
    position: { x: 80 + (i % 2) * 320, y: 60 + i * 130 },
    data: { status: "idle", ...s } as FlowNodeData,
  }));

  const edges: Edge[] = steps.slice(0, -1).map((_, i) => ({
    id: `e${i + 1}`,
    source: `n${i + 1}`,
    target: `n${i + 2}`,
    type: "smoothstep",
    animated: false,
    style: { stroke: "hsl(var(--primary) / 0.5)", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" },
  }));

  return { nodes, edges };
}

/* ------------------------------ TEMPLATES ------------------------------ */
const TEMPLATES = [
  { id: "new-booking",       name: "New Booking Flow",            desc: "Inbound call → confirmed booking" },
  { id: "booking-change",    name: "Booking Change Flow",         desc: "Update existing reservation" },
  { id: "booking-cancel",    name: "Booking Cancellation Flow",   desc: "Cancel + refund logic" },
  { id: "deposit",           name: "Deposit Required Flow",       desc: "Take deposit before confirming" },
  { id: "large-group",       name: "Large Group Booking Flow",    desc: "Human review for 8+ guests" },
  { id: "vip",               name: "VIP Guest Flow",              desc: "White-glove escalation" },
  { id: "no-show",           name: "No-Show Recovery Flow",       desc: "Charge + win-back" },
  { id: "day-of",            name: "Day-of Reminder Flow",        desc: "T-24h and T-2h nudges" },
  { id: "post-visit",        name: "Post-Visit Survey Flow",      desc: "NPS + review request" },
  { id: "neg-feedback",      name: "Negative Feedback Recovery",  desc: "Private alert + recovery" },
];

const BLOCK_LIBRARY: Array<{ section: string; items: Array<{ kind: NodeKind; label: string }> }> = [
  { section: "Triggers",     items: [{ kind: "trigger", label: "Inbound Call" }, { kind: "trigger", label: "Website Booking" }, { kind: "trigger", label: "WhatsApp Message" }] },
  { section: "AI Decisions", items: [{ kind: "ai", label: "Voice Agent" }, { kind: "ai", label: "Booking Agent" }, { kind: "ai", label: "Escalation Agent" }] },
  { section: "Bookings",     items: [{ kind: "booking", label: "Create Booking" }, { kind: "booking", label: "Update Booking" }, { kind: "booking", label: "Cancel Booking" }, { kind: "booking", label: "Mark Arrived" }] },
  { section: "Payments",     items: [{ kind: "payment", label: "Generate Payment Link" }, { kind: "payment", label: "Take Deposit" }, { kind: "payment", label: "Refund Deposit" }] },
  { section: "Messaging",    items: [{ kind: "message", label: "SMS" }, { kind: "message", label: "WhatsApp" }, { kind: "message", label: "Email" }] },
  { section: "Timing",       items: [{ kind: "wait", label: "Wait Minutes" }, { kind: "wait", label: "Wait Until Booking" }, { kind: "wait", label: "Wait After Visit" }] },
  { section: "Conditions",   items: [{ kind: "condition", label: "If VIP" }, { kind: "condition", label: "If Large Group" }, { kind: "condition", label: "If Negative Sentiment" }] },
  { section: "Integrations", items: [{ kind: "integration", label: "Collins" }, { kind: "integration", label: "SevenRooms" }, { kind: "integration", label: "POS" }] },
  { section: "Human Review", items: [{ kind: "review", label: "Manager Approval" }, { kind: "review", label: "Owner Escalation" }] },
  { section: "Surveys",      items: [{ kind: "survey", label: "NPS Survey" }, { kind: "survey", label: "Review Request" }] },
];

/* ------------------------------ VALIDATION ------------------------------ */
function validateFlow(nodes: Node<FlowNodeData>[], edges: Edge[]) {
  const issues: Array<{ level: "error" | "warn" | "info"; msg: string }> = [];
  const triggers = nodes.filter(n => n.data.kind === "trigger");
  if (triggers.length === 0) issues.push({ level: "error", msg: "Flow is missing a trigger node." });
  if (triggers.length > 1) issues.push({ level: "warn", msg: "Multiple triggers detected — only the first will fire." });

  const ends = nodes.filter(n => n.data.kind === "end");
  if (ends.length === 0) issues.push({ level: "warn", msg: "No End node — flow has no terminal step." });

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  edges.forEach(e => {
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    outgoing.set(e.source, (outgoing.get(e.source) ?? 0) + 1);
  });
  nodes.forEach(n => {
    if (n.data.kind !== "trigger" && (incoming.get(n.id) ?? 0) === 0)
      issues.push({ level: "warn", msg: `"${n.data.label}" has no incoming connection.` });
    if (n.data.kind !== "end" && (outgoing.get(n.id) ?? 0) === 0)
      issues.push({ level: "warn", msg: `"${n.data.label}" is a dead-end.` });
  });

  // Order checks
  const indexOf = (id: string) => nodes.findIndex(n => n.id === id);
  const firstOf = (kind: NodeKind) => nodes.findIndex(n => n.data.kind === kind);
  const findLabel = (sub: string) => nodes.findIndex(n => n.data.label.toLowerCase().includes(sub));

  const createIdx = nodes.findIndex(n => n.data.kind === "booking" && /create/i.test(n.data.label));
  const payIdx = firstOf("payment");
  if (createIdx >= 0 && payIdx >= 0 && payIdx < createIdx)
    issues.push({ level: "error", msg: "Payment before Create Booking — may cause orphaned payment records." });

  const confirmIdx = nodes.findIndex(n => /confirm/i.test(n.data.label));
  const reminderIdx = findLabel("reminder");
  if (confirmIdx >= 0 && reminderIdx >= 0 && reminderIdx < confirmIdx)
    issues.push({ level: "error", msg: "Reminder scheduled before booking confirmation." });

  const surveyIdx = firstOf("survey");
  const attendIdx = findLabel("attendance");
  if (surveyIdx >= 0 && attendIdx >= 0 && surveyIdx < attendIdx)
    issues.push({ level: "error", msg: "Survey requires booking attendance to be confirmed first." });

  return issues;
}

/* ------------------------------ MAIN ------------------------------ */
export default function FlowStudio() {
  const initial = useMemo(makeSampleFlow, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("New Booking Flow");
  const [status, setStatus] = useState<"draft" | "live" | "paused">("draft");
  const [version, setVersion] = useState(3);
  const [search, setSearch] = useState("");
  const [simOpen, setSimOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);
  const [eventLog, setEventLog] = useState<Array<{ t: string; msg: string }>>([]);
  const [running, setRunning] = useState(false);
  const idSeq = useRef(initial.nodes.length + 1);

  const selected = nodes.find(n => n.id === selectedId);

  const onConnect = useCallback((c: Connection) =>
    setEdges(es => addEdge({ ...c, type: "smoothstep", animated: false,
      style: { stroke: "hsl(var(--primary) / 0.5)", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" } }, es)),
  [setEdges]);

  const updateSelected = (patch: Partial<FlowNodeData>) => {
    if (!selectedId) return;
    setNodes(ns => ns.map(n => n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setNodes(ns => ns.filter(n => n.id !== selectedId));
    setEdges(es => es.filter(e => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const id = `n${idSeq.current++}`;
    setNodes(ns => [...ns, { ...selected, id, position: { x: selected.position.x + 40, y: selected.position.y + 40 }, selected: false }]);
  };

  const onDragStartBlock = (e: React.DragEvent, kind: NodeKind, label: string) => {
    e.dataTransfer.setData("application/aijentik-block", JSON.stringify({ kind, label }));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/aijentik-block");
    if (!raw) return;
    const { kind, label } = JSON.parse(raw);
    const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const id = `n${idSeq.current++}`;
    setNodes(ns => [...ns, {
      id, type: "flow",
      position: { x: e.clientX - bounds.left - 110, y: e.clientY - bounds.top - 40 },
      data: { kind, label, description: "Configure this step", status: "idle" } as FlowNodeData,
    }]);
  };

  const runSimulation = async (scenario: string) => {
    setRunning(true);
    setEventLog([{ t: new Date().toLocaleTimeString(), msg: `▶ Simulation started — ${scenario}` }]);
    setNodes(ns => ns.map(n => ({ ...n, data: { ...n.data, status: "idle" as RunStatus } })));
    setEdges(es => es.map(e => ({ ...e, animated: false })));

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      setNodes(ns => ns.map(x => x.id === n.id ? { ...x, data: { ...x.data, status: "running" } } : x));
      setEdges(es => es.map(e => e.target === n.id ? { ...e, animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 3 } } : e));
      setEventLog(log => [...log, { t: new Date().toLocaleTimeString(), msg: `→ ${n.data.label}` }]);
      await new Promise(r => setTimeout(r, 650));
      const failed = scenario === "Deposit failed" && /payment/i.test(n.data.label);
      setNodes(ns => ns.map(x => x.id === n.id ? { ...x, data: { ...x.data, status: failed ? "failed" : "done" } } : x));
      if (failed) {
        setEventLog(log => [...log, { t: new Date().toLocaleTimeString(), msg: `✕ ${n.data.label} failed — escalating` }]);
        break;
      }
    }
    setEventLog(log => [...log, { t: new Date().toLocaleTimeString(), msg: "✓ Simulation complete" }]);
    setRunning(false);
  };

  const issues = useMemo(() => validateFlow(nodes, edges), [nodes, edges]);

  const aiSuggestions = [
    "Add a deposit reminder 2h before payment link expiry.",
    "Large group bookings (8+) should pass through Human Review before confirmation.",
    "Add a WhatsApp fallback if SMS delivery fails.",
    "Post-visit surveys perform 34% better when sent 1–2h after attendance.",
    "Add escalation if AI confidence drops below 70%.",
  ];

  return (
    <div className="fixed inset-0 left-64 flex flex-col bg-background text-foreground z-10">
      {/* TOP BAR */}
      <header className="h-14 shrink-0 glass-strong border-b border-white/5 flex items-center gap-3 px-4 z-20">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center">
            <WorkflowIcon className="h-4 w-4 text-primary-foreground" />
          </div>
          <Input
            value={flowName}
            onChange={e => setFlowName(e.target.value)}
            className="h-8 w-64 bg-transparent border-white/10 font-semibold"
          />
          <Badge variant="outline" className={cn(
            "border-white/10 uppercase tracking-wider text-[10px]",
            status === "live" && "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
            status === "draft" && "bg-amber-500/15 text-amber-300 border-amber-500/30",
            status === "paused" && "bg-zinc-500/15 text-zinc-300",
          )}>
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-1.5",
              status === "live" && "bg-emerald-400 animate-pulse",
              status === "draft" && "bg-amber-400",
              status === "paused" && "bg-zinc-400"
            )} />
            {status}
          </Badge>
          <span className="text-xs text-muted-foreground">v{version} · edited 2m ago</span>
        </div>

        <div className="flex-1" />

        <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
          <History className="h-4 w-4" /> Run history
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { toast.success("Flow duplicated"); }}>
          <Copy className="h-4 w-4" /> Duplicate
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setValidateOpen(true)}>
          <Shield className="h-4 w-4" /> Validate
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSimOpen(true)}>
          <Play className="h-4 w-4" /> Test flow
        </Button>
        <Button size="sm" variant="secondary" onClick={() => { setVersion(v => v + 1); toast.success("Draft saved"); }}>
          <Save className="h-4 w-4" /> Save draft
        </Button>
        <Button size="sm" onClick={() => { setStatus("live"); setVersion(v => v + 1); toast.success(`Published v${version + 1} · live`); }}>
          <Upload className="h-4 w-4" /> Publish
        </Button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* LEFT PANEL */}
        <aside className="w-72 shrink-0 glass border-r border-white/5 flex flex-col">
          <div className="p-3 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search blocks & templates" className="h-8 pl-8 bg-secondary/40 border-white/5 text-xs" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <section>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Templates
              </div>
              <div className="space-y-1">
                {TEMPLATES.filter(t => t.name.toLowerCase().includes(search.toLowerCase())).map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setFlowName(t.name); toast.info(`Loaded ${t.name}`); }}
                    className="w-full text-left p-2 rounded-lg hover:bg-secondary/50 border border-transparent hover:border-white/5 group"
                  >
                    <div className="text-xs font-medium group-hover:text-primary transition-colors">{t.name}</div>
                    <div className="text-[10px] text-muted-foreground">{t.desc}</div>
                  </button>
                ))}
              </div>
            </section>

            {BLOCK_LIBRARY.map(group => (
              <section key={group.section}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">{group.section}</div>
                <div className="space-y-1">
                  {group.items.filter(i => i.label.toLowerCase().includes(search.toLowerCase())).map(item => {
                    const meta = KIND_META[item.kind];
                    const Icon = meta.icon;
                    return (
                      <div
                        key={`${group.section}-${item.label}`}
                        draggable
                        onDragStart={e => onDragStartBlock(e, item.kind, item.label)}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg cursor-grab active:cursor-grabbing",
                          "bg-gradient-to-r border border-white/5 hover:border-white/15 transition-all",
                          meta.color
                        )}
                      >
                        <div className="h-7 w-7 rounded-md bg-black/40 grid place-items-center border border-white/10">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs font-medium flex-1 truncate">{item.label}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </aside>

        {/* CANVAS */}
        <main
          className="flex-1 relative min-w-0"
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={1.5}
            snapToGrid
            snapGrid={[16, 16]}
            proOptions={{ hideAttribution: true }}
            className="bg-transparent"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
            <Controls className="!bg-card/70 !border-white/10 [&>button]:!bg-transparent [&>button]:!border-white/10 [&>button]:!text-foreground" />
            <MiniMap
              pannable zoomable
              className="!bg-card/70 !border !border-white/10 !rounded-lg"
              nodeColor={(n) => {
                const k = (n.data as FlowNodeData)?.kind;
                return k === "trigger" ? "hsl(32 100% 56%)" : k === "end" ? "hsl(158 75% 50%)" : "hsl(230 18% 30%)";
              }}
              maskColor="hsl(230 25% 5% / 0.8)"
            />
          </ReactFlow>

          {/* Floating AI Optimise */}
          <div className="absolute top-4 right-4 z-10">
            <Button
              size="sm"
              className="bg-gradient-to-r from-primary to-accent shadow-lg"
              onClick={() => toast.message("AI Optimiser", { description: aiSuggestions[Math.floor(Math.random() * aiSuggestions.length)] })}
            >
              <Wand2 className="h-4 w-4" /> Optimise with AI
            </Button>
          </div>

          {/* Live event trail */}
          {eventLog.length > 0 && (
            <div className="absolute bottom-4 left-4 z-10 w-80 max-h-64 overflow-y-auto glass-strong rounded-xl border border-white/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-amber-400" /> Live event trail
                </div>
                <button onClick={() => setEventLog([])} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-1 text-xs font-mono">
                <AnimatePresence initial={false}>
                  {eventLog.map((e, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex gap-2"
                    >
                      <span className="text-muted-foreground shrink-0">{e.t}</span>
                      <span className="truncate">{e.msg}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT CONFIG PANEL */}
        <aside className="w-80 shrink-0 glass border-l border-white/5 overflow-y-auto">
          {!selected ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <div className="h-12 w-12 mx-auto mb-3 rounded-2xl bg-secondary/40 grid place-items-center">
                <WorkflowIcon className="h-5 w-5" />
              </div>
              <div className="font-medium text-foreground mb-1">Select a node</div>
              <div className="text-xs">Click any block on the canvas to configure its agent, action, channel and timing.</div>
              <div className="mt-6 text-left">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">Flow analytics</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { l: "Total runs", v: "1,284" },
                    { l: "Completion", v: "94%" },
                    { l: "Avg time", v: "3m 12s" },
                    { l: "Bookings", v: "1,071" },
                    { l: "Revenue", v: "£82.4k" },
                    { l: "Escalations", v: "23" },
                  ].map(s => (
                    <div key={s.l} className="rounded-lg border border-white/5 bg-secondary/30 p-2">
                      <div className="text-[10px] text-muted-foreground">{s.l}</div>
                      <div className="text-sm font-semibold">{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <NodeConfig
              node={selected as Node<FlowNodeData>}
              onChange={updateSelected}
              onDelete={deleteSelected}
              onDuplicate={duplicateSelected}
            />
          )}
        </aside>
      </div>

      {/* SIM MODAL */}
      <Dialog open={simOpen} onOpenChange={setSimOpen}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader><DialogTitle>Test flow — choose scenario</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {["Standard booking","Fully booked night","VIP guest","Large group","Deposit failed","Guest cancels","Guest no-shows","Negative feedback","SMS failed"].map(s => (
              <Button key={s} variant="outline" disabled={running} onClick={() => { setSimOpen(false); runSimulation(s); }}>
                {s}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* VALIDATE MODAL */}
      <Dialog open={validateOpen} onOpenChange={setValidateOpen}>
        <DialogContent className="bg-card border-white/10 max-w-lg">
          <DialogHeader><DialogTitle>Flow validation</DialogTitle></DialogHeader>
          {issues.length === 0 ? (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Ready to publish — no issues found.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {issues.map((i, idx) => (
                <div key={idx} className={cn(
                  "flex items-start gap-2 p-3 rounded-lg border text-sm",
                  i.level === "error" && "bg-red-500/10 border-red-500/30 text-red-200",
                  i.level === "warn" && "bg-amber-500/10 border-amber-500/30 text-amber-200",
                  i.level === "info" && "bg-blue-500/10 border-blue-500/30 text-blue-200",
                )}>
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{i.msg}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* HISTORY MODAL */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="bg-card border-white/10 max-w-2xl">
          <DialogHeader><DialogTitle>Run history</DialogTitle></DialogHeader>
          <div className="space-y-1 max-h-96 overflow-y-auto text-sm">
            {[
              { g: "Sarah Chen",   t: "2m ago",  o: "Confirmed", c: 95 },
              { g: "Marco Rossi",  t: "14m ago", o: "Confirmed", c: 91 },
              { g: "Amelia Webb",  t: "38m ago", o: "Escalated", c: 68 },
              { g: "James Patel",  t: "1h ago",  o: "Confirmed", c: 97 },
              { g: "Linda Park",   t: "2h ago",  o: "Cancelled", c: 88 },
              { g: "Tom Holland",  t: "3h ago",  o: "No-show",   c: 82 },
            ].map((r, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/40 border border-white/5">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-xs font-semibold">
                  {r.g[0]}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{r.g}</div>
                  <div className="text-[11px] text-muted-foreground">{r.t} · AI confidence {r.c}%</div>
                </div>
                <Badge variant="outline" className="border-white/10">{r.o}</Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------ NODE CONFIG ------------------------------ */
function NodeConfig({
  node, onChange, onDelete, onDuplicate,
}: {
  node: Node<FlowNodeData>;
  onChange: (p: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const d = node.data;
  const meta = KIND_META[d.kind];
  const Icon = meta.icon;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className={cn("h-10 w-10 rounded-xl bg-gradient-to-br grid place-items-center border border-white/10", meta.color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <Badge variant="outline" className="text-[9px] border-white/15 mb-1 uppercase tracking-wider">{meta.label}</Badge>
          <div className="text-sm font-semibold truncate">{d.label}</div>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Label</Label>
          <Input value={d.label} onChange={e => onChange({ label: e.target.value })} className="h-8 mt-1 bg-secondary/40 border-white/10" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Description</Label>
          <Textarea value={d.description ?? ""} onChange={e => onChange({ description: e.target.value })} rows={2} className="mt-1 bg-secondary/40 border-white/10 text-sm" />
        </div>

        {d.kind === "trigger" && (
          <div>
            <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Trigger type</Label>
            <Select defaultValue="call">
              <SelectTrigger className="h-8 mt-1 bg-secondary/40 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Inbound call</SelectItem>
                <SelectItem value="web">Website booking</SelectItem>
                <SelectItem value="manual">Manual booking</SelectItem>
                <SelectItem value="whatsapp">WhatsApp message</SelectItem>
                <SelectItem value="sms">SMS message</SelectItem>
                <SelectItem value="changed">Booking changed</SelectItem>
                <SelectItem value="cancelled">Booking cancelled</SelectItem>
                <SelectItem value="payfail">Payment failed</SelectItem>
                <SelectItem value="noshow">No-show detected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {d.kind === "ai" && (
          <>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Agent</Label>
              <Select defaultValue="voice">
                <SelectTrigger className="h-8 mt-1 bg-secondary/40 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["voice","booking","payment","ops","experience","escalation"].map(a => (
                    <SelectItem key={a} value={a}>{a[0].toUpperCase()+a.slice(1)} Agent</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Prompt instructions</Label>
              <Textarea rows={3} placeholder="Decide whether the guest qualifies as VIP based on visit history…" className="mt-1 bg-secondary/40 border-white/10 text-sm" />
            </div>
          </>
        )}

        {d.kind === "message" && (
          <>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Channel</Label>
              <Select defaultValue="sms">
                <SelectTrigger className="h-8 mt-1 bg-secondary/40 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="voice">Voice call</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Body</Label>
              <Textarea rows={4} defaultValue="Hi {{guest_name}}, your table for {{party_size}} at {{venue_name}} is confirmed for {{booking_date}} at {{booking_time}}." className="mt-1 bg-secondary/40 border-white/10 text-xs font-mono" />
            </div>
          </>
        )}

        {d.kind === "payment" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Amount</Label>
                <Input defaultValue="£10 / guest" className="h-8 mt-1 bg-secondary/40 border-white/10" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Expiry</Label>
                <Input defaultValue="30 min" className="h-8 mt-1 bg-secondary/40 border-white/10" />
              </div>
            </div>
          </>
        )}

        {d.kind === "wait" && (
          <div>
            <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Wait</Label>
            <Input defaultValue="Until 24h before booking" className="h-8 mt-1 bg-secondary/40 border-white/10" />
          </div>
        )}

        {d.kind === "condition" && (
          <div>
            <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Rule</Label>
            <Select defaultValue="party">
              <SelectTrigger className="h-8 mt-1 bg-secondary/40 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="party">Party size &gt; 6</SelectItem>
                <SelectItem value="vip">Guest is VIP</SelectItem>
                <SelectItem value="value">Booking value &gt; £200</SelectItem>
                <SelectItem value="noshow">Guest has prior no-shows</SelectItem>
                <SelectItem value="sentiment">Sentiment negative</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {d.kind === "review" && (
          <div>
            <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Assign to</Label>
            <Select defaultValue="manager">
              <SelectTrigger className="h-8 mt-1 bg-secondary/40 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="host">Host</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="ops">Operations team</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Estimated timing</Label>
          <Input value={d.timing ?? ""} onChange={e => onChange({ timing: e.target.value })} placeholder="e.g. −24h, +2h, 30m" className="h-8 mt-1 bg-secondary/40 border-white/10" />
        </div>
      </div>
    </div>
  );
}
