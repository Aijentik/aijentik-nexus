import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, CalendarDays, Users, Pencil, Copy, MoveRight, X, Crown, Repeat, MoreHorizontal, Sparkles, Search } from "lucide-react";
import { format, isToday, isThisWeek, isPast, isFuture } from "date-fns";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

import { BookingDialog, type BookingDialogMode } from "@/components/booking/BookingDialog";
import { RunSheetDialog } from "@/components/RunSheetDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

type Scope = "upcoming" | "today" | "week" | "past" | "all";
const SCOPE_LABEL: Record<Scope, string> = { upcoming: "Upcoming", today: "Today", week: "This week", past: "Past", all: "All" };
const STATUS_OPTS = ["all", "pending", "confirmed", "seated", "completed", "cancelled", "no_show"] as const;

export default function Diary() {
  const { venue } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [guests, setGuests] = useState<Record<string, any>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<BookingDialogMode>("create");
  const [dialogInitial, setDialogInitial] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [runSheetOpen, setRunSheetOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("upcoming");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTS)[number]>("all");


  const load = async () => {
    if (!venue) return;
    const [{ data: bks }, { data: gs }] = await Promise.all([
      supabase.from("bookings").select("*").eq("venue_id", venue.id).order("booking_time", { ascending: true }),
      supabase.from("guests").select("id,name,phone,vip,visit_count").eq("venue_id", venue.id),
    ]);
    setBookings(bks || []);
    const byPhone: Record<string, any> = {};
    (gs || []).forEach((g: any) => {
      if (g.phone) byPhone[g.phone.replace(/\s/g, "")] = g;
      if (g.name) byPhone["name:" + g.name.toLowerCase()] = g;
    });
    setGuests(byPhone);
  };
  useEffect(() => { load(); }, [venue]);

  // Realtime: stream new/changed bookings in
  useEffect(() => {
    if (!venue) return;
    const ch = supabase
      .channel(`venue:${venue.id}:diary`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `venue_id=eq.${venue.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue]);

  const openCreate = () => { setDialogMode("create"); setDialogInitial(null); setDialogOpen(true); };
  const openEdit = (b: any) => { setDialogMode("edit"); setDialogInitial(b); setDialogOpen(true); };
  const openMove = (b: any) => { setDialogMode("move"); setDialogInitial(b); setDialogOpen(true); };
  const openDuplicate = (b: any) => { setDialogMode("duplicate"); setDialogInitial(b); setDialogOpen(true); };

  const cancelBooking = async (b: any) => {
    // Optimistic
    setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "cancelled" } : x)));
    const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", b.id);
    if (error) {
      toast.error("Couldn't cancel", { description: error.message });
      load();
    } else {
      toast.success("Booking cancelled", { description: `${b.guest_name} · ${format(new Date(b.booking_time), "EEE d MMM HH:mm")}` });
      await supabase.from("brain_events").insert({
        venue_id: venue!.id,
        title: "Booking cancelled",
        reason: `${b.guest_name} · party of ${b.party_size}`,
        severity: "warn",
      });
    }
  };

  const remove = async (id: string) => {
    const b = bookings.find((x) => x.id === id);
    setBookings((prev) => prev.filter((x) => x.id !== id));
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) {
      toast.error("Couldn't delete", { description: error.message });
      load();
    } else {
      toast.success("Booking deleted");
      if (b) await supabase.from("brain_events").insert({
        venue_id: venue!.id,
        title: "Booking deleted",
        reason: `${b.guest_name} · ${format(new Date(b.booking_time), "EEE d MMM HH:mm")}`,
        severity: "warn",
      });
    }
    setDeleteId(null);
  };

  const setStatus = async (id: string, status: string) => {
    setBookings((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await supabase.from("bookings").update({ status: status as any }).eq("id", id);
    if (error) { toast.error("Couldn't update status"); load(); }
  };

  const guestFor = (b: any) => {
    const k = (b.guest_phone || "").replace(/\s/g, "");
    if (k && guests[k]) return guests[k];
    if (b.guest_name && guests["name:" + b.guest_name.toLowerCase()]) return guests["name:" + b.guest_name.toLowerCase()];
    return null;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings.filter((b) => {
      const t = new Date(b.booking_time);
      if (scope === "today" && !isToday(t)) return false;
      if (scope === "week" && !isThisWeek(t, { weekStartsOn: 1 })) return false;
      if (scope === "upcoming" && !isFuture(t) && !isToday(t)) return false;
      if (scope === "past" && !isPast(t)) return false;
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (q) {
        const hay = `${b.guest_name || ""} ${b.guest_phone || ""} ${b.notes || ""} ${b.source || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, scope, statusFilter, query]);

  const grouped = filtered.reduce((acc: any, b) => {
    const d = format(new Date(b.booking_time), "EEE d MMM");
    (acc[d] ||= []).push(b);
    return acc;
  }, {});

  const totalCovers = filtered.reduce((s, b) => s + (b.party_size || 0), 0);
  const hasActiveFilters = query.trim() !== "" || statusFilter !== "all" || scope !== "upcoming";

  return (
    <>
      <PageHeader
        title="Diary"
        subtitle="Your living booking diary. Updates the moment your AI confirms a table — voice, web or SMS."
        actions={

          <div className="flex items-center gap-2">
            <Button
              size="lg"
              variant="outline"
              onClick={() => setRunSheetOpen(true)}
              className="h-11 border-primary/30 hover:border-primary/60 hover:bg-primary/5"
            >
              <Sparkles className="h-4 w-4 mr-2 text-primary" /> Generate run sheet
            </Button>
            <Button
              size="lg"
              onClick={openCreate}
              className="bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40 shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.7)] px-5 h-11"
            >
              <Plus className="h-4 w-4 mr-2" /> New booking
            </Button>
          </div>
        }
      />

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
        {[
          { label: "Shown", value: filtered.length, icon: CalendarDays },
          { label: "Covers",   value: totalCovers,     icon: Users },
          { label: "Days",           value: Object.keys(grouped).length, icon: CalendarDays },
        ].map((s, i) => (
          <div key={i} className="card-cine p-3 sm:p-4 flex items-center gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-primary/12 border border-primary/25 grid place-items-center shrink-0">
              <s.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="num-cine text-xl sm:text-2xl font-semibold">{s.value}</div>
              <div className="label-micro truncate">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters / search */}
      <div className="card-cine p-3 mb-5 flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guest, phone, notes or source…"
            className="pl-9 h-10 bg-white/[0.02] border-white/[0.06] focus-visible:ring-primary/40"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.02] border border-white/[0.05] overflow-x-auto scrollbar-thin">
          {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 h-8 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors ${
                scope === s
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03] border border-transparent"
              }`}
            >
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="h-10 px-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer capitalize"
        >
          {STATUS_OPTS.map((s) => (
            <option key={s} value={s} className="bg-card capitalize">{s === "all" ? "All statuses" : s.replace("_", " ")}</option>
          ))}
        </select>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setQuery(""); setStatusFilter("all"); setScope("upcoming"); }}
            className="h-10 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        )}
      </div>

      <div className="space-y-7">
        {Object.entries(grouped).length === 0 && (
          <div className="card-cine p-12 sm:p-16 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <div className="text-lg font-medium mb-1">
              {hasActiveFilters ? "No bookings match these filters." : bookings.length === 0 ? "Your diary is a clean slate." : "Nothing in this view."}
            </div>
            <div className="text-sm text-muted-foreground max-w-md mx-auto">
              {hasActiveFilters
                ? "Try a different scope, status or clear your search."
                : "As your AI host takes calls and confirms bookings, they'll stream in here in real time."}
            </div>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => { setQuery(""); setStatusFilter("all"); setScope("all"); }}>
                Show everything
              </Button>
            )}
          </div>
        )}

        <AnimatePresence initial={false}>
          {Object.entries(grouped).map(([day, items]: any, gi) => (
            <motion.div
              key={day}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
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
                  const g = guestFor(b);
                  const isVip = g?.vip;
                  const isRepeat = !isVip && g?.visit_count > 1;
                  return (
                    <motion.div
                      key={b.id}
                      layout
                      className="p-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors group"
                    >
                      <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 grid place-items-center text-primary font-semibold text-[14px] tabular-nums">
                        {format(new Date(b.booking_time), "HH:mm")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          <span>{b.guest_name}</span>
                          {isVip && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary">
                              <Crown className="h-2.5 w-2.5" /> VIP
                            </span>
                          )}
                          {isRepeat && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-foreground/70">
                              <Repeat className="h-2.5 w-2.5" /> {g.visit_count}× guest
                            </span>
                          )}
                          <span className="text-muted-foreground font-normal text-sm">· party of {b.party_size}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {b.guest_phone || "—"} · via {b.source}
                          {b.notes && <span className="ml-2 text-foreground/70">· {b.notes}</span>}
                        </div>
                      </div>
                      <select
                        value={b.status}
                        onChange={(e) => setStatus(b.id, e.target.value)}
                        className="text-[11px] uppercase tracking-wider px-2.5 py-1.5 rounded-lg border font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
                        style={{ color: s.color, background: s.bg, borderColor: s.border }}
                      >
                        {["pending", "confirmed", "seated", "completed", "cancelled", "no_show"].map((opt) => (
                          <option key={opt} value={opt} className="bg-card text-foreground">{opt}</option>
                        ))}
                      </select>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Booking actions"
                            className="h-9 w-9 opacity-60 group-hover:opacity-100 transition-opacity hover:bg-white/[0.05]"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="glass-strong border-white/10 w-48">
                          <DropdownMenuItem onClick={() => openEdit(b)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openMove(b)}>
                            <MoveRight className="h-3.5 w-3.5 mr-2" /> Move
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openDuplicate(b)}>
                            <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                          </DropdownMenuItem>
                          {b.status !== "cancelled" && (
                            <DropdownMenuItem onClick={() => cancelBooking(b)} className="text-warn">
                              <X className="h-3.5 w-3.5 mr-2" /> Cancel
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteId(b.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <BookingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        initial={dialogInitial}
        onSaved={load}
      />

      <RunSheetDialog open={runSheetOpen} onOpenChange={setRunSheetOpen} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="glass-strong border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the booking from your diary. Prefer "Cancel" if you want to keep the record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && remove(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
