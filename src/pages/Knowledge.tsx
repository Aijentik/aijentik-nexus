import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function Knowledge() {
  const { venue } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
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
