import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Users, Square, Circle as CircleIcon, Sparkles, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";

type TableRow = { id: string; label: string; capacity: number; shape: string; x: number; y: number; width: number; height: number; zone_id: string | null };

const DEMO_TABLES = [
  { label: "T1", capacity: 2, shape: "round", x: 60, y: 60 }, { label: "T2", capacity: 2, shape: "round", x: 180, y: 60 },
  { label: "T3", capacity: 2, shape: "round", x: 300, y: 60 }, { label: "T4", capacity: 4, shape: "square", x: 60, y: 200 },
  { label: "T5", capacity: 4, shape: "square", x: 200, y: 200 }, { label: "T6", capacity: 4, shape: "square", x: 340, y: 200 },
  { label: "T7", capacity: 6, shape: "square", x: 60, y: 360 }, { label: "T8", capacity: 6, shape: "square", x: 220, y: 360 },
  { label: "Bar", capacity: 8, shape: "square", x: 480, y: 60 },
];

export default function FloorPlan() {
  const nav = useNavigate();
  const { venue, venues, setActiveVenue } = useAuth();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [seatingBusy, setSeatingBusy] = useState(false);
  const [seatingResult, setSeatingResult] = useState<{ table: TableRow | null; reason: string } | null>(null);
  const [seatingForm, setSeatingForm] = useState({ party_size: 2, vip: false, notes: "" });
  const dragOffset = useRef({ x: 0, y: 0 });

  const [seedingDemo, setSeedingDemo] = useState(false);

  const load = async () => {
    if (!venue) return;
    const { data } = await supabase.from("tables").select("*").eq("venue_id", venue.id).order("created_at");
    setTables((data as any) || []);
  };
  useEffect(() => { load(); }, [venue?.id]);

  const seedDemo = async () => {
    if (!venue) return;
    setSeedingDemo(true);
    try {
      const { data, error } = await supabase.from("tables").insert(
        DEMO_TABLES.map(t => ({ ...t, venue_id: venue.id, width: 80, height: 80 }))
      ).select();
      if (error) throw error;
      setTables(t => [...t, ...(data as any[])]);
      toast.success("Demo floor plan loaded");
    } catch (e: any) { toast.error(e.message); } finally { setSeedingDemo(false); }
  };

  const addTable = async (shape: "round" | "square") => {
    if (!venue) return;
    const { data, error } = await supabase.from("tables").insert({
      venue_id: venue.id,
      label: `T${tables.length + 1}`,
      capacity: 2,
      shape,
      x: 80 + (tables.length * 30) % 400,
      y: 80 + Math.floor((tables.length * 30) / 400) * 80,
      width: 80, height: 80,
    }).select().single();
    if (error) return toast.error(error.message);
    setTables(t => [...t, data as any]);
    setSelected((data as any).id);
  };

  const onMouseDown = (e: React.MouseEvent, t: TableRow) => {
    setSelected(t.id);
    setDragging(t.id);
    const rect = canvasRef.current!.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left - t.x, y: e.clientY - rect.top - t.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - dragOffset.current.x);
    const y = Math.max(0, e.clientY - rect.top - dragOffset.current.y);
    setTables(ts => ts.map(t => t.id === dragging ? { ...t, x, y } : t));
  };

  const onMouseUp = async () => {
    if (!dragging) return;
    const t = tables.find(x => x.id === dragging);
    setDragging(null);
    if (t) await supabase.from("tables").update({ x: t.x, y: t.y }).eq("id", t.id);
  };

  const updateTable = async (id: string, patch: Partial<TableRow>) => {
    setTables(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    await supabase.from("tables").update(patch).eq("id", id);
  };

  const removeTable = async (id: string) => {
    await supabase.from("tables").delete().eq("id", id);
    setTables(t => t.filter(x => x.id !== id));
    if (selected === id) setSelected(null);
  };

  const sel = tables.find(t => t.id === selected);
  const totalSeats = tables.reduce((a, t) => a + t.capacity, 0);

  const suggestSeating = async () => {
    if (!venue) return;
    setSeatingBusy(true); setSeatingResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-seating", { body: { venue_id: venue.id, ...seatingForm } });
      if (error) throw error;
      if (!data?.suggestion) { toast.error(data?.reason || "No table fits"); return; }
      setSeatingResult({ table: data.suggestion, reason: data.reason });
      setSelected(data.suggestion.id);
    } catch (e: any) { toast.error(e.message); } finally { setSeatingBusy(false); }
  };

  return (
    <>
      <PageHeader title="Floor Plan" subtitle="Drag, resize and define every table. Your AI uses this to seat guests."
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5 glass rounded-md px-2 h-10">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <select value={venue?.id || ""} onChange={e => setActiveVenue(e.target.value)}
                className="bg-transparent text-sm outline-none pr-2 max-w-[180px]">
                {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <Button variant="outline" onClick={() => nav("/app/floor/new")}><Plus className="h-4 w-4 mr-2" /> New floor plan</Button>
            <Button variant="outline" onClick={() => addTable("round")}><CircleIcon className="h-4 w-4 mr-2" /> Round</Button>
            <Button onClick={() => addTable("square")} className="bg-primary text-primary-foreground"><Square className="h-4 w-4 mr-2" /> Square</Button>
          </div>
        } />

      <div className="grid lg:grid-cols-[1fr,320px] gap-4">
        <div
          ref={canvasRef}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onClick={(e) => e.target === e.currentTarget && setSelected(null)}
          className="relative card-cine min-h-[640px] overflow-hidden grid-bg cursor-default"
        >
          <div className="absolute top-3 left-3 text-[11px] uppercase tracking-wider text-muted-foreground bg-background/70 backdrop-blur px-2.5 py-1 rounded-full border border-white/10">
            {tables.length} tables · {totalSeats} seats
          </div>
          {tables.length === 0 && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center max-w-sm card-cine p-8">
                <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
                <div className="font-medium mb-1">No tables yet</div>
                <div className="text-sm text-muted-foreground mb-4">Drop in a demo layout to see your AI seating engine in action.</div>
                <div className="flex gap-2 justify-center">
                  <Button onClick={seedDemo} disabled={seedingDemo} className="bg-primary text-primary-foreground">
                    {seedingDemo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />} Load demo tables
                  </Button>
                  <Button variant="outline" onClick={() => nav("/app/floor/new")}>New plan</Button>
                </div>
              </div>
            </div>
          )}
          {tables.map(t => (
            <div
              key={t.id}
              onMouseDown={(e) => onMouseDown(e, t)}
              style={{
                left: t.x, top: t.y, width: t.width, height: t.height,
                borderRadius: t.shape === "round" ? "50%" : "12px",
              }}
              className={`absolute select-none cursor-grab active:cursor-grabbing transition-shadow flex flex-col items-center justify-center text-center
                ${selected === t.id
                  ? "bg-gradient-to-br from-primary/40 to-accent/30 border-2 border-primary shadow-[0_0_30px_hsl(var(--primary)/0.5)]"
                  : "bg-secondary/70 border border-white/10 hover:border-primary/40"}`}
            >
              <div className="text-sm font-semibold">{t.label}</div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="h-2.5 w-2.5" />{t.capacity}</div>
            </div>
          ))}
        </div>

        <div className="card-cine p-5 space-y-4 h-fit sticky top-4">
          {sel ? (
            <>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Editing</div>
              <div><Label>Label</Label><Input className="mt-1.5" value={sel.label} onChange={e => updateTable(sel.id, { label: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Seats</Label><Input className="mt-1.5" type="number" min={1} value={sel.capacity} onChange={e => updateTable(sel.id, { capacity: +e.target.value })} /></div>
                <div><Label>Shape</Label>
                  <select value={sel.shape} onChange={e => updateTable(sel.id, { shape: e.target.value })}
                    className="mt-1.5 w-full h-10 rounded-md bg-input border border-input px-3 text-sm">
                    <option value="round">Round</option><option value="square">Square</option>
                  </select>
                </div>
                <div><Label>Width</Label><Input className="mt-1.5" type="number" value={sel.width} onChange={e => updateTable(sel.id, { width: +e.target.value })} /></div>
                <div><Label>Height</Label><Input className="mt-1.5" type="number" value={sel.height} onChange={e => updateTable(sel.id, { height: +e.target.value })} /></div>
              </div>
              <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => removeTable(sel.id)}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            </>
          ) : (
            <div className="text-sm text-muted-foreground py-8 text-center">Click a table to edit it. Drag to reposition.</div>
          )}

          <div className="border-t border-white/10 pt-4 space-y-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> AI seating
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Party</Label><Input className="mt-1 h-9" type="number" min={1} value={seatingForm.party_size} onChange={e => setSeatingForm({...seatingForm, party_size: +e.target.value})} /></div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={seatingForm.vip} onChange={e => setSeatingForm({...seatingForm, vip: e.target.checked})} className="accent-primary" /> VIP
                </label>
              </div>
            </div>
            <Input className="h-9" placeholder="Notes (window, quiet, anniversary…)" value={seatingForm.notes} onChange={e => setSeatingForm({...seatingForm, notes: e.target.value})} />
            <Button onClick={suggestSeating} disabled={seatingBusy} className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground">
              {seatingBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />} Suggest table
            </Button>
            {seatingResult?.table && (
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 text-xs">
                <div className="font-semibold text-primary">{seatingResult.table.label} · seats {seatingResult.table.capacity}</div>
                <div className="text-muted-foreground mt-1">{seatingResult.reason}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
