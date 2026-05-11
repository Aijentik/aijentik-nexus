import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Globe, Loader2, Sparkles, ImageIcon, UtensilsCrossed, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

type MenuItem = {
  id: string; venue_id: string; section: string; name: string; description: string | null;
  price: string | null; image_url: string | null; image_source: string | null; tags: string[] | null; position: number;
};

export default function Knowledge() {
  const { venue } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [open, setOpen] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [healing, setHealing] = useState(false);
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"knowledge" | "menu">("knowledge");
  const [form, setForm] = useState({ category: "policy", title: "", content: "" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuForm, setMenuForm] = useState({ name: "", section: "mains", description: "", price: "" });

  const load = async () => {
    if (!venue) return;
    const [{ data: kb }, { data: mi }] = await Promise.all([
      supabase.from("knowledge_base").select("*").eq("venue_id", venue.id).order("category"),
      supabase.from("menu_items").select("*").eq("venue_id", venue.id).order("section").order("position"),
    ]);
    setItems(kb || []);
    setMenu((mi as MenuItem[]) || []);
  };
  useEffect(() => { load(); }, [venue]);

  const add = async () => {
    if (!venue || !form.title) return;
    const { error } = await supabase.from("knowledge_base").insert({ venue_id: venue.id, ...form });
    if (error) return toast.error(error.message);
    toast.success("Added");
    setOpen(false); setForm({ category: "policy", title: "", content: "" });
    load();
  };
  const del = async (id: string) => { await supabase.from("knowledge_base").delete().eq("id", id); load(); };

  const addMenuItem = async () => {
    if (!venue || !menuForm.name) return;
    const { error } = await supabase.from("menu_items").insert({
      venue_id: venue.id,
      name: menuForm.name,
      section: menuForm.section.toLowerCase(),
      description: menuForm.description || null,
      price: menuForm.price || null,
      position: menu.length,
    });
    if (error) return toast.error(error.message);
    toast.success("Item added");
    setMenuOpen(false);
    setMenuForm({ name: "", section: "mains", description: "", price: "" });
    load();
  };

  const delMenu = async (id: string) => { await supabase.from("menu_items").delete().eq("id", id); load(); };

  const generateImg = async (item: MenuItem) => {
    setGenerating((s) => new Set([...s, item.id]));
    try {
      const { data, error } = await supabase.functions.invoke("menu-item-image", { body: { item_id: item.id } });
      if (error) throw error;
      setMenu((m) => m.map((x) => x.id === item.id ? { ...x, image_url: data.image_url, image_source: "ai" } : x));
    } catch (e: any) { toast.error(e.message || "Image generation failed"); }
    finally { setGenerating((s) => { const n = new Set(s); n.delete(item.id); return n; }); }
  };

  const grouped = items.reduce((a: any, k) => { (a[k.category] ||= []).push(k); return a; }, {});
  const groupedMenu = menu.reduce((a: Record<string, MenuItem[]>, m) => { (a[m.section] ||= []).push(m); return a; }, {});
  const sectionOrder = ["starters", "mains", "sides", "desserts", "brunch", "specials", "kids", "drinks", "cocktails", "wine", "beer"];
  const orderedSections = Object.keys(groupedMenu).sort((a, b) => {
    const ai = sectionOrder.indexOf(a), bi = sectionOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const scrape = async () => {
    if (!venue || !scrapeUrl) return;
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-website", { body: { venue_id: venue.id, url: scrapeUrl } });
      if (error) throw error;
      toast.success(`Imported ${data.count} entries`);
      setScrapeUrl("");
      load();
    } catch (e: any) { toast.error(e.message || "Scrape failed"); }
    finally { setScraping(false); }
  };

  const heal = async () => {
    if (!venue) return;
    setHealing(true);
    try {
      const { data, error } = await supabase.functions.invoke("self-heal-faq", { body: { venue_id: venue.id } });
      if (error) throw error;
      toast.success(`Added ${data.added} self-healed FAQ${data.added === 1 ? "" : "s"}`);
      load();
    } catch (e: any) { toast.error(e.message || "Self-heal failed"); }
    finally { setHealing(false); }
  };

  return (
    <>
      <PageHeader title="Knowledge" subtitle="What your AI knows. Update anytime — agents pick it up immediately."
        actions={
          tab === "knowledge" ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> New entry</Button></DialogTrigger>
              <DialogContent className="glass-strong">
                <DialogHeader><DialogTitle>Add knowledge entry</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({...form, category: e.target.value})} /></div>
                  <div><Label>Title</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
                  <div><Label>Content</Label><Textarea rows={5} value={form.content} onChange={e => setForm({...form, content: e.target.value})} /></div>
                  <Button onClick={add} className="w-full bg-primary text-primary-foreground">Add</Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
              <DialogTrigger asChild><Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> New menu item</Button></DialogTrigger>
              <DialogContent className="glass-strong">
                <DialogHeader><DialogTitle>Add menu item</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Name</Label><Input value={menuForm.name} onChange={e => setMenuForm({...menuForm, name: e.target.value})} /></div>
                    <div><Label>Section</Label><Input value={menuForm.section} onChange={e => setMenuForm({...menuForm, section: e.target.value})} /></div>
                  </div>
                  <div><Label>Description</Label><Textarea rows={3} value={menuForm.description} onChange={e => setMenuForm({...menuForm, description: e.target.value})} /></div>
                  <div><Label>Price</Label><Input value={menuForm.price} onChange={e => setMenuForm({...menuForm, price: e.target.value})} placeholder="£14.50" /></div>
                  <Button onClick={addMenuItem} className="w-full bg-primary text-primary-foreground">Add item</Button>
                </div>
              </DialogContent>
            </Dialog>
          )
        } />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 glass rounded-xl p-1 w-fit">
        {[
          { k: "knowledge", label: "Knowledge", icon: Sparkles, count: items.length },
          { k: "menu", label: "Menu", icon: UtensilsCrossed, count: menu.length },
        ].map((t: any) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${tab === t.k ? "bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.4)]" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${tab === t.k ? "bg-primary-foreground/20" : "bg-muted"}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "knowledge" && (
        <>
          <div className="card-cine p-4 mb-6 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <Globe className="h-4 w-4 text-primary shrink-0 ml-1" />
            <Input value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)} placeholder="https://your-venue.com — auto-import menu, hours, FAQs" className="flex-1" />
            <Button onClick={scrape} disabled={scraping || !scrapeUrl} className="bg-primary text-primary-foreground">
              {scraping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />} Learn website
            </Button>
            <Button onClick={heal} disabled={healing} variant="outline">
              {healing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />} Self-heal from calls
            </Button>
          </div>

          <div className="space-y-6">
            {Object.entries(grouped).map(([cat, ks]: any) => (
              <div key={cat}>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{cat}</div>
                <div className="card-cine divide-y divide-white/5">
                  {ks.map((k: any) => (
                    <div key={k.id} className="p-4 flex items-start gap-3 hover:bg-secondary/30">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{k.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">{k.content}</div>
                      </div>
                      <button onClick={() => del(k.id)} className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {items.length === 0 && <div className="card-cine p-12 text-center text-muted-foreground">No knowledge yet.</div>}
          </div>
        </>
      )}

      {tab === "menu" && (
        <div className="space-y-8">
          {menu.length === 0 && (
            <div className="card-cine p-12 text-center">
              <UtensilsCrossed className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <div className="font-medium mb-1">No menu items yet</div>
              <div className="text-sm text-muted-foreground">Items appear here automatically when a venue is scanned, or add them manually.</div>
            </div>
          )}

          {orderedSections.map((section) => (
            <div key={section}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{section}</div>
                <div className="text-[10px] text-muted-foreground">{groupedMenu[section].length} items</div>
              </div>
              <div className="space-y-2">
                {groupedMenu[section].map((m) => (
                  <div key={m.id} className="glass hover:bg-secondary/30 rounded-2xl p-3 flex items-center gap-4 transition-colors group">
                    {/* Image */}
                    <div className="h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-primary/10 to-accent/5 border border-white/5 grid place-items-center relative">
                      {m.image_url ? (
                        <img src={m.image_url} alt={m.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground/60" />
                      )}
                      {m.image_source === "ai" && (
                        <span className="absolute bottom-1 right-1 text-[8px] px-1 py-0.5 rounded bg-black/60 backdrop-blur text-primary border border-primary/30">AI</span>
                      )}
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3">
                        <div className="font-medium truncate">{m.name}</div>
                        {m.price && <div className="text-sm text-primary font-medium ml-auto shrink-0">{m.price}</div>}
                      </div>
                      {m.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.description}</div>}
                      {m.tags && m.tags.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {m.tags.slice(0, 4).map((t, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!m.image_url && (
                        <Button size="sm" variant="outline" disabled={generating.has(m.id)} onClick={() => generateImg(m)} className="border-primary/30 hover:bg-primary/10 text-xs h-8">
                          {generating.has(m.id) ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                          {generating.has(m.id) ? "Plating…" : "Generate photo"}
                        </Button>
                      )}
                      {m.image_url && m.image_source === "ai" && (
                        <Button size="sm" variant="ghost" disabled={generating.has(m.id)} onClick={() => generateImg(m)} className="text-xs h-8">
                          {generating.has(m.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                        </Button>
                      )}
                      <button onClick={() => delMenu(m.id)} className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
