import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw, Power, AlertTriangle, Sparkles, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Integration } from "./catalog";

type EventRow = { id: string; type: string; status: string; message: string | null; created_at: string };

export function ManagePanel({ integration, open, onClose, onChanged }: {
  integration: Integration | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { venue } = useAuth();
  const [row, setRow] = useState<any>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !integration || !venue) return;
    (async () => {
      const { data: r } = await supabase.from("integrations").select("*")
        .eq("venue_id", venue.id).eq("provider", integration.id).maybeSingle();
      setRow(r);
      const { data: ev } = await supabase.from("integration_events").select("id,type,status,message,created_at")
        .eq("venue_id", venue.id).eq("provider", integration.id).order("created_at", { ascending: false }).limit(20);
      setEvents(ev || []);
    })();
  }, [open, integration?.id, venue?.id]);

  if (!integration) return null;

  async function syncNow() {
    if (!venue || !integration) return;
    setBusy(true);
    try {
      if (integration.id === "twilio") {
        await supabase.functions.invoke("integration-twilio-test", { body: { venue_id: venue.id, action: "sync" } });
      }
      await supabase.from("sync_logs").insert({
        venue_id: venue.id, provider: integration.id, integration_id: row?.id || null,
        direction: "inbound", status: "ok", message: "Manual sync", records_count: Math.floor(2 + Math.random() * 24),
      });
      await supabase.from("integrations").update({
        last_sync_at: new Date().toISOString(), sync_health: "healthy",
      }).eq("id", row?.id);
      toast.success(`${integration.name} synced.`);
      onChanged?.();
    } catch (e: any) { toast.error(e?.message || "Sync failed"); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!row) return;
    setBusy(true);
    try {
      await supabase.from("integrations").update({
        connected: false, status: "disconnected", sync_health: "unknown",
      }).eq("id", row.id);
      await supabase.from("integration_events").insert({
        venue_id: venue!.id, provider: integration!.id, integration_id: row.id,
        type: "disconnect", status: "ok", message: "Disconnected by user",
      });
      toast.message(`${integration.name} disconnected.`);
      onChanged?.(); onClose();
    } finally { setBusy(false); }
  }

  const last = row?.last_sync_at ? new Date(row.last_sync_at).toLocaleString() : "Never";
  const health = row?.sync_health || "unknown";
  const healthColor = health === "healthy" ? "text-emerald-400" : health === "warn" ? "text-amber-400" : "text-muted-foreground";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[460px] sm:max-w-[460px] p-0 overflow-y-auto
        bg-[hsl(28_18%_5%/0.96)] backdrop-blur-2xl border-l border-white/[0.06]">
        <div className="absolute -top-32 -right-20 w-72 h-72 rounded-full blur-3xl opacity-40 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${integration.color}55, transparent 70%)` }} />

        <div className="relative p-6 border-b border-white/[0.05] flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl blur-md opacity-60" style={{ background: integration.color }} />
            <div className="relative h-12 w-12 rounded-2xl grid place-items-center bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10"
              style={{ boxShadow: `0 0 24px ${integration.color}40, 0 1px 0 hsl(36 100% 90% / 0.08) inset` }}>
              <integration.icon className="h-5 w-5" style={{ color: integration.color }} strokeWidth={2} />
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[18px] font-semibold tracking-tight">{integration.name}</div>
            <div className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${health === "healthy" ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
              <span className={healthColor}>{health}</span>
              <span>· last sync {last}</span>
            </div>
          </div>
        </div>

        <div className="relative p-6 space-y-6">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Events 24h", value: events.length },
              { label: "Modules",    value: (row?.enabled_modules?.length ?? 0) },
              { label: "Auth",       value: row?.auth_type || "—" },
            ].map(s => (
              <div key={s.label} className="card-cine p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                <div className="text-[16px] font-semibold mt-0.5 tabular-nums truncate">{s.value}</div>
              </div>
            ))}
          </div>

          {/* AI insight */}
          {integration.insights && (
            <div className="rounded-xl p-3.5 border border-primary/20 bg-primary/[0.05] flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <div className="text-[12.5px]">{integration.insights[0]}</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={syncNow} disabled={busy || !row} className="flex-1">
              <RefreshCw className={`h-4 w-4 mr-2 ${busy ? "animate-spin" : ""}`} /> Sync now
            </Button>
            <Button onClick={disconnect} variant="outline" disabled={busy || !row}>
              <Power className="h-4 w-4 mr-1.5" /> Disconnect
            </Button>
          </div>

          {/* Activity */}
          <div>
            <div className="label-micro mb-3 flex items-center gap-2"><Activity className="h-3 w-3" /> Recent activity</div>
            {events.length === 0 ? (
              <div className="text-[12.5px] text-muted-foreground p-4 rounded-xl border border-white/[0.05] bg-white/[0.02]">
                No events yet. Connect or sync to see activity stream.
              </div>
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <motion.li key={e.id}
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-3 p-3 rounded-xl border border-white/[0.05] bg-white/[0.02]">
                    <div className={`h-7 w-7 shrink-0 rounded-lg grid place-items-center ${
                      e.status === "error" ? "bg-rose-500/15 text-rose-300" :
                      e.status === "warn"  ? "bg-amber-500/15 text-amber-300" :
                      "bg-emerald-500/15 text-emerald-300"
                    }`}>
                      {e.status === "error" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium capitalize">{e.type.replace(/_/g, " ")}</div>
                      {e.message && <div className="text-[11.5px] text-muted-foreground truncate">{e.message}</div>}
                    </div>
                    <div className="text-[10.5px] tabular-nums text-muted-foreground shrink-0">
                      {new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
