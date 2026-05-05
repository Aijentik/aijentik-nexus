import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format } from "date-fns";
import { toast } from "sonner";

export default function Diary() {
  const { venue } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ guest_name: "", party_size: 2, booking_time: "", guest_phone: "", notes: "" });

  const load = async () => {
    if (!venue) return;
    const { data } = await supabase.from("bookings").select("*").eq("venue_id", venue.id).order("booking_time", { ascending: true });
    setBookings(data || []);
  };
  useEffect(() => { load(); }, [venue]);

  const create = async () => {
    if (!venue || !form.guest_name || !form.booking_time) return;
    const when = new Date(form.booking_time);
    const { data: booking, error } = await supabase.from("bookings").insert({ venue_id: venue.id, ...form, booking_time: when.toISOString(), source: "manual", status: "confirmed" }).select().single();
    if (error) return toast.error(error.message);
    await supabase.from("brain_events").insert({ venue_id: venue.id, title: "Booking added manually", reason: `${form.guest_name} · party of ${form.party_size}`, severity: "info" });
    if (form.guest_phone) {
      supabase.functions.invoke("send-sms", { body: { venue_id: venue.id, to: form.guest_phone, booking_id: booking?.id, body: `Hi ${form.guest_name}, your table for ${form.party_size} at ${venue.name} on ${format(when, "EEE d MMM 'at' HH:mm")} is confirmed. Reply STOP to opt out.` } }).then(() => toast.success("Confirmation SMS sent")).catch(() => {});
    }
    toast.success("Booking added");
    setOpen(false); setForm({ guest_name: "", party_size: 2, booking_time: "", guest_phone: "", notes: "" });
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("bookings").delete().eq("id", id);
    load();
  };

  const setStatus = async (id: string, status: string) => {
    await supabase.from("bookings").update({ status: status as any }).eq("id", id);
    load();
  };

  const grouped = bookings.reduce((acc: any, b) => {
    const d = format(new Date(b.booking_time), "EEE d MMM");
    (acc[d] ||= []).push(b);
    return acc;
  }, {});

  return (
    <>
      <PageHeader title="Diary" subtitle="Your live booking diary. Updates the moment your AI confirms a table."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> New booking</Button></DialogTrigger>
            <DialogContent className="glass-strong">
              <DialogHeader><DialogTitle>New booking</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Guest name</Label><Input value={form.guest_name} onChange={e => setForm({...form, guest_name: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Party size</Label><Input type="number" min={1} value={form.party_size} onChange={e => setForm({...form, party_size: +e.target.value})} /></div>
                  <div><Label>Time</Label><Input type="datetime-local" value={form.booking_time} onChange={e => setForm({...form, booking_time: e.target.value})} /></div>
                </div>
                <div><Label>Phone</Label><Input value={form.guest_phone} onChange={e => setForm({...form, guest_phone: e.target.value})} /></div>
                <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
                <Button onClick={create} className="w-full bg-primary text-primary-foreground">Add booking</Button>
              </div>
            </DialogContent>
          </Dialog>
        } />

      <div className="space-y-6">
        {Object.entries(grouped).length === 0 && <div className="glass rounded-2xl p-12 text-center text-muted-foreground">No bookings yet.</div>}
        {Object.entries(grouped).map(([day, items]: any) => (
          <div key={day}>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">{day}</div>
            <div className="glass rounded-2xl divide-y divide-white/5">
              {items.map((b: any) => (
                <div key={b.id} className="p-4 flex items-center gap-4 hover:bg-secondary/30">
                  <div className="h-12 w-12 rounded-xl bg-primary/15 grid place-items-center text-primary font-semibold text-sm">{format(new Date(b.booking_time), "HH:mm")}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{b.guest_name} · party of {b.party_size}</div>
                    <div className="text-xs text-muted-foreground">{b.guest_phone || "—"} · via {b.source}</div>
                  </div>
                  <select value={b.status} onChange={e => setStatus(b.id, e.target.value)}
                    className="bg-secondary/60 border border-white/5 rounded-md px-2 py-1 text-xs">
                    {["pending","confirmed","seated","completed","cancelled","no_show"].map(s => <option key={s}>{s}</option>)}
                  </select>
                  <button onClick={() => remove(b.id)} className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
