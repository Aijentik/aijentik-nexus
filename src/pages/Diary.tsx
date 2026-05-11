import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, CalendarDays, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";

const statusStyle = (s: string): { color: string; bg: string; border: string } => {
  switch (s) {
    case "confirmed": return { color: "hsl(var(--success))", bg: "hsl(var(--success) / 0.12)", border: "hsl(var(--success) / 0.3)" };
    case "seated":    return { color: "hsl(var(--primary))", bg: "hsl(var(--primary) / 0.12)", border: "hsl(var(--primary) / 0.3)" };
    case "completed": return { color: "hsl(32 14% 62%)",     bg: "hsl(28 14% 11% / 0.6)",     border: "hsl(32 14% 35% / 0.3)" };
    case "cancelled": return { color: "hsl(var(--destructive))", bg: "hsl(var(--destructive) / 0.12)", border: "hsl(var(--destructive) / 0.3)" };
    case "no_show":   return { color: "hsl(var(--warn))",    bg: "hsl(var(--warn) / 0.12)",   border: "hsl(var(--warn) / 0.3)" };
    default:          return { color: "hsl(var(--muted-foreground))", bg: "hsl(28 14% 11%)", border: "hsl(36 30% 96% / 0.06)" };
  }
};

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
      supabase.functions.invoke("send-sms", { body: { venue_id: venue.id, to: form.guest_phone, booking_id: booking?.id, body: `Hi ${form.guest_name}, your table for ${form.party_size} at ${venue.name} on ${format(when, "EEE d MMM 'at' HH:mm")} is confirmed. Reply STOP to opt out.` } }).then(() => toast.success("Confirmation sent")).catch(() => {});
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

  const totalCovers = bookings.reduce((s, b) => s + (b.party_size || 0), 0);

  return (
    <>
      <PageHeader
        title="Diary"
        subtitle="Your living booking diary. Updates the moment your AI confirms a table — voice, web or SMS."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40 shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.7)] px-5 h-11">
                <Plus className="h-4 w-4 mr-2" /> New booking
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-strong border-white/10">
              <DialogHeader><DialogTitle>New booking</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Guest name</Label><Input className="mt-1.5" value={form.guest_name} onChange={e => setForm({...form, guest_name: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Party size</Label><Input className="mt-1.5" type="number" min={1} value={form.party_size} onChange={e => setForm({...form, party_size: +e.target.value})} /></div>
                  <div><Label>Time</Label><Input className="mt-1.5" type="datetime-local" value={form.booking_time} onChange={e => setForm({...form, booking_time: e.target.value})} /></div>
                </div>
                <div><Label>Phone</Label><Input className="mt-1.5" value={form.guest_phone} onChange={e => setForm({...form, guest_phone: e.target.value})} /></div>
                <div><Label>Notes</Label><Input className="mt-1.5" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
                <Button onClick={create} className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground">Add booking</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Stat strip */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total bookings", value: bookings.length, icon: CalendarDays },
          { label: "Total covers",   value: totalCovers,     icon: Users },
          { label: "Days",           value: Object.keys(grouped).length, icon: CalendarDays },
        ].map((s, i) => (
          <div key={i} className="card-cine p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/12 border border-primary/25 grid place-items-center">
              <s.icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="num-cine text-2xl font-semibold">{s.value}</div>
              <div className="label-micro">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-7">
        {Object.entries(grouped).length === 0 && (
          <div className="card-cine p-16 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <div className="text-lg font-medium mb-1">Your diary is a clean slate.</div>
            <div className="text-sm text-muted-foreground max-w-md mx-auto">As your AI host takes calls and confirms bookings, they'll stream in here in real time.</div>
          </div>
        )}
        {Object.entries(grouped).map(([day, items]: any, gi) => (
          <motion.div
            key={day}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: gi * 0.04 }}
          >
            <div className="flex items-center gap-3 mb-3 px-1">
              <div className="label-micro">{day}</div>
              <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
              <div className="text-[11px] text-muted-foreground">
                {items.length} bookings · {items.reduce((s: number, b: any) => s + (b.party_size || 0), 0)} covers
              </div>
            </div>
            <div className="card-cine divide-y divide-white/[0.04] overflow-hidden">
              {items.map((b: any) => {
                const s = statusStyle(b.status);
                return (
                  <div key={b.id} className="p-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors group">
                    <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 grid place-items-center text-primary font-semibold text-[14px] tabular-nums">
                      {format(new Date(b.booking_time), "HH:mm")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{b.guest_name} <span className="text-muted-foreground font-normal">· party of {b.party_size}</span></div>
                      <div className="text-xs text-muted-foreground mt-0.5">{b.guest_phone || "—"} · via {b.source}</div>
                    </div>
                    <select
                      value={b.status}
                      onChange={e => setStatus(b.id, e.target.value)}
                      className="text-[11px] uppercase tracking-wider px-2.5 py-1.5 rounded-lg border font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
                      style={{ color: s.color, background: s.bg, borderColor: s.border }}
                    >
                      {["pending","confirmed","seated","completed","cancelled","no_show"].map(opt => <option key={opt} value={opt} className="bg-card text-foreground">{opt}</option>)}
                    </select>
                    <button
                      onClick={() => remove(b.id)}
                      className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>
    </>
  );
}
