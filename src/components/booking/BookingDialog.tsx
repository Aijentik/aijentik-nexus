import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, isSameDay, set } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarIcon,
  Users,
  Phone,
  StickyNote,
  Crown,
  Repeat,
  Check,
  Loader2,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

const schema = z.object({
  guest_name: z.string().trim().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
  party_size: z.coerce.number().int().min(1, "Min 1 guest").max(40, "Max 40 guests"),
  date: z.date({ error: "Pick a date" }),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "Use HH:MM"),
  guest_phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[+0-9 ()-]{6,20}$/.test(v), "Invalid phone number"),
  guest_email: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Invalid email"),
  notes: z.string().trim().max(280, "Keep notes under 280 chars").optional(),
});

export type BookingFormValues = z.infer<typeof schema>;

export type BookingDialogMode = "create" | "edit" | "duplicate" | "move";

export interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: BookingDialogMode;
  initial?: any; // existing booking row for edit/duplicate/move
  onSaved?: () => void;
}

// Premium time-slot grid — lunch + dinner blocks
const LUNCH_SLOTS = ["12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30"];
const DINNER_SLOTS = [
  "17:30", "17:45", "18:00", "18:15", "18:30", "18:45",
  "19:00", "19:15", "19:30", "19:45", "20:00", "20:15",
  "20:30", "20:45", "21:00", "21:15", "21:30", "21:45", "22:00",
];

export function BookingDialog({ open, onOpenChange, mode = "create", initial, onSaved }: BookingDialogProps) {
  const { venue } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [matchedGuest, setMatchedGuest] = useState<any | null>(null);
  const [seatLoading, setSeatLoading] = useState(false);
  const [seatSuggestion, setSeatSuggestion] = useState<{ table: any; reason: string } | null>(null);
  const [pickedTableId, setPickedTableId] = useState<string | null>(initial?.table_id ?? null);

  const defaultDate = useMemo(() => {
    if (initial?.booking_time) {
      const d = new Date(initial.booking_time);
      if (mode === "duplicate") d.setDate(d.getDate() + 7);
      return d;
    }
    return new Date();
  }, [initial, mode]);

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      guest_name: initial?.guest_name ?? "",
      party_size: initial?.party_size ?? 2,
      date: defaultDate,
      time: format(defaultDate, "HH:mm"),
      guest_phone: initial?.guest_phone ?? "",
      guest_email: initial?.guest_email ?? "",
      notes: initial?.notes ?? "",
    },
  });

  // Reset on open or when switching record
  useEffect(() => {
    if (open) {
      form.reset({
        guest_name: initial?.guest_name ?? "",
        party_size: initial?.party_size ?? 2,
        date: defaultDate,
        time: format(defaultDate, "HH:mm"),
        guest_phone: initial?.guest_phone ?? "",
        guest_email: initial?.guest_email ?? "",
        notes: initial?.notes ?? "",
      });
      setSuccess(false);
      setMatchedGuest(null);
      setSeatSuggestion(null);
      setPickedTableId(initial?.table_id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  // Guest recognition — phone first, then name
  const phone = form.watch("guest_phone");
  const name = form.watch("guest_name");
  useEffect(() => {
    if (!venue) return;
    const phoneClean = (phone || "").replace(/\s/g, "");
    if (phoneClean.length < 6 && (name || "").length < 3) {
      setMatchedGuest(null);
      return;
    }
    const t = window.setTimeout(async () => {
      let q = supabase.from("guests").select("id,name,phone,vip,visit_count,last_visit,notes").eq("venue_id", venue.id).limit(1);
      if (phoneClean.length >= 6) q = q.ilike("phone", `%${phoneClean.slice(-6)}%`);
      else if ((name || "").length >= 3) q = q.ilike("name", `%${name}%`);
      const { data } = await q;
      setMatchedGuest(data?.[0] || null);
    }, 300);
    return () => window.clearTimeout(t);
  }, [phone, name, venue]);

  const date = form.watch("date");
  const time = form.watch("time");
  const partySize = form.watch("party_size");

  // Conflict detection — table double-book + venue capacity stress
  const [conflict, setConflict] = useState<{
    table: { guest: string; time: string } | null;
    capacity: { covers: number; cap: number } | null;
  }>({ table: null, capacity: null });
  const [overrideConflict, setOverrideConflict] = useState(false);

  useEffect(() => {
    if (!venue || !date || !time) return;
    const [h, m] = time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const when = set(date, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
    const winMs = 90 * 60 * 1000;
    const fromIso = new Date(when.getTime() - winMs).toISOString();
    const toIso = new Date(when.getTime() + winMs).toISOString();
    const t = window.setTimeout(async () => {
      let q = supabase
        .from("bookings")
        .select("id,guest_name,booking_time,party_size,table_id,status")
        .eq("venue_id", venue.id)
        .gte("booking_time", fromIso)
        .lte("booking_time", toIso)
        .not("status", "in", "(cancelled,no_show)");
      if (initial?.id) q = q.neq("id", initial.id);
      const { data } = await q;
      const rows = data || [];

      let tableConflict: { guest: string; time: string } | null = null;
      if (pickedTableId) {
        const clash = rows.find((r: any) => r.table_id === pickedTableId);
        if (clash) {
          tableConflict = {
            guest: clash.guest_name,
            time: format(new Date(clash.booking_time), "HH:mm"),
          };
        }
      }

      let capacityWarn: { covers: number; cap: number } | null = null;
      const cap = (venue as any)?.capacity ?? 0;
      if (cap > 0) {
        const hourMs = 30 * 60 * 1000;
        const fromH = when.getTime() - hourMs;
        const toH = when.getTime() + hourMs;
        const covers = rows
          .filter((r: any) => {
            const tt = new Date(r.booking_time).getTime();
            return tt >= fromH && tt <= toH;
          })
          .reduce((s: number, r: any) => s + (r.party_size || 0), 0);
        const projected = covers + (partySize || 0);
        if (projected > cap) capacityWarn = { covers: projected, cap };
      }
      setConflict({ table: tableConflict, capacity: capacityWarn });
      if (!tableConflict) setOverrideConflict(false);
    }, 250);
    return () => window.clearTimeout(t);
  }, [venue, date, time, partySize, pickedTableId, initial?.id]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!venue) return;
    if (conflict.table && !overrideConflict) {
      toast.error("Table conflict", { description: `Already booked for ${conflict.table.guest} at ${conflict.table.time}. Tick the override to save anyway.` });
      return;
    }
    setSubmitting(true);
    try {
      const [h, m] = values.time.split(":").map(Number);
      const when = set(values.date, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });

      const payload: any = {
        venue_id: venue.id,
        guest_name: values.guest_name,
        party_size: values.party_size,
        booking_time: when.toISOString(),
        guest_phone: values.guest_phone || null,
        guest_email: values.guest_email || null,
        notes: values.notes || null,
        table_id: pickedTableId || null,
      };

      if (mode === "create" || mode === "duplicate") {
        payload.source = mode === "duplicate" ? "duplicate" : "manual";
        payload.status = "confirmed";
        if (matchedGuest?.id) payload.guest_id = matchedGuest.id;
        const { error } = await supabase.from("bookings").insert(payload);
        if (error) throw error;
        await supabase.from("brain_events").insert({
          venue_id: venue.id,
          title: mode === "duplicate" ? "Booking duplicated" : "Booking added manually",
          reason: `${values.guest_name} · party of ${values.party_size} · ${format(when, "EEE d MMM HH:mm")}`,
          severity: "info",
        });
      } else if (mode === "edit" || mode === "move") {
        const { error } = await supabase.from("bookings").update(payload).eq("id", initial.id);
        if (error) throw error;
        await supabase.from("brain_events").insert({
          venue_id: venue.id,
          title: mode === "move" ? "Booking moved" : "Booking updated",
          reason: `${values.guest_name} → ${format(when, "EEE d MMM HH:mm")}`,
          severity: "info",
        });
      }

      setSuccess(true);
      toast.success(
        mode === "edit" ? "Booking updated" : mode === "move" ? "Booking moved" : mode === "duplicate" ? "Booking duplicated" : "Booking added",
        {
          description: `${values.guest_name} · party of ${values.party_size} · ${format(when, "EEE d MMM HH:mm")}`,
        },
      );
      onSaved?.();
      window.setTimeout(() => onOpenChange(false), 700);
    } catch (e: any) {
      toast.error("Couldn't save booking", { description: e?.message ?? String(e) });
    } finally {
      setSubmitting(false);
    }
  });

  const title =
    mode === "edit" ? "Edit booking"
      : mode === "duplicate" ? "Duplicate booking"
      : mode === "move" ? "Move booking"
      : "New booking";

  const errors = form.formState.errors;

  const fieldRing = (hasError: boolean, isFocused = false) =>
    cn(
      "mt-1.5 transition-all duration-200",
      hasError
        ? "border-destructive/50 focus-visible:ring-destructive/40 shadow-[0_0_0_3px_hsl(var(--destructive)/0.08)]"
        : "focus-visible:ring-primary/40",
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-white/10 max-w-[560px] p-0 overflow-hidden">
        {/* Cinematic top edge */}
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-24 pointer-events-none"
            style={{
              background:
                "radial-gradient(60% 100% at 50% 0%, hsl(var(--primary)/0.18), transparent 70%)",
            }}
          />
          <DialogHeader className="relative px-6 pt-6 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="label-micro">{mode.toUpperCase()}</span>
            </div>
            <DialogTitle className="text-xl font-semibold tracking-tight">{title}</DialogTitle>
          </DialogHeader>
        </div>

        <form onSubmit={onSubmit} className="px-6 pb-6 space-y-5">
          {/* Guest */}
          <div>
            <Label htmlFor="guest_name" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              <UserIcon className="h-3 w-3" /> Guest name
            </Label>
            <Input
              id="guest_name"
              autoComplete="name"
              placeholder="e.g. Sarah Mitchell"
              {...form.register("guest_name")}
              aria-invalid={!!errors.guest_name}
              className={fieldRing(!!errors.guest_name)}
            />
            <FieldError msg={errors.guest_name?.message} />

            <AnimatePresence>
              {matchedGuest && (
                <motion.div
                  initial={{ opacity: 0, y: -4, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -4, height: 0 }}
                  className="mt-2"
                >
                  <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2">
                    {matchedGuest.vip ? (
                      <Crown className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Repeat className="h-3.5 w-3.5 text-primary" />
                    )}
                    <div className="text-[12px] flex-1 min-w-0 truncate">
                      Recognised guest · <span className="font-medium">{matchedGuest.name}</span>
                      {matchedGuest.visit_count > 0 && (
                        <span className="text-muted-foreground"> · {matchedGuest.visit_count} visits</span>
                      )}
                    </div>
                    {matchedGuest.vip && (
                      <Badge variant="outline" className="border-primary/40 text-primary text-[10px] uppercase tracking-wider">VIP</Badge>
                    )}
                  </div>
                  {matchedGuest.notes && (
                    <div className="mt-1.5 text-[11px] text-muted-foreground pl-1">Note: {matchedGuest.notes}</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Party size + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="party_size" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3 w-3" /> Party size
              </Label>
              <div className="mt-1.5 flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => form.setValue("party_size", Math.max(1, (partySize || 1) - 1), { shouldValidate: true })}
                >
                  −
                </Button>
                <Input
                  id="party_size"
                  type="number"
                  min={1}
                  max={40}
                  {...form.register("party_size")}
                  aria-invalid={!!errors.party_size}
                  className={cn("text-center tabular-nums", fieldRing(!!errors.party_size))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => form.setValue("party_size", Math.min(40, (partySize || 1) + 1), { shouldValidate: true })}
                >
                  +
                </Button>
              </div>
              <FieldError msg={errors.party_size?.message as string} />
            </div>

            <div>
              <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
                <CalendarIcon className="h-3 w-3" /> Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "mt-1.5 w-full justify-start text-left font-normal h-10",
                      !date && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 mr-2 text-primary" />
                    {date ? format(date, "EEE d MMM") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 glass-strong border-white/10" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && form.setValue("date", d, { shouldValidate: true })}
                    initialFocus
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0) - 86400_000 * 30)}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Time slot grid */}
          <div>
            <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Time {date && isSameDay(date, new Date()) && <span className="text-primary/80 normal-case tracking-normal ml-1">· today</span>}
            </Label>
            <div className="mt-1.5 space-y-2">
              <SlotRow label="Lunch" slots={LUNCH_SLOTS} value={time} onChange={(v) => form.setValue("time", v, { shouldValidate: true })} />
              <SlotRow label="Dinner" slots={DINNER_SLOTS} value={time} onChange={(v) => form.setValue("time", v, { shouldValidate: true })} />
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Custom</span>
                <Input
                  type="time"
                  {...form.register("time")}
                  className={cn("h-8 w-[120px] text-sm", fieldRing(!!errors.time))}
                />
              </div>
            </div>
            <FieldError msg={errors.time?.message} />
          </div>

          {/* AI Seater */}
          <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.05] to-transparent p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex-1">AI Floor-Plan Seater</div>
              <Button
                type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                disabled={seatLoading || !partySize}
                onClick={async () => {
                  if (!venue) return;
                  setSeatLoading(true);
                  try {
                    const [h, m] = (time || "19:00").split(":").map(Number);
                    const when = set(date || new Date(), { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-seating`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session?.access_token}`,
                        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                      },
                      body: JSON.stringify({
                        venue_id: venue.id, party_size: partySize,
                        booking_time: when.toISOString(),
                        vip: !!matchedGuest?.vip,
                        notes: form.getValues("notes") || "",
                      }),
                    });
                    const j = await res.json();
                    if (j.suggestion) {
                      setSeatSuggestion({ table: j.suggestion, reason: j.reason });
                    } else {
                      toast.warning("No free table fits", { description: j.reason });
                      setSeatSuggestion(null);
                    }
                  } catch (e: any) {
                    toast.error("Seater failed", { description: e.message });
                  } finally {
                    setSeatLoading(false);
                  }
                }}
              >
                {seatLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Suggest table
              </Button>
            </div>
            {seatSuggestion ? (
              <div className="flex items-center gap-2 text-[12px]">
                <Badge className="bg-primary/15 text-primary border-primary/30">{seatSuggestion.table.label} · seats {seatSuggestion.table.capacity}</Badge>
                <div className="flex-1 text-muted-foreground italic truncate">"{seatSuggestion.reason}"</div>
                <Button
                  type="button" size="sm" variant={pickedTableId === seatSuggestion.table.id ? "default" : "outline"}
                  className="h-7 text-[11px]"
                  onClick={() => setPickedTableId(seatSuggestion.table.id)}
                >
                  {pickedTableId === seatSuggestion.table.id ? <><Check className="h-3 w-3 mr-1" /> Assigned</> : "Assign"}
                </Button>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                {pickedTableId ? "Table assigned manually." : "Let the AI pick the best free table for this party, time, and guest profile."}
              </div>
            )}
          </div>

          {/* Phone + email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="guest_phone" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3 w-3" /> Phone
              </Label>
              <Input
                id="guest_phone"
                placeholder="+44 7700 …"
                {...form.register("guest_phone")}
                aria-invalid={!!errors.guest_phone}
                className={fieldRing(!!errors.guest_phone)}
              />
              <FieldError msg={errors.guest_phone?.message as string} />
            </div>
            <div>
              <Label htmlFor="guest_email" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Email
              </Label>
              <Input
                id="guest_email"
                type="email"
                placeholder="guest@email.com"
                {...form.register("guest_email")}
                aria-invalid={!!errors.guest_email}
                className={fieldRing(!!errors.guest_email)}
              />
              <FieldError msg={errors.guest_email?.message as string} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              <StickyNote className="h-3 w-3" /> Notes
            </Label>
            <Input
              id="notes"
              placeholder="Allergies · seating preference · occasion…"
              {...form.register("notes")}
              aria-invalid={!!errors.notes}
              className={fieldRing(!!errors.notes)}
            />
            <FieldError msg={errors.notes?.message} />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={submitting || success}
            className={cn(
              "w-full h-11 font-medium border border-primary/40 transition-all duration-300",
              success
                ? "bg-[hsl(var(--success))] text-background"
                : "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.7)] hover:shadow-[0_16px_50px_-12px_hsl(var(--primary)/0.85)]",
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
              </>
            ) : success ? (
              <>
                <Check className="h-4 w-4 mr-2" /> Saved
              </>
            ) : mode === "edit" ? (
              "Save changes"
            ) : mode === "move" ? (
              "Move booking"
            ) : mode === "duplicate" ? (
              "Create duplicate"
            ) : (
              "Add booking"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ msg }: { msg?: string }) {
  return (
    <AnimatePresence>
      {msg && (
        <motion.div
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          className="text-[11px] text-destructive mt-1 pl-0.5"
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SlotRow({
  label,
  slots,
  value,
  onChange,
}: {
  label: string;
  slots: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {slots.map((s) => {
          const active = s === value;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[12px] tabular-nums border transition-all duration-150",
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]"
                  : "bg-white/[0.02] border-white/[0.06] text-foreground/80 hover:border-primary/30 hover:text-foreground",
              )}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}
