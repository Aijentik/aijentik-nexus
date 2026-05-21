import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Trash2, Users, Square, Circle as CircleIcon, Sparkles, Loader2, Building2,
  ZoomIn, ZoomOut, Maximize2, Hand, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

type TableRow = { id: string; label: string; capacity: number; shape: string; x: number; y: number; width: number; height: number; zone_id: string | null };

const DEMO_TABLES = [
  { label: "T1", capacity: 2, shape: "round", x: 60, y: 60 }, { label: "T2", capacity: 2, shape: "round", x: 180, y: 60 },
  { label: "T3", capacity: 2, shape: "round", x: 300, y: 60 }, { label: "T4", capacity: 4, shape: "square", x: 60, y: 200 },
  { label: "T5", capacity: 4, shape: "square", x: 200, y: 200 }, { label: "T6", capacity: 4, shape: "square", x: 340, y: 200 },
  { label: "T7", capacity: 6, shape: "square", x: 60, y: 360 }, { label: "T8", capacity: 6, shape: "square", x: 220, y: 360 },
  { label: "Bar", capacity: 8, shape: "square", x: 480, y: 60 },
];

type Mode = "select" | "pan";

export default function FloorPlan() {
  const nav = useNavigate();
  const { venue, venues, setActiveVenue } = useAuth();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [locked, setLocked] = useState(false);
  const [mode, setMode] = useState<Mode>("select");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [seatingBusy, setSeatingBusy] = useState(false);
  const [seatingResult, setSeatingResult] = useState<{ table: TableRow | null; reason: string } | null>(null);
  const [seatingForm, setSeatingForm] = useState({ party_size: 2, vip: false, notes: "" });
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  const [seedingDemo, setSeedingDemo] = useState(false);

  const load = async () => {
    if (!venue) return;
    const { data } = await supabase.from("tables").select("*").eq("venue_id", venue.id).order("created_at");
    setTables((data as any) || []);
  };
  useEffect(() => { load(); }, [venue?.id]);

  // Keyboard shortcuts: V select, H pan, +/- zoom, 0 reset, Delete remove
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "v") setMode("select");
      else if (e.key === "h") setMode("pan");
      else if (e.key === "+" || e.key === "=") setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)));
      else if (e.key === "-") setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(2)));
      else if (e.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
      else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        removeTable(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

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

  const screenToCanvas = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  };

  const onTableMouseDown = (e: React.MouseEvent, t: TableRow) => {
    if (locked || mode !== "select") return;
    e.stopPropagation();
    setSelected(t.id);
    setDragging(t.id);
    const p = screenToCanvas(e.clientX, e.clientY);
    dragOffset.current = { x: p.x - t.x, y: p.y - t.y };
  };

  const onResizeMouseDown = (e: React.MouseEvent, t: TableRow) => {
    if (locked) return;
    e.stopPropagation();
    setSelected(t.id);
    setResizing(t.id);
    resizeStart.current = { x: e.clientX, y: e.clientY, w: t.width, h: t.height };
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("floor-canvas-inner")) return;
    if (mode === "pan" || e.button === 1 || e.shiftKey) {
      setPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    } else {
      setSelected(null);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (panning) {
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.x),
        y: panStart.current.py + (e.clientY - panStart.current.y),
      });
      return;
    }
    if (resizing) {
      const dx = (e.clientX - resizeStart.current.x) / zoom;
      const dy = (e.clientY - resizeStart.current.y) / zoom;
      setTables(ts => ts.map(t => t.id === resizing
        ? { ...t, width: Math.max(40, resizeStart.current.w + dx), height: Math.max(40, resizeStart.current.h + dy) }
        : t));
      return;
    }
    if (dragging) {
      const p = screenToCanvas(e.clientX, e.clientY);
      const x = Math.max(0, p.x - dragOffset.current.x);
      const y = Math.max(0, p.y - dragOffset.current.y);
      setTables(ts => ts.map(t => t.id === dragging ? { ...t, x, y } : t));
    }
  };

  const onMouseUp = async () => {
    if (panning) { setPanning(false); return; }
    if (resizing) {
      const t = tables.find(x => x.id === resizing);
      setResizing(null);
      if (t) await supabase.from("tables").update({ width: t.width, height: t.height }).eq("id", t.id);
      return;
    }
    if (!dragging) return;
    const t = tables.find(x => x.id === dragging);
    setDragging(null);
    if (t) await supabase.from("tables").update({ x: t.x, y: t.y }).eq("id", t.id);
  };

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom(z => Math.max(0.4, Math.min(2, +(z + delta).toFixed(2))));
  }, []);

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
      <PageHeader title="Floor Plan" subtitle="Drag, resize, zoom and define every table. Your AI uses this to seat guests."
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5 glass rounded-md px-2 h-10">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <select
                value={venue?.id || ""}
                onChange={e => setActiveVenue(e.target.value)}
                aria-label="Active venue"
                className="bg-transparent text-sm outline-none pr-2 max-w-[180px]"
              >
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
          onMouseDown={onCanvasMouseDown}
          onWheel={onWheel}
          className={cn(
            "relative card-cine min-h-[640px] overflow-hidden grid-bg select-none",
            mode === "pan" ? (panning ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
          )}
        >
          {/* Status pill */}
          <div className="absolute top-3 left-3 z-20 text-[11px] uppercase tracking-wider text-muted-foreground bg-background/70 backdrop-blur px-2.5 py-1 rounded-full border border-white/10">
            {tables.length} tables · {totalSeats} seats
          </div>

          {/* Floating canvas toolbar — Apple-style control puck */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1 p-1 rounded-xl
            bg-[hsl(28_18%_5%_/_0.85)] backdrop-blur-xl border border-white/[0.06]
            shadow-[0_12px_30px_-12px_hsl(0_0%_0%_/_0.7),0_1px_0_hsl(36_100%_90%_/_0.06)_inset]">
            <button
              onClick={() => setMode("select")}
              aria-label="Select & move tables (V)"
              title="Select (V)"
              className={cn(
                "h-8 w-8 grid place-items-center rounded-lg transition-colors",
                mode === "select" ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setMode("pan")}
              aria-label="Pan canvas (H)"
              title="Pan (H, or hold Shift)"
              className={cn(
                "h-8 w-8 grid place-items-center rounded-lg transition-colors",
                mode === "pan" ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
            >
              <Hand className="h-3.5 w-3.5" />
            </button>
            <div className="mx-1 h-5 w-px bg-white/10" />
            <button
              onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(2)))}
              aria-label="Zoom out"
              title="Zoom out (−)"
              className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <div className="text-[10.5px] tabular-nums w-9 text-center text-muted-foreground">{Math.round(zoom * 100)}%</div>
            <button
              onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))}
              aria-label="Zoom in"
              title="Zoom in (+)"
              className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              aria-label="Reset view"
              title="Reset view (0)"
              className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <div className="mx-1 h-5 w-px bg-white/10" />
            <button
              onClick={() => setLocked(l => !l)}
              aria-label={locked ? "Unlock layout" : "Lock layout"}
              title={locked ? "Layout locked" : "Lock layout"}
              className={cn(
                "h-8 w-8 grid place-items-center rounded-lg transition-colors",
                locked ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Empty state */}
          {tables.length === 0 && (
            <div className="absolute inset-0 grid place-items-center z-10">
              <EmptyState
                icon={Sparkles}
                title="No tables yet"
                description="Drop in a demo layout to see your AI seating engine in action — or start from scratch."
                action={
                  <>
                    <Button onClick={seedDemo} disabled={seedingDemo} className="bg-primary text-primary-foreground press-tactile">
                      {seedingDemo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />} Load demo tables
                    </Button>
                    <Button variant="outline" onClick={() => nav("/app/floor/new")}>New plan</Button>
                  </>
                }
              />
            </div>
          )}

          {/* Pan/zoom transformed inner canvas */}
          <div
            className="floor-canvas-inner absolute inset-0 origin-top-left"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              transition: panning || dragging || resizing ? "none" : "transform 0.18s ease",
            }}
          >
            {tables.map(t => {
              const isSelected = selected === t.id;
              return (
                <div
                  key={t.id}
                  onMouseDown={(e) => onTableMouseDown(e, t)}
                  style={{
                    left: t.x, top: t.y, width: t.width, height: t.height,
                    borderRadius: t.shape === "round" ? "50%" : "12px",
                  }}
                  className={cn(
                    "absolute select-none flex flex-col items-center justify-center text-center transition-shadow",
                    locked ? "cursor-not-allowed" : (mode === "select" ? "cursor-grab active:cursor-grabbing" : "cursor-default"),
                    isSelected
                      ? "bg-gradient-to-br from-primary/40 to-accent/30 border-2 border-primary shadow-[0_0_30px_hsl(var(--primary)/0.5)]"
                      : "bg-secondary/70 border border-white/10 hover:border-primary/40"
                  )}
                >
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="h-2.5 w-2.5" />{t.capacity}</div>

                  {/* Resize handle (only when selected, unlocked, select mode) */}
                  {isSelected && !locked && mode === "select" && (
                    <div
                      onMouseDown={(e) => onResizeMouseDown(e, t)}
                      role="button"
                      aria-label="Resize table"
                      title="Drag to resize"
                      className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-sm bg-primary border border-primary-foreground/40 cursor-nwse-resize shadow-[0_0_8px_hsl(var(--primary))]"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Help hint */}
          {tables.length > 0 && (
            <div className="absolute bottom-3 left-3 z-20 text-[10px] uppercase tracking-wider text-muted-foreground/70 bg-background/60 backdrop-blur px-2 py-1 rounded-md border border-white/[0.04]">
              V select · H pan · Shift + drag · ⌃ scroll to zoom
            </div>
          )}
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
            <div className="text-sm text-muted-foreground py-8 text-center">Click a table to edit it. Drag to reposition, corner handle to resize.</div>
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
            <Button onClick={suggestSeating} disabled={seatingBusy} className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground press-tactile">
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
