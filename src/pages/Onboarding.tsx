import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import {
  Brain, Sparkles, Loader2, CheckCircle2, ArrowRight, Globe, Search, Wand2,
  AlertTriangle, Plus, Plug, Zap, ChevronRight, Edit3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Stage = "url" | "manual" | "scanning" | "review";
type Event = { stage: string; message: string; ok?: boolean; kind?: string; url?: string; platforms?: any[]; profile?: any };

export default function Onboarding() {
  const nav = useNavigate();
  const { refreshVenues, session } = useAuth();
  const [stage, setStage] = useState<Stage>("url");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Event[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [appliedGaps, setAppliedGaps] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => { feedRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [events]);

  const startScan = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!url.trim()) return toast.error("Enter your venue website");
    setStage("scanning"); setEvents([]); setProfile(null); setAppliedGaps(new Set());

    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/venue-deep-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ url }),
      });
      if (!r.ok || !r.body) throw new Error(`Scan failed: ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const ev = JSON.parse(line.slice(6)) as Event;
          setEvents((s) => [...s, ev]);
          if (ev.stage === "complete" && ev.profile) {
            setProfile(ev.profile);
            setTimeout(() => setStage("review"), 600);
          }
          if (ev.stage === "error") toast.error(ev.message);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Scan failed");
      setStage("url");
    }
  };

  const applyGap = (gap: any) => {
    if (!profile) return;
    const next = { ...profile };
    if (gap.apply_as === "knowledge") {
      next.knowledge = [...(next.knowledge || []), { title: gap.title, category: "policy", content: gap.suggested_fix }];
    } else if (gap.apply_as === "policy") {
      next.policies = { ...(next.policies || {}), [gap.id]: gap.suggested_fix };
    } else if (gap.apply_as === "field" && gap.field) {
      next[gap.field] = gap.suggested_fix;
    }
    setProfile(next);
    setAppliedGaps((s) => new Set([...s, gap.id]));
    toast.success("Applied");
  };

  const launch = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/venue-create-from-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ profile }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Launch failed");
      await refreshVenues();
      toast.success("Welcome aboard.");
      nav("/app");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_520px]">
      {/* LEFT */}
      <div className="p-6 md:p-12 flex flex-col">
        <div className="flex items-center gap-2.5 mb-10">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_0_20px_hsl(var(--primary)/0.6)]">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="font-semibold tracking-tight">Aijentik</div>
        </div>

        <AnimatePresence mode="wait">
          {stage === "url" && <UrlStep key="url" url={url} setUrl={setUrl} onSubmit={startScan} onManual={() => setStage("manual")} />}
          {stage === "manual" && <ManualStep key="manual" onBack={() => setStage("url")} session={session} refreshVenues={refreshVenues} nav={nav} />}
          {stage === "scanning" && <ScanningStep key="scanning" url={url} />}
          {stage === "review" && profile && (
            <ReviewStep key="review" profile={profile} setProfile={setProfile} appliedGaps={appliedGaps} applyGap={applyGap} launch={launch} busy={busy} />
          )}
        </AnimatePresence>
      </div>

      {/* RIGHT — live feed */}
      <div className="hidden lg:flex flex-col p-8 relative overflow-hidden bg-gradient-to-b from-card/40 to-background border-l border-white/5">
        <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
        <div className="absolute top-20 right-20 h-80 w-80 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-between mb-5">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Live Build Intelligence</div>
          {stage === "scanning" && <div className="flex items-center gap-1.5 text-xs text-primary"><div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Streaming</div>}
        </div>

        <div ref={feedRef} className="relative space-y-2.5 overflow-y-auto pr-1 flex-1">
          {events.length === 0 && stage !== "review" && (
            <div className="text-sm text-muted-foreground glass rounded-xl p-4">
              {stage === "url" || stage === "manual"
                ? "Drop in your website. The brain will read it, learn your vibe, and stream insights here."
                : "Awaiting input…"}
            </div>
          )}
          <AnimatePresence>
            {events.map((ev, i) => <FeedRow key={i} ev={ev} />)}
            {profile?.detected_platforms?.length > 0 && stage === "review" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-strong rounded-xl p-4 mt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Detected stack</div>
                <div className="flex flex-wrap gap-1.5">
                  {profile.detected_platforms.map((p: any) => (
                    <span key={p.id} className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">{p.name}</span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ---------- Stage components ---------- */

function UrlStep({ url, setUrl, onSubmit, onManual }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-xl">
      <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-3">Paste your website.<br/><span className="gradient-text">We'll do the rest.</span></h1>
      <p className="text-muted-foreground mb-8 text-lg">The brain reads your site, learns your vibe, imports your menu, picks up policies, and builds your AI host — in under a minute.</p>

      <form onSubmit={onSubmit} className="glass-strong rounded-2xl p-5 space-y-3">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Venue website</Label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourrestaurant.com" className="pl-10 h-12 text-base" />
          </div>
          <Button type="submit" className="h-12 px-6 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
            <Sparkles className="h-4 w-4 mr-2" /> Scan & Build
          </Button>
        </div>
        <button type="button" onClick={onManual} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mt-1">
          <Edit3 className="h-3 w-3" /> Build manually instead
        </button>
      </form>

      <div className="grid grid-cols-3 gap-3 mt-8">
        {[
          { icon: Search, label: "Reads your site" },
          { icon: Wand2, label: "Learns your vibe" },
          { icon: Plug, label: "Detects integrations" },
        ].map((f, i) => (
          <div key={i} className="glass rounded-xl p-3 flex items-center gap-2 text-xs text-muted-foreground">
            <f.icon className="h-4 w-4 text-primary" /> {f.label}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ScanningStep({ url }: { url: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight mb-3">Scanning <span className="gradient-text">{url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span></h1>
      <p className="text-muted-foreground mb-8">The brain is online. Watch the stream on the right →</p>
      <div className="glass-strong rounded-2xl p-8 flex items-center gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center">
            <Brain className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        </div>
        <div>
          <div className="font-medium">Reading, learning, building</div>
          <div className="text-sm text-muted-foreground">Menus · Policies · Hours · Brand voice · Stack</div>
        </div>
      </div>
    </motion.div>
  );
}

function ReviewStep({ profile, setProfile, appliedGaps, applyGap, launch, busy }: any) {
  const update = (k: string, v: any) => setProfile({ ...profile, [k]: v });
  const updatePolicy = (k: string, v: any) => setProfile({ ...profile, policies: { ...(profile.policies || {}), [k]: v } });
  const openGaps = (profile.gaps || []).filter((g: any) => !appliedGaps.has(g.id));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl pb-12">
      <div className="flex items-center gap-2 text-xs text-primary mb-3"><CheckCircle2 className="h-4 w-4" /> Scan complete</div>
      <h1 className="text-3xl font-semibold tracking-tight mb-1">{profile.name || "Your venue"}</h1>
      <p className="text-muted-foreground mb-6 text-sm">{profile.tagline || profile.description}</p>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {[
          { label: "Knowledge", val: (profile.knowledge || []).length },
          { label: "Policies", val: Object.values(profile.policies || {}).filter(Boolean).length },
          { label: "Integrations", val: (profile.detected_platforms || []).length },
          { label: "Gaps", val: openGaps.length },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl p-3">
            <div className="text-2xl font-semibold">{s.val}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Core fields */}
      <Section title="Core details">
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Venue name" value={profile.name || ""} onChange={(v) => update("name", v)} />
          <FieldInput label="Cuisine / vibe" value={profile.cuisine || ""} onChange={(v) => update("cuisine", v)} />
          <FieldInput label="City" value={profile.city || ""} onChange={(v) => update("city", v)} />
          <FieldInput label="Phone" value={profile.phone || ""} onChange={(v) => update("phone", v)} />
          <FieldInput label="Brand voice" value={profile.brand_voice || ""} onChange={(v) => update("brand_voice", v)} className="col-span-2" />
          <div className="col-span-2">
            <Label className="text-xs">Description</Label>
            <Textarea className="mt-1.5" rows={2} value={profile.description || ""} onChange={(e) => update("description", e.target.value)} />
          </div>
        </div>
      </Section>

      {/* Gaps */}
      {openGaps.length > 0 && (
        <Section title="Gaps & one-click fixes" icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}>
          <div className="space-y-2">
            {openGaps.map((g: any) => (
              <div key={g.id} className="glass rounded-xl p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {g.title}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${g.severity === "high" ? "bg-red-500/15 text-red-400" : g.severity === "medium" ? "bg-amber-500/15 text-amber-400" : "bg-muted text-muted-foreground"}`}>{g.severity}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{g.suggested_fix}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => applyGap(g)} className="shrink-0 border-primary/30 hover:bg-primary/10">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Apply
                </Button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Suggested integrations */}
      {(profile.suggested_integrations || []).length > 0 && (
        <Section title="Suggested integrations" icon={<Plug className="h-4 w-4 text-primary" />}>
          <div className="grid grid-cols-2 gap-2">
            {profile.suggested_integrations.map((it: any, i: number) => (
              <div key={i} className="glass rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{it.name}</div>
                  {it.detected ? <span className="text-[10px] text-emerald-400">Detected</span> : <span className="text-[10px] text-muted-foreground">{it.category}</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{it.reason}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Policies */}
      <Section title="Policies">
        <div className="grid grid-cols-2 gap-3">
          {["cancellation", "deposit", "no_show", "large_groups", "children", "dogs"].map((k) => (
            <div key={k}>
              <Label className="text-xs capitalize">{k.replace(/_/g, " ")}</Label>
              <Textarea rows={2} className="mt-1.5 text-xs" value={profile.policies?.[k] || ""} onChange={(e) => updatePolicy(k, e.target.value)} placeholder="—" />
            </div>
          ))}
        </div>
      </Section>

      {/* Knowledge preview */}
      <Section title={`Knowledge base · ${(profile.knowledge || []).length}`}>
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {(profile.knowledge || []).map((k: any, i: number) => (
            <div key={i} className="glass rounded-lg p-2.5 flex items-start gap-2">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-medium">{k.title} <span className="text-[10px] text-muted-foreground">· {k.category}</span></div>
                <div className="text-[11px] text-muted-foreground line-clamp-2">{k.content}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Button onClick={launch} disabled={busy} className="w-full h-12 mt-6 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-[0_0_30px_hsl(var(--primary)/0.5)] text-base">
        {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Launching…</> : <><Zap className="h-4 w-4 mr-2" /> Launch venue <ArrowRight className="ml-2 h-4 w-4" /></>}
      </Button>
    </motion.div>
  );
}

function ManualStep({ onBack, session, refreshVenues, nav }: any) {
  const [form, setForm] = useState({ name: "", website: "", venue_type: "restaurant", cuisine: "", city: "", phone: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return toast.error("Venue name required");
    setBusy(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboard-venue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify(form),
      });
      if (!r.ok || !r.body) throw new Error(`Build failed: ${r.status}`);
      // drain stream silently
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); }
      await refreshVenues();
      toast.success("Venue ready.");
      nav("/app");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-xl">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-3">← Back to instant scan</button>
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Manual setup</h1>
      <p className="text-muted-foreground mb-6 text-sm">Tell us the basics. We'll fill the gaps.</p>
      <form onSubmit={submit} className="glass-strong rounded-2xl p-5 space-y-3">
        <FieldInput label="Venue name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} />
          <FieldInput label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <div>
            <Label className="text-xs">Type</Label>
            <select className="mt-1.5 w-full h-10 rounded-md bg-input border border-input px-3 text-sm" value={form.venue_type} onChange={(e) => setForm({ ...form, venue_type: e.target.value })}>
              <option value="restaurant">Restaurant</option><option value="bar">Bar</option><option value="cafe">Café</option><option value="hotel">Hotel</option><option value="club">Club</option>
            </select>
          </div>
          <FieldInput label="Cuisine / vibe" value={form.cuisine} onChange={(v) => setForm({ ...form, cuisine: v })} />
          <FieldInput label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} className="col-span-2" />
        </div>
        <Button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Building…</> : <>Build venue <ArrowRight className="ml-2 h-4 w-4" /></>}
        </Button>
      </form>
    </motion.div>
  );
}

/* ---------- helpers ---------- */

function Section({ title, icon, children }: any) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wider text-muted-foreground">{icon} {title}</div>
      {children}
    </div>
  );
}

function FieldInput({ label, value, onChange, className = "", required }: any) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1.5" value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}

function FeedRow({ ev }: { ev: Event }) {
  const stageMeta: Record<string, { icon: any; color: string }> = {
    fetch: { icon: Globe, color: "text-blue-400" },
    page: { icon: Search, color: "text-cyan-400" },
    platforms: { icon: Plug, color: "text-fuchsia-400" },
    ai: { icon: Wand2, color: "text-primary" },
    complete: { icon: CheckCircle2, color: "text-emerald-400" },
    error: { icon: AlertTriangle, color: "text-red-400" },
  };
  const m = stageMeta[ev.stage] || { icon: Sparkles, color: "text-primary" };
  const Icon = m.icon;
  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="glass rounded-xl p-3 flex items-start gap-2.5">
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${m.color}`} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{ev.stage}{ev.kind ? ` · ${ev.kind}` : ""}</div>
        <div className="text-xs">{ev.message}</div>
        {ev.platforms && ev.platforms.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {ev.platforms.map((p: any) => (
              <span key={p.id} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{p.name}</span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
