// Public booking edge function — powers the guest-facing booking portal.
// No auth required. Uses service role to read venue + bookings and to insert
// new reservations on behalf of guests.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// ±75 minute window when checking capacity around a requested slot.
const WINDOW_MIN = 75;
// Default service slots (24h). Honest, generous; venue hours could refine later.
const SERVICE_SLOTS = [
  "12:00", "12:30", "13:00", "13:30", "14:00",
  "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30", "22:00",
];

function slotMinutes(t: Date) {
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

async function loadVenue(sb: ReturnType<typeof createClient>, venueId: string) {
  const { data, error } = await sb
    .from("venues")
    .select("id,name,venue_type,cuisine,address,city,country,phone,website,description,logo_url,cover_url,capacity,hours,brand_voice")
    .eq("id", venueId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function bookingsForDay(sb: ReturnType<typeof createClient>, venueId: string, dayISO: string) {
  // dayISO: YYYY-MM-DD (local-ish). We pull a generous window.
  const start = new Date(`${dayISO}T00:00:00Z`);
  const end = new Date(start.getTime() + 36 * 3600 * 1000);
  const { data, error } = await sb
    .from("bookings")
    .select("id,booking_time,party_size,status")
    .eq("venue_id", venueId)
    .gte("booking_time", new Date(start.getTime() - 12 * 3600 * 1000).toISOString())
    .lte("booking_time", end.toISOString())
    .not("status", "in", "(cancelled,no_show)");
  if (error) throw error;
  return data ?? [];
}

function coversAround(bookings: any[], target: Date, windowMin = WINDOW_MIN) {
  const tMin = target.getTime() - windowMin * 60 * 1000;
  const tMax = target.getTime() + windowMin * 60 * 1000;
  return bookings.reduce((sum, b) => {
    const t = new Date(b.booking_time).getTime();
    return t >= tMin && t <= tMax ? sum + (b.party_size || 0) : sum;
  }, 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || url.searchParams.get("action") || "get_venue";
    const venueId = body.venue_id || url.searchParams.get("venue_id");
    if (!venueId) return json({ error: "venue_id required" }, 400);

    const venue = await loadVenue(sb, venueId);
    if (!venue) return json({ error: "Venue not found" }, 404);
    const capacity = Number(venue.capacity || 75);

    if (action === "get_venue") {
      return json({ venue: { ...venue, capacity } });
    }

    if (action === "day_availability") {
      const date: string = body.date || url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      const party = Math.max(1, Number(body.party_size || 2));
      const bookings = await bookingsForDay(sb, venueId, date);
      const slots = SERVICE_SLOTS.map((hhmm) => {
        const [h, m] = hhmm.split(":").map(Number);
        // Treat the date as a "wall" datetime; the client passes local date and
        // we evaluate utilisation in the same wall-clock frame.
        const target = new Date(`${date}T${hhmm}:00Z`);
        const covers = coversAround(bookings, target);
        const remaining = Math.max(0, capacity - covers);
        return {
          time: hhmm,
          available: remaining >= party,
          remaining,
          pressure: covers / capacity,
        };
      });
      return json({ date, party_size: party, capacity, slots });
    }

    if (action === "create_booking") {
      const { guest_name, guest_phone, guest_email, party_size, booking_time, notes } = body;
      if (!guest_name || !party_size || !booking_time) {
        return json({ error: "guest_name, party_size, booking_time required" }, 400);
      }
      if (typeof guest_name !== "string" || guest_name.trim().length < 2) {
        return json({ error: "Name must be at least 2 characters" }, 400);
      }
      const target = new Date(booking_time);
      if (isNaN(target.getTime())) return json({ error: "Invalid booking_time" }, 400);

      // Re-verify capacity at the moment of booking.
      const dayISO = target.toISOString().slice(0, 10);
      const bookings = await bookingsForDay(sb, venueId, dayISO);
      const covers = coversAround(bookings, target);
      if (covers + Number(party_size) > capacity) {
        return json({ error: "Slot just filled up. Please pick another time." }, 409);
      }

      const { data, error } = await sb.from("bookings").insert({
        venue_id: venueId,
        guest_name: guest_name.trim(),
        guest_phone: guest_phone || null,
        guest_email: guest_email || null,
        party_size: Number(party_size),
        booking_time: target.toISOString(),
        notes: notes || null,
        source: "public_web",
        status: "confirmed",
      }).select().single();
      if (error) return json({ error: error.message }, 400);

      await sb.from("brain_events").insert({
        venue_id: venueId,
        title: "Booking via public portal",
        reason: `${guest_name} · party of ${party_size}`,
        severity: "info",
        meta: { booking_id: data.id, source: "public_web" },
      });

      return json({ booking: { id: data.id, booking_time: data.booking_time, party_size: data.party_size, guest_name: data.guest_name } });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e: any) {
    return json({ error: e?.message || "Server error" }, 500);
  }
});
