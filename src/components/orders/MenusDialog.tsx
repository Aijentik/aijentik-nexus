import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Globe, ClipboardPaste, BookOpen } from "lucide-react";
import { toast } from "sonner";

export type Menu = {
  id: string;
  venue_id: string;
  name: string;
  is_live: boolean;
  source_url: string | null;
  raw_text: string | null;
  created_at: string;
};

export function MenusDialog({
  open, onOpenChange, venueId,
}: { open: boolean; onOpenChange: (o: boolean) => void; venueId?: string }) {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"none" | "url" | "paste">("none");
  const [importing, setImporting] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");

  const load = async () => {
    if (!venueId) return;
    setLoading(true);
    const { data } = await supabase
      .from("menus").select("*").eq("venue_id", venueId)
      .order("created_at", { ascending: false });
    const list = (data || []) as Menu[];
    setMenus(list);
    if (list.length) {
      const { data: items } = await supabase
        .from("menu_items").select("menu_id").eq("venue_id", venueId)
        .in("menu_id", list.map(m => m.id));
      const c: Record<string, number> = {};
      (items || []).forEach((i: any) => { if (i.menu_id) c[i.menu_id] = (c[i.menu_id] || 0) + 1; });
      setCounts(c);
    } else {
      setCounts({});
    }
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open, venueId]);

  const toggleLive = async (m: Menu) => {
    setMenus(prev => prev.map(x => x.id === m.id ? { ...x, is_live: !x.is_live } : x));
    const { error } = await supabase.from("menus").update({ is_live: !m.is_live }).eq("id", m.id);
    if (error) { toast.error(error.message); load(); }
  };

  const remove = async (m: Menu) => {
    if (!confirm(`Delete menu "${m.name}" and all its items?`)) return;
    setMenus(prev => prev.filter(x => x.id !== m.id));
    const { error } = await supabase.from("menus").delete().eq("id", m.id);
    if (error) { toast.error(error.message); load(); }
    else toast.success("Menu deleted");
  };

  const rename = async (m: Menu, newName: string) => {
    if (!newName.trim() || newName === m.name) return;
    const { error } = await supabase.from("menus").update({ name: newName.trim() }).eq("id", m.id);
    if (error) toast.error(error.message);
    else { toast.success("Renamed"); load(); }
  };

  const doImport = async () => {
    if (!venueId) return;
    if (mode === "url" && !url.trim()) return toast.error("URL required");
    if (mode === "paste" && text.trim().length < 20) return toast.error("Paste a longer menu");
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("menu-import", {
        body: {
          venue_id: venueId,
          name: name.trim() || undefined,
          url: mode === "url" ? url.trim() : undefined,
          text: mode === "paste" ? text : undefined,
          is_live: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Imported ${data.count} items`);
      setMode("none"); setName(""); setUrl(""); setText("");
      load();
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Menus
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.06] divide-y divide-white/[0.04] max-h-[260px] overflow-y-auto">
            {loading && menus.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
              </div>
            ) : menus.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No menus yet. Add one below — paste it in or import from your website.
              </div>
            ) : (
              menus.map(m => (
                <div key={m.id} className="p-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <Input
                      defaultValue={m.name}
                      onBlur={e => rename(m, e.target.value)}
                      className="h-8 text-[13px] font-medium border-transparent bg-transparent hover:bg-white/[0.03] focus:bg-white/[0.04] px-2"
                    />
                    <div className="text-[11px] text-muted-foreground mt-0.5 px-2 truncate">
                      {counts[m.id] || 0} items
                      {m.source_url ? <> · <a href={m.source_url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">{new URL(m.source_url).hostname}</a></> : null}
                      {!m.source_url && m.raw_text ? " · pasted" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] uppercase tracking-wider ${m.is_live ? "text-[hsl(142_70%_55%)]" : "text-muted-foreground"}`}>
                      {m.is_live ? "Live" : "Off"}
                    </span>
                    <Switch checked={m.is_live} onCheckedChange={() => toggleLive(m)} />
                    <Button size="icon" variant="ghost" onClick={() => remove(m)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {mode === "none" ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setMode("url")} className="h-auto py-4 flex-col gap-1">
                <Globe className="h-5 w-5" />
                <span className="text-[13px]">From website URL</span>
                <span className="text-[10.5px] text-muted-foreground">We'll scrape & parse</span>
              </Button>
              <Button variant="outline" onClick={() => setMode("paste")} className="h-auto py-4 flex-col gap-1">
                <ClipboardPaste className="h-5 w-5" />
                <span className="text-[13px]">Paste menu text</span>
                <span className="text-[10.5px] text-muted-foreground">From PDF, doc, anywhere</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Menu name (optional)</Label>
                <Input className="mt-1" placeholder={mode === "url" ? "e.g. Dinner" : "e.g. Lunch"} value={name} onChange={e => setName(e.target.value)} />
              </div>
              {mode === "url" ? (
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Menu URL</Label>
                  <Input className="mt-1" placeholder="https://yourvenue.com/menu" value={url} onChange={e => setUrl(e.target.value)} />
                </div>
              ) : (
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Paste menu</Label>
                  <Textarea className="mt-1" rows={8} placeholder={"Starters\n  Burrata — 14\n  Beef tartare — 18\nMains\n  Ribeye — 38…"} value={text} onChange={e => setText(e.target.value)} />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setMode("none")} disabled={importing}>Cancel</Button>
                <Button onClick={doImport} disabled={importing}
                  className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
                  {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Import menu
                </Button>
              </div>
            </div>
          )}

          <div className="text-[11px] text-muted-foreground">
            Only items from <span className="text-foreground font-medium">live</span> menus are visible to your AI agents on voice, WhatsApp, and email.
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
