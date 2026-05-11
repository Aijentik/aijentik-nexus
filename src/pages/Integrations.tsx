import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Check, Search, Sparkles } from "lucide-react";
import { INTEGRATIONS, type Integration } from "@/components/integrations/catalog";
import { ConnectionModal } from "@/components/integrations/ConnectionModal";
import { ManagePanel } from "@/components/integrations/ManagePanel";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

type Conn = { provider: string; connected: boolean; sync_health: string | null; last_sync_at: string | null };

export default function Integrations() {
  const { venue } = useAuth();
  const [conns, setConns] = useState<Record<string, Conn>>({});
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("All");
  const [connectTarget, setConnectTarget] = useState<Integration | null>(null);
  const [manageTarget, setManageTarget] = useState<Integration | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!venue) return;
    (async () => {
      const { data } = await supabase.from("integrations")
        .select("provider,connected,sync_health,last_sync_at")
        .eq("venue_id", venue.id);
      const map: Record<string, Conn> = {};
      (data || []).forEach((d: any) => { map[d.provider] = d; });
      setConns(map);
    })();
  }, [venue?.id, reload]);

  const categories = useMemo(() => ["All", ...Array.from(new Set(INTEGRATIONS.map(i => i.category)))], []);
  const filtered = INTEGRATIONS.filter(i =>
    (activeCat === "All" || i.category === activeCat) &&
    (!query || i.name.toLowerCase().includes(query.toLowerCase()) || i.desc.toLowerCase().includes(query.toLowerCase()))
  );

  const connectedCount = Object.values(conns).filter(c => c.connected).length;

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Connect your stack. Aijentik becomes the operating layer that orchestrates everything."
        actions={
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="pulse-amber !h-1.5 !w-1.5" /> {connectedCount} connected · {INTEGRATIONS.length} available
          </div>
        }
      />

      {/* Search + categories — minimal, doesn't touch the grid */}
      <div className="mb-6 space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search integrations…" className="pl-9 h-10 bg-white/[0.02] border-white/[0.06]" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map(c => (
            <button key={c} onClick={() => setActiveCat(c)}
              className={`text-[11.5px] px-3 py-1.5 rounded-full border transition-all ${
                activeCat === c
                  ? "border-primary/50 bg-primary/[0.08] text-primary shadow-[0_0_18px_-6px_hsl(var(--primary)/0.5)]"
                  : "border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:text-foreground"
              }`}>{c}</button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((i, idx) => {
          const conn = conns[i.id];
          const isConnected = !!conn?.connected;
          return (
            <motion.div
              key={i.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03, duration: 0.4 }}
              className="card-cine p-5 flex flex-col relative overflow-hidden"
            >
              <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-25 pointer-events-none" style={{ background: i.color }} />

              <div className="flex items-start justify-between mb-4">
                <div className="relative">
                  {isConnected && <div className="absolute inset-0 rounded-xl blur-md opacity-60" style={{ background: i.color }} />}
                  <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 grid place-items-center"
                    style={isConnected ? { boxShadow: `0 0 20px ${i.color}40, 0 1px 0 hsl(36 100% 90% / 0.1) inset` } : {}}>
                    <i.icon className="h-5 w-5" style={{ color: i.color }} strokeWidth={2} />
                  </div>
                </div>
                <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${
                  isConnected
                    ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30'
                    : 'bg-secondary/60 text-muted-foreground border-white/5'
                }`}>
                  {isConnected && <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse" />}
                  {isConnected ? "Live" : "Not connected"}
                </span>
              </div>

              <div className="font-medium text-[15px] flex items-center gap-2">
                {i.name}
                {i.highlight && <Sparkles className="h-3 w-3 text-primary" />}
              </div>
              <div className="text-[13px] text-muted-foreground mt-1.5 mb-5 min-h-[2.5rem] leading-relaxed">{i.desc}</div>

              <Button
                variant="outline"
                className="w-full border-white/10 mt-auto h-9"
                onClick={() => isConnected ? setManageTarget(i) : setConnectTarget(i)}
              >
                {isConnected ? <><Check className="h-3.5 w-3.5 mr-1.5 text-[hsl(var(--success))]" /> Manage</> : "Connect"}
              </Button>
            </motion.div>
          );
        })}
      </div>

      <ConnectionModal
        integration={connectTarget}
        open={!!connectTarget}
        onClose={() => setConnectTarget(null)}
        onConnected={() => setReload(r => r + 1)}
      />
      <ManagePanel
        integration={manageTarget}
        open={!!manageTarget}
        onClose={() => setManageTarget(null)}
        onChanged={() => setReload(r => r + 1)}
      />
    </>
  );
}
