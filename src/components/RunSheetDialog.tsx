import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles, Calendar, Users, Crown, Cake, AlertTriangle, Activity,
  Printer, Send, Copy, Loader2, X, Clock, Flame, ChefHat, Shield,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type Props = { open: boolean; onOpenChange: (o: boolean) => void };

export function RunSheetDialog({ open, onOpenChange }: Props) {
  const { venue } = useAuth();
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [stage, setStage] = useState<"setup" | "sheet" | "send">("setup");
  const [recipients, setRecipients] = useState<{ name: string; phone: string; selected: boolean }[]>([]);
  const [customMsg, setCustomMsg] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) { setData(null); setStage("setup"); }
  }, [open]);

  const generate = async () => {
    if (!venue) return;
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("generate-run-sheet", {
        body: { venue_id: venue.id, target_date: new Date(date + "T12:00:00").toISOString() },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      setData(res);
      setStage("sheet");
      const team = ((res as any).team || []).map((t: any) => ({ name: t.name, phone: "", selected: true }));
      setRecipients(team.length ? team : []);
    } catch (e: any) {
      toast.error("Couldn't generate", { description: e?.message });
    } finally { setLoading(false); }
  };

  const dayLabel = useMemo(() => data ? format(new Date(data.date), "EEEE, d MMM yyyy") : "", [data]);

  const summaryText = useMemo(() => {
    if (!data) return "";
    const lines: string[] = [];
    lines.push(`${data.venue?.name?.toUpperCase()} — RUN SHEET`);
    lines.push(dayLabel);
    lines.push("");
    lines.push(`▸ ${data.briefing.headline}`);
    lines.push(data.briefing.summary);
    lines.push("");
    lines.push(`${data.totals.bookings} bookings · ${data.totals.covers} covers · peak ${data.totals.peak_hour || "—"}`);
    if (data.vips.length) lines.push(`VIPs (${data.vips.length}): ` + data.vips.map((v: any) => `${v.name} @ ${format(new Date(v.time), "HH:mm")}`).join(", "));
    if (data.large_groups.length) lines.push(`Large groups: ` + data.large_groups.map((v: any) => `${v.name} (${v.party}) @ ${format(new Date(v.time), "HH:mm")}`).join(", "));
    if (data.birthdays.length) lines.push(`Celebrations: ` + data.birthdays.map((v: any) => `${v.name} @ ${format(new Date(v.time), "HH:mm")}`).join(", "));
    if (data.dietary.length) lines.push(`Dietary: ${data.dietary.length} flagged — brief kitchen`);
    if (data.briefing.risks?.length) lines.push(`Risks: ${data.briefing.risks.join(" | ")}`);
    if (data.briefing.recommendations?.length) lines.push(`Actions: ${data.briefing.recommendations.join(" | ")}`);
    return lines.join("\n");
  }, [data, dayLabel]);

  const copyText = async () => {
    await navigator.clipboard.writeText(summaryText);
    toast.success("Run sheet copied");
  };

  const doPrint = () => {
    window.print();
  };

  const sendSMS = async () => {
    const recs = recipients.filter(r => r.selected && r.phone.trim());
    if (!recs.length) return toast.error("Add at least one phone number");
    setSending(true);
    let ok = 0, fail = 0;
    for (const r of recs) {
      const phone = r.phone.trim();
      const e164 = phone.startsWith("+") ? phone : phone;
      const message = (customMsg || summaryText).slice(0, 1500);
      const { data: res, error } = await supabase.functions.invoke("send-sms", {
        body: { venue_id: venue!.id, to: e164, message },
      });
      if (error || (res as any)?.error) fail++; else ok++;
    }
    setSending(false);
    if (ok) toast.success(`Sent to ${ok}${fail ? ` · ${fail} failed` : ""}`);
    if (fail && !ok) toast.error("All sends failed", { description: "Check phone numbers are E.164 (+44...)" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl w-[95vw] max-h-[92vh] overflow-hidden p-0 border-white/10 bg-card/95 print:max-w-none print:w-auto print:max-h-none print:bg-white print:text-black"
        onInteractOutside={(e) => loading && e.preventDefault()}
      >
        {/* Sticky top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 print:hidden">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_8px_28px_-6px_hsl(var(--primary)/0.6)]">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold tracking-tight">AI Run Sheet</div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-widest">Operational Briefing</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="overflow-y-auto max-h-[calc(92vh-64px)] print:overflow-visible print:max-h-none">
          <AnimatePresence mode="wait">
            {stage === "setup" && (
              <motion.div
                key="setup"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="p-10 grid gap-8"
              >
                <div className="text-center max-w-xl mx-auto space-y-3">
                  <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-primary/80 border border-primary/30 bg-primary/8 px-3 py-1 rounded-full">
                    <Sparkles className="h-3 w-3" /> Powered by Aijentik AI
                  </div>
                  <h2 className="text-3xl font-semibold tracking-tight">Generate today's run sheet</h2>
                  <p className="text-sm text-muted-foreground">
                    One click pulls bookings, VIPs, dietary, large groups, and team — and writes a Michelin-grade pre-service briefing in seconds.
                  </p>
                </div>
                <div className="max-w-md mx-auto w-full space-y-4">
                  <div>
                    <div className="label-micro mb-2">Service date</div>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 text-base" />
                  </div>
                  <Button
                    size="lg"
                    onClick={generate}
                    disabled={loading}
                    className="w-full h-14 text-base bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40 shadow-[0_18px_48px_-12px_hsl(var(--primary)/0.7)]"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Composing run sheet…</> : <><Sparkles className="h-4 w-4 mr-2" /> Generate run sheet</>}
                  </Button>
                  {loading && (
                    <div className="text-center text-xs text-muted-foreground space-y-1 pt-2">
                      <div>Reading diary · scoring risks · briefing team…</div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {stage === "sheet" && data && (
              <motion.div key="sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="print:p-0">
                <RunSheetView data={data} dayLabel={dayLabel} />

                {/* Actions bar */}
                <div className="sticky bottom-0 px-6 py-4 border-t border-white/10 bg-card/95 backdrop-blur flex flex-wrap items-center gap-2 justify-end print:hidden">
                  <Button variant="outline" onClick={copyText}><Copy className="h-4 w-4 mr-2" /> Copy</Button>
                  <Button variant="outline" onClick={doPrint}><Printer className="h-4 w-4 mr-2" /> Print / PDF</Button>
                  <Button
                    onClick={() => setStage("send")}
                    className="bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40"
                  >
                    <Send className="h-4 w-4 mr-2" /> Send to team
                  </Button>
                </div>
              </motion.div>
            )}

            {stage === "send" && data && (
              <motion.div key="send" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-5">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Step 2</div>
                  <h3 className="text-2xl font-semibold tracking-tight">Send to team</h3>
                  <p className="text-sm text-muted-foreground mt-1">Add phones for staff on shift. SMS goes out from your venue number.</p>
                </div>

                <div className="card-cine p-4 space-y-3 max-h-[40vh] overflow-y-auto">
                  {recipients.length === 0 && (
                    <div className="text-sm text-muted-foreground py-4 text-center">No team yet — add one below.</div>
                  )}
                  {recipients.map((r, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Checkbox
                        checked={r.selected}
                        onCheckedChange={(v) => setRecipients(prev => prev.map((x, j) => j === i ? { ...x, selected: !!v } : x))}
                      />
                      <Input
                        placeholder="Name"
                        value={r.name}
                        onChange={(e) => setRecipients(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        className="flex-1"
                      />
                      <Input
                        placeholder="+44..."
                        value={r.phone}
                        onChange={(e) => setRecipients(prev => prev.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))}
                        className="w-48"
                      />
                      <Button variant="ghost" size="icon" onClick={() => setRecipients(prev => prev.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setRecipients(prev => [...prev, { name: "", phone: "", selected: true }])}
                  >
                    + Add recipient
                  </Button>
                </div>

                <div>
                  <div className="label-micro mb-2">Message (auto-filled from sheet)</div>
                  <Textarea
                    value={customMsg || summaryText}
                    onChange={(e) => setCustomMsg(e.target.value)}
                    rows={8}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="flex justify-between items-center gap-2">
                  <Button variant="ghost" onClick={() => setStage("sheet")}>← Back</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={copyText}><Copy className="h-4 w-4 mr-2" /> Copy</Button>
                    <Button
                      onClick={sendSMS}
                      disabled={sending}
                      className="bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40"
                    >
                      {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                      Send SMS
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------- The sheet itself ------------------- */
function RunSheetView({ data, dayLabel }: { data: any; dayLabel: string }) {
  const { venue, totals, bookings, pacing, vips, large_groups, birthdays, dietary, briefing, team } = data;
  const maxCovers = Math.max(1, ...pacing.map((p: any) => p.covers));

  return (
    <div className="p-6 md:p-10 space-y-8 print:p-8 print:text-black">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/12 via-card to-accent/8 p-8 print:border-black print:bg-white">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl print:hidden" />
        <div className="relative space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.25em] text-primary/80 print:text-black">{venue.name} · Run Sheet</div>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mt-2">{dayLabel}</h1>
              <p className="text-lg text-foreground/85 mt-3 max-w-2xl print:text-black">{briefing.headline}</p>
            </div>
            <div className="flex gap-4 flex-wrap">
              <Stat icon={Calendar} label="Bookings" value={totals.bookings} />
              <Stat icon={Users} label="Covers" value={totals.covers} />
              <Stat icon={Flame} label="Peak" value={totals.peak_hour || "—"} />
              <Stat icon={Activity} label="Util." value={`${totals.utilisation_pct}%`} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed print:text-black">{briefing.summary}</p>
        </div>
      </div>

      {/* Briefing grid */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card title="Risks" icon={AlertTriangle} tone="warn">
          {(briefing.risks || []).length === 0 ? <Empty>Clear sailing</Empty> :
            <ul className="space-y-2 text-sm">
              {briefing.risks.map((r: string, i: number) => <li key={i} className="flex gap-2"><span className="text-warn">▸</span>{r}</li>)}
            </ul>}
        </Card>
        <Card title="Actions" icon={Sparkles} tone="primary">
          {(briefing.recommendations || []).length === 0 ? <Empty>—</Empty> :
            <ul className="space-y-2 text-sm">
              {briefing.recommendations.map((r: string, i: number) => <li key={i} className="flex gap-2"><span className="text-primary">▸</span>{r}</li>)}
            </ul>}
        </Card>
        <Card title="Staffing" icon={Shield} tone="default">
          <div className="text-sm text-foreground/85">{briefing.staffing_notes}</div>
          {team.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {team.map((t: any) => (
                <span key={t.user_id} className="text-[11px] px-2 py-1 rounded-md border border-white/10 bg-white/[0.04] print:border-black print:bg-white">
                  {t.name} <span className="text-muted-foreground">· {t.role}</span>
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Pacing chart */}
      {pacing.length > 0 && (
        <div>
          <SectionTitle icon={Activity}>Service pacing</SectionTitle>
          <div className="card-cine p-5 print:border print:border-black">
            <div className="flex items-end gap-2 h-32">
              {pacing.map((p: any) => (
                <div key={p.hour} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[10px] text-muted-foreground tabular-nums">{p.covers}</div>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-primary/40 to-accent/80 print:bg-black"
                    style={{ height: `${(p.covers / maxCovers) * 100}%`, minHeight: 4 }}
                  />
                  <div className="text-[10px] text-muted-foreground tabular-nums">{p.hour}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Highlights */}
      <div className="grid md:grid-cols-2 gap-4">
        <HighlightList title="VIPs" icon={Crown} items={vips} accent="primary" />
        <HighlightList title="Celebrations" icon={Cake} items={birthdays} accent="accent" />
        <HighlightList title="Large groups" icon={Users} items={large_groups} accent="warn" />
        <HighlightList title="Dietary & allergens" icon={ChefHat} items={dietary} accent="success" showNotes />
      </div>

      {/* Timeline */}
      <div>
        <SectionTitle icon={Clock}>Service timeline</SectionTitle>
        <div className="card-cine divide-y divide-white/[0.05] overflow-hidden print:border print:border-black">
          {bookings.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No bookings on this date.</div>}
          {bookings.map((b: any) => (
            <div key={b.id} className="p-4 flex items-center gap-4 print:p-3">
              <div className="h-12 w-14 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 grid place-items-center text-primary font-semibold tabular-nums text-sm print:border-black print:text-black print:bg-white">
                {format(new Date(b.booking_time), "HH:mm")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium flex items-center gap-2 flex-wrap text-sm">
                  <span>{b.guest_name}</span>
                  <span className="text-muted-foreground font-normal">· party of {b.party_size}</span>
                  {b.vip && <Badge color="primary"><Crown className="h-2.5 w-2.5" /> VIP</Badge>}
                  {b.repeat && !b.vip && <Badge color="muted">{b.visit_count}× guest</Badge>}
                  {b.birthday && <Badge color="accent"><Cake className="h-2.5 w-2.5" /> Celebration</Badge>}
                  {b.dietary && <Badge color="success"><ChefHat className="h-2.5 w-2.5" /> Dietary</Badge>}
                </div>
                {(b.notes || b.table_label) && (
                  <div className="text-xs text-muted-foreground mt-1 truncate print:text-black">
                    {b.table_label && <span className="text-foreground/70">Table {b.table_label}{b.zone_name ? ` · ${b.zone_name}` : ""} · </span>}
                    {b.notes || "—"}
                  </div>
                )}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:block print:hidden">{b.status}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground pt-4 print:text-black">
        Aijentik · {venue.name} · {dayLabel}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: any) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/40 border border-white/10 print:border-black print:bg-white">
      <Icon className="h-4 w-4 text-primary print:text-black" />
      <div>
        <div className="text-lg font-semibold tabular-nums leading-none">{value}</div>
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5 print:text-black">{label}</div>
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, tone = "default", children }: any) {
  const toneClass = tone === "warn" ? "border-warn/25 bg-warn/5"
    : tone === "primary" ? "border-primary/25 bg-primary/5"
    : "border-white/10 bg-white/[0.02]";
  return (
    <div className={`rounded-xl border p-4 ${toneClass} print:border-black print:bg-white`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-foreground/80 print:text-black" />
        <div className="text-xs uppercase tracking-widest text-foreground/80 print:text-black">{title}</div>
      </div>
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: any) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <Icon className="h-4 w-4 text-primary print:text-black" />
      <div className="text-xs uppercase tracking-[0.25em] text-foreground/80 print:text-black">{children}</div>
      <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent print:bg-black" />
    </div>
  );
}

function Empty({ children }: any) {
  return <div className="text-sm text-muted-foreground italic">{children}</div>;
}

function Badge({ color, children }: any) {
  const cls = color === "primary" ? "border-primary/40 bg-primary/10 text-primary"
    : color === "accent" ? "border-accent/40 bg-accent/10 text-accent"
    : color === "success" ? "border-success/40 bg-success/10 text-success"
    : color === "warn" ? "border-warn/40 bg-warn/10 text-warn"
    : "border-white/10 bg-white/[0.04] text-foreground/70";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls} print:border-black print:bg-white print:text-black`}>
      {children}
    </span>
  );
}

function HighlightList({ title, icon: Icon, items, accent, showNotes }: any) {
  return (
    <div>
      <SectionTitle icon={Icon}>{title} {items.length > 0 && <span className="text-muted-foreground">· {items.length}</span>}</SectionTitle>
      <div className="card-cine p-4 min-h-[100px] print:border print:border-black">
        {items.length === 0 ? <Empty>None</Empty> : (
          <ul className="space-y-2.5">
            {items.map((it: any) => (
              <li key={it.id} className="flex items-start gap-3 text-sm">
                <div className="text-primary font-semibold tabular-nums text-xs mt-0.5 print:text-black">{format(new Date(it.time), "HH:mm")}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{it.name} <span className="text-muted-foreground font-normal">· {it.party}</span></div>
                  {showNotes && it.notes && <div className="text-xs text-muted-foreground mt-0.5 print:text-black">{it.notes}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
