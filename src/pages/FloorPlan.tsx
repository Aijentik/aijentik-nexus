import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Users, Square, Circle as CircleIcon, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

type TableRow = { id: string; label: string; capacity: number; shape: string; x: number; y: number; width: number; height: number; zone_id: string | null };

export default function FloorPlan() {
  const { venue } = useAuth();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [seatingBusy, setSeatingBusy] = useState(false);
  const [seatingResult, setSeatingResult] = useState<{ table: TableRow | null; reason: string } | null>(null);
  const [seatingForm, setSeatingForm] = useState({ party_size: 2, vip: false, notes: "" });
  const dragOffset = useRef({ x: 0, y: 0 });

  const load = async () => {
    if (!venue) return;
    const { data } = await supabase.from("tables").select("*").eq("venue_id", venue.id).order("created_at");
    setTables((data as any) || []);
  };
  useEffect(() => { load(); }, [venue?.id]);

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

  return (
    <>
      <PageHeader title="Floor Plan" subtitle="Drag, resize and define every table. Your AI uses this to seat guests."
        actions={
          <div className="flex gap-2">
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
          className="relative glass rounded-2xl min-h-[640px] overflow-hidden grid-bg cursor-default"
        >
          <div className="absolute top-3 left-3 text-[11px] uppercase tracking-wider text-muted-foreground bg-background/70 backdrop-blur px-2.5 py-1 rounded-full border border-white/10">
            {tables.length} tables · {totalSeats} seats
          </div>
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

        <div className="glass rounded-2xl p-5 space-y-4 h-fit sticky top-4">
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
            <div className="text-sm text-muted-foreground py-12 text-center">Click a table to edit it. Drag to reposition.</div>
          )}
        </div>
      </div>
    </>
  );
}
