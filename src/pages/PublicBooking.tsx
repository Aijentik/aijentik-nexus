import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { format, addDays, isSameDay, startOfDay } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, Users, Check, ChevronRight, ChevronLeft, Loader2, MapPin, Phone, Globe, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-booking`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Slot = { time: string; available: boolean; remaining: number; pressure: number };
type Step = "date" | "party" | "time" | "details" | "done";

async function call(action: string, payload: Record<string, unknown>) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

export default function PublicBooking() {
  const { venueId = "" } = useParams();
  const [sp] = useSearchParams();

  const [venue, setVenue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("date");

  const [date, setDate] = useState<Date>(() => {
    const q = sp.get("date");
    if (q) {
      const d = new Date(q);
      if (!isNaN(d.getTime())) return startOfDay(d);
    }
    return startOfDay(new Date());
  });
  const [party, setParty] = useState(Number(sp.get("party") || 2));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const { venue } = await call("get_venue", { venue_id: venueId });
        setVenue(venue);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [venueId]);

  useEffect(() => {
    if (step !== "time") return;
    setSlotsLoading(true);
    setSlot(null);
    call("day_availability", {
      venue_id: venueId,
      date: format(date, "yyyy-MM-dd"),
      party_size: party,
    })
      .then((d) => setSlots(d.slots || []))
      .catch((e) => setError(e.message))
      .finally(() => setSlotsLoading(false));
  }, [step, date, party, venueId]);

  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(startOfDay(new Date()), i)), []);

  const submit = async () => {
    if (!slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const [h, m] = slot.split(":").map(Number);
      const target = new Date(date);
      target.setHours(h, m, 0, 0);
      const { booking } = await call("create_booking", {
        venue_id: venueId,
        guest_name: name,
        guest_phone: phone,
        guest_email: email,
        party_size: party,
        booking_time: target.toISOString(),
        notes,
      });
      setBooking(booking);
      setStep("done");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-center p-6">
        <div>
          <div className="text-2xl font-semibold mb-2">Venue not found</div>
          <div className="text-muted-foreground text-sm">This booking link is no longer valid.</div>
        </div>
      </div>
    );
  }

  const stepIdx = ["date", "party", "time", "details", "done"].indexOf(step);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              venue.cover_url
                ? `linear-gradient(180deg, hsl(28 18% 4% / 0.4), hsl(28 18% 4%)), url(${venue.cover_url}) center/cover`
                : "var(--gradient-hero)",
          }}
        />
        <div className="relative max-w-2xl mx-auto px-6 pt-12 pb-8">
          <div className="flex items-center gap-3 mb-6">
            {venue.logo_url ? (
              <img src={venue.logo_url} alt={venue.name} className="h-12 w-12 rounded-xl object-cover border border-white/10" />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground font-bold">
                {venue.name?.[0] || "•"}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] text-primary/80">Reservations</div>
              <div className="font-serif text-xl truncate">{venue.name}</div>
            </div>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight">
            Reserve your table.
          </h1>
          <p className="text-muted-foreground mt-3 max-w-md">
            {venue.description?.slice(0, 140) || `Book a moment at ${venue.name}. Live availability, instantly confirmed.`}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-xs text-muted-foreground">
            {venue.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {venue.address}{venue.city ? `, ${venue.city}` : ""}</span>}
            {venue.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {venue.phone}</span>}
            {venue.website && <a href={venue.website} className="inline-flex items-center gap-1 hover:text-foreground"><Globe className="h-3 w-3" /> Website</a>}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pb-24">
        {/* Step indicator */}
        {step !== "done" && (
          <div className="flex items-center gap-2 mb-6">
            {["Date", "Guests", "Time", "Details"].map((label, i) => (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i <= stepIdx ? "bg-primary" : "bg-white/10"
                  }`}
                />
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-5 sm:p-7 shadow-[0_30px_80px_-30px_hsl(0_0%_0%/0.6)]">
          <AnimatePresence mode="wait">
            {step === "date" && (
              <motion.div key="date" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground"><Calendar className="h-4 w-4" /> Select a date</div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {days.map((d) => {
                    const active = isSameDay(d, date);
                    return (
                      <button
                        key={d.toISOString()}
                        onClick={() => setDate(d)}
                        className={`p-3 rounded-xl border text-center transition-all ${
                          active
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-white/10 hover:border-white/20 hover:bg-white/5"
                        }`}
                      >
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{format(d, "EEE")}</div>
                        <div className="text-lg font-semibold tabular-nums">{format(d, "d")}</div>
                        <div className="text-[10px] text-muted-foreground">{format(d, "MMM")}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-6 flex justify-end">
                  <Button size="lg" onClick={() => setStep("party")} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
                    Continue <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "party" && (
              <motion.div key="party" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground"><Users className="h-4 w-4" /> How many guests?</div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setParty(n)}
                      className={`aspect-square rounded-xl border text-lg font-semibold transition-all ${
                        party === n
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-white/10 hover:border-white/20 hover:bg-white/5"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-4 text-xs text-muted-foreground">For parties over 10, please call the venue directly.</div>
                <div className="mt-6 flex justify-between">
                  <Button variant="ghost" onClick={() => setStep("date")}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                  <Button size="lg" onClick={() => setStep("time")} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
                    Continue <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "time" && (
              <motion.div key="time" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> Available times</div>
                  <div className="text-xs text-muted-foreground">{format(date, "EEE d MMM")} · party of {party}</div>
                </div>
                {slotsLoading ? (
                  <div className="h-40 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {slots.map((s) => (
                        <button
                          key={s.time}
                          disabled={!s.available}
                          onClick={() => setSlot(s.time)}
                          className={`py-3 rounded-xl border text-sm font-medium tabular-nums transition-all ${
                            !s.available
                              ? "border-white/5 text-muted-foreground/40 line-through cursor-not-allowed"
                              : slot === s.time
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-white/10 hover:border-white/20 hover:bg-white/5"
                          }`}
                        >
                          {s.time}
                          {s.available && s.pressure > 0.7 && (
                            <div className="text-[9px] uppercase tracking-wider text-accent mt-0.5">Limited</div>
                          )}
                        </button>
                      ))}
                    </div>
                    {slots.every((s) => !s.available) && (
                      <div className="mt-4 p-4 rounded-xl border border-warn/30 bg-warn/5 text-sm text-muted-foreground">
                        <Sparkles className="h-4 w-4 inline mr-1 text-warn" />
                        Fully booked on this day. Try a different date.
                      </div>
                    )}
                  </>
                )}
                <div className="mt-6 flex justify-between">
                  <Button variant="ghost" onClick={() => setStep("party")}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                  <Button
                    size="lg"
                    disabled={!slot}
                    onClick={() => setStep("details")}
                    className="bg-gradient-to-r from-primary to-accent text-primary-foreground"
                  >
                    Continue <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "details" && (
              <motion.div key="details" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <div className="text-sm text-muted-foreground mb-1">Almost there</div>
                <div className="font-serif text-2xl mb-5">
                  {format(date, "EEE d MMM")} · {slot} · party of {party}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Full name</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+61…" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Special requests (optional)</label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Birthday, dietary, seating preference…" rows={3} />
                  </div>
                </div>
                {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
                <div className="mt-6 flex justify-between">
                  <Button variant="ghost" onClick={() => setStep("time")}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                  <Button
                    size="lg"
                    disabled={submitting || name.trim().length < 2}
                    onClick={submit}
                    className="bg-gradient-to-r from-primary to-accent text-primary-foreground"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Confirm booking <Check className="h-4 w-4 ml-1" /></>}
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "done" && booking && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
                <div className="h-16 w-16 mx-auto rounded-full bg-success/15 border border-success/30 grid place-items-center mb-5">
                  <Check className="h-8 w-8 text-success" />
                </div>
                <div className="font-serif text-3xl mb-2">You're booked.</div>
                <div className="text-muted-foreground mb-6">
                  {format(new Date(booking.booking_time), "EEEE d MMMM 'at' HH:mm")} · party of {booking.party_size}
                </div>
                <div className="text-xs text-muted-foreground mb-2">Reference</div>
                <div className="font-mono text-sm tracking-widest text-primary uppercase mb-6">{booking.id.slice(0, 8)}</div>
                <div className="text-xs text-muted-foreground">
                  A confirmation will be sent to your phone or email. See you at {venue.name}.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground/50 mt-6">
          Powered by Aijentik
        </div>
      </div>
    </div>
  );
}
