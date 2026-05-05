import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Globe, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function Knowledge() {
  const { venue } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [healing, setHealing] = useState(false);
  const [form, setForm] = useState({ category: "policy", title: "", content: "" });

  const load = async () => {
    if (!venue) return;
    const { data } = await supabase.from("knowledge_base").select("*").eq("venue_id", venue.id).order("category");
    setItems(data || []);
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

  const grouped = items.reduce((a: any, k) => { (a[k.category] ||= []).push(k); return a; }, {});

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
        } />

      <div className="glass rounded-2xl p-4 mb-6 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
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
            <div className="glass rounded-2xl divide-y divide-white/5">
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
        {items.length === 0 && <div className="glass rounded-2xl p-12 text-center text-muted-foreground">No knowledge yet.</div>}
      </div>
    </>
  );
}
