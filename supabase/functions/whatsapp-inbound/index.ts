// Twilio WhatsApp inbound webhook.
// Mirrors the voice agent: rich venue/caller context, knowledge base, and
// tool-calling for create/update/cancel bookings so the WhatsApp agent is as
// capable as the phone agent.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPrompt } from "../_shared/agent-config.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function twiml() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { ...cors, "Content-Type": "text/xml" }, status: 200 },
  );
}

function normalizeWa(n: string | null): string | null {
  if (!n) return null;
  return n.replace(/^whatsapp:/i, "").trim();
}

// --- Tool schemas (OpenAI-compatible function calling) ---
const TOOLS = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Check whether a requested date/time has capacity. Returns availability for the requested slot plus nearby alternative slots before and after. ALWAYS call this before promising a time or creating a booking.",
      parameters: {
        type: "object",
        properties: {
          booking_time: { type: "string", description: "Requested ISO 8601 datetime with timezone offset, e.g. 2026-06-05T19:00:00+10:00" },
          party_size: { type: "integer", minimum: 1 },
        },
        required: ["booking_time", "party_size"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_booking",
      description: "Find an existing booking when the caller's phone doesn't match any on file. Search by guest_name, short booking reference (first 8 chars of id), or an alternate phone the booking might be under.",
      parameters: {
        type: "object",
        properties: {
          guest_name: { type: "string" },
          booking_ref: { type: "string", description: "Short reference, e.g. first 8 chars of booking id" },
          alternate_phone: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_booking",
      description: "Create a new reservation. Only call after check_availability confirms the slot is free AND you have confirmed name, party size, date, time (ISO 8601 with TZ).",
      parameters: {
        type: "object",
        properties: {
          guest_name: { type: "string" },
          party_size: { type: "integer", minimum: 1 },
          booking_time: { type: "string", description: "Full ISO 8601 with timezone offset, e.g. 2026-06-08T19:30:00+10:00" },
          notes: { type: "string" },
        },
        required: ["guest_name", "party_size", "booking_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_booking",
      description: "Modify an existing reservation (date/time, party size, or notes). booking_id comes from CALLER CONTEXT or find_booking. If changing time, call check_availability first.",
      parameters: {
        type: "object",
        properties: {
          booking_id: { type: "string" },
          booking_time: { type: "string", description: "Full ISO 8601 with timezone offset" },
          party_size: { type: "integer", minimum: 1 },
          notes: { type: "string" },
        },
        required: ["booking_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_booking",
      description: "Cancel an existing reservation.",
      parameters: {
        type: "object",
        properties: { booking_id: { type: "string" } },
        required: ["booking_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_takeaway_order",
      description: "Create a takeaway/delivery/pickup order from the venue MENU. Only call after confirming items, fulfillment, pickup time or delivery address, and reading back the total. Only quote real menu items.",
      parameters: {
        type: "object",
        properties: {
          guest_name: { type: "string" },
          fulfillment: { type: "string", description: "'takeaway', 'delivery', or 'dine_in'" },
          pickup_time: { type: "string", description: "ISO 8601 pickup time for takeaway" },
          delivery_address: { type: "string", description: "Full address for delivery" },
          notes: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Menu item name exactly as on the menu" },
                qty: { type: "integer", minimum: 1 },
                modifiers: { type: "string" },
                notes: { type: "string" },
              },
              required: ["name", "qty"],
            },
          },
        },
        required: ["guest_name", "fulfillment", "items"],
      },
    },
  },
];


async function execTool(sb: any, venue: any, guestPhone: string, guestId: string | null, name: string, args: any) {
  try {
    if (name === "check_availability") {
      const capacity = Math.max(1, Number(venue.capacity) || 60);
      const target = new Date(args.booking_time);
      if (isNaN(target.getTime())) return { ok: false, error: "invalid booking_time" };
      const party = Math.max(1, Number(args.party_size) || 2);
      // Pull every confirmed/pending booking in a wide window so we can score nearby slots too.
      const winStart = new Date(target.getTime() - 4 * 60 * 60 * 1000).toISOString();
      const winEnd = new Date(target.getTime() + 4 * 60 * 60 * 1000).toISOString();
      const { data: nearby } = await sb.from("bookings")
        .select("booking_time,party_size,status")
        .eq("venue_id", venue.id)
        .gte("booking_time", winStart).lte("booking_time", winEnd)
        .neq("status", "cancelled");
      const scoreSlot = (when: Date) => {
        const start = when.getTime() - 75 * 60 * 1000;
        const end = when.getTime() + 75 * 60 * 1000;
        const covers = (nearby || [])
          .filter((b: any) => {
            const t = new Date(b.booking_time).getTime();
            return t >= start && t <= end;
          })
          .reduce((s: number, b: any) => s + (b.party_size || 0), 0);
        const remaining = capacity - covers;
        return { covers, remaining, available: remaining >= party };
      };
      const requested = scoreSlot(target);
      const alts: Array<{ booking_time: string; covers: number; remaining: number }> = [];
      for (const offsetMin of [-90, -60, -30, 30, 60, 90, 120]) {
        const t = new Date(target.getTime() + offsetMin * 60 * 1000);
        const s = scoreSlot(t);
        if (s.available) alts.push({ booking_time: t.toISOString(), covers: s.covers, remaining: s.remaining });
      }
      return {
        ok: true,
        capacity,
        requested: { booking_time: target.toISOString(), party_size: party, ...requested },
        alternatives: alts.slice(0, 5),
      };
    }
    if (name === "find_booking") {
      const venueId = venue.id;
      let q = sb.from("bookings")
        .select("id,guest_name,guest_phone,party_size,booking_time,status,notes")
        .eq("venue_id", venueId)
        .neq("status", "cancelled")
        .gte("booking_time", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("booking_time").limit(20);
      const { data: all } = await q;
      let matches = all || [];
      if (args.booking_ref) {
        const ref = String(args.booking_ref).toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 8);
        matches = matches.filter((b: any) => (b.id || "").toLowerCase().startsWith(ref));
      }
      if (args.guest_name) {
        const needle = String(args.guest_name).toLowerCase().trim();
        matches = matches.filter((b: any) => (b.guest_name || "").toLowerCase().includes(needle));
      }
      if (args.alternate_phone) {
        const tail = String(args.alternate_phone).replace(/\D/g, "").slice(-8);
        if (tail) matches = matches.filter((b: any) => (b.guest_phone || "").replace(/\D/g, "").slice(-8) === tail);
      }
      return { ok: true, matches: matches.slice(0, 5) };
    }
    if (name === "create_booking") {
      const { data, error } = await sb.from("bookings").insert({
        venue_id: venue.id,
        guest_name: args.guest_name,
        guest_phone: guestPhone,
        guest_id: guestId,
        party_size: args.party_size,
        booking_time: args.booking_time,
        notes: args.notes || null,
        status: "confirmed",
        source: "ai_whatsapp",
      }).select("id,booking_time,party_size").maybeSingle();
      if (error) return { ok: false, error: error.message };
      return { ok: true, booking: data };
    }
    if (name === "update_booking") {
      const patch: any = {};
      if (args.booking_time) patch.booking_time = args.booking_time;
      if (args.party_size) patch.party_size = args.party_size;
      if (args.notes !== undefined) patch.notes = args.notes;
      const { data, error } = await sb.from("bookings").update(patch)
        .eq("id", args.booking_id).eq("venue_id", venue.id)
        .select("id,booking_time,party_size,status").maybeSingle();
      if (error) return { ok: false, error: error.message };
      return { ok: true, booking: data };
    }
    if (name === "cancel_booking") {
      const { data, error } = await sb.from("bookings").update({ status: "cancelled" })
        .eq("id", args.booking_id).eq("venue_id", venue.id)
        .select("id,status").maybeSingle();
      if (error) return { ok: false, error: error.message };
      return { ok: true, booking: data };
    }
    if (name === "create_takeaway_order") {
      if (!venue?.features?.ordering) return { ok: false, error: "ordering not enabled for this venue" };
      const items = Array.isArray(args.items) ? args.items : [];
      if (!items.length) return { ok: false, error: "no items" };
      const { data: menu } = await sb.from("menu_items").select("id,name,price").eq("venue_id", venue.id).limit(500);
      const parsePrice = (p: any) => { const n = Number(String(p || "").replace(/[^0-9.]/g, "")); return isNaN(n) ? 0 : Math.round(n * 100); };
      const resolved = items.map((it: any) => {
        const m = (menu || []).find((x: any) => (x.name || "").toLowerCase().trim() === String(it.name || "").toLowerCase().trim());
        return { menu_item_id: m?.id || null, name: it.name, qty: Math.max(1, Number(it.qty) || 1), unit_price_cents: m ? parsePrice(m.price) : 0, modifiers: it.modifiers ? [{ note: it.modifiers }] : [], notes: it.notes || null };
      });
      const subtotal = resolved.reduce((s: number, r: any) => s + r.unit_price_cents * r.qty, 0);
      const fulfillment = ["takeaway", "delivery", "dine_in"].includes(args.fulfillment) ? args.fulfillment : "takeaway";
      const { data: order, error } = await sb.from("orders").insert({
        venue_id: venue.id, guest_name: args.guest_name, guest_phone: guestPhone, guest_id: guestId,
        channel: "whatsapp", fulfillment, status: "new", payment_status: "unpaid",
        subtotal_cents: subtotal, total_cents: subtotal,
        pickup_time: args.pickup_time ? new Date(args.pickup_time).toISOString() : null,
        delivery_address: args.delivery_address || null, notes: args.notes || null, ai_confidence: 0.85,
      }).select("id").maybeSingle();
      if (error || !order) return { ok: false, error: error?.message || "order insert failed" };
      await sb.from("order_items").insert(resolved.map((r: any) => ({ ...r, order_id: order.id, venue_id: venue.id })));
      return { ok: true, order: { id: order.id, total: (subtotal / 100).toFixed(2), items: resolved.length, fulfillment } };
    }
    return { ok: false, error: `unknown tool ${name}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const form = await req.formData();
    const fromWa = form.get("From")?.toString() || "";
    const toWa = form.get("To")?.toString() || "";
    const bodyText = form.get("Body")?.toString()?.trim() || "";
    const profileName = form.get("ProfileName")?.toString() || "";

    const fromE164 = normalizeWa(fromWa);
    const toE164 = normalizeWa(toWa);
    if (!fromE164 || !bodyText) return twiml();

    // 1) Resolve venue (by configured WA sender, else any WA-connected venue).
    let venue: any = null;
    if (toE164) {
      const { data: byNum } = await sb.from("venues").select("*")
        .filter("features->channels->whatsapp->>sender", "eq", toE164).maybeSingle();
      venue = byNum;
    }
    if (!venue) {
      const { data: anyWa } = await sb.from("venues").select("*")
        .filter("features->channels->whatsapp->>connected", "eq", "true")
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      venue = anyWa;
    }
    if (!venue) { console.warn("whatsapp-inbound: no venue for", toE164); return twiml(); }

    // 2) Recognise / upsert guest by phone.
    let guestId: string | null = null;
    let guestName: string | null = null;
    let guestNotes: string | null = null;
    const { data: existing } = await sb.from("guests")
      .select("id,name,notes,tags").eq("venue_id", venue.id).eq("phone", fromE164).maybeSingle();
    if (existing) {
      guestId = existing.id;
      guestName = existing.name;
      guestNotes = [existing.notes, (existing.tags || []).join(", ")].filter(Boolean).join(" • ") || null;
    } else {
      const { data: g } = await sb.from("guests")
        .insert({ venue_id: venue.id, phone: fromE164, name: profileName || "WhatsApp guest" })
        .select("id,name").maybeSingle();
      guestId = g?.id || null;
      guestName = g?.name || null;
    }

    // 3) Persist inbound.
    await sb.from("messages").insert({
      venue_id: venue.id, contact: fromE164, body: bodyText,
      channel: "whatsapp", direction: "inbound", status: "received",
    });

    // 4) Load thread (last 10), caller bookings, KB, venue context, menu (if ordering on).
    const orderingEnabled = !!(venue as any)?.features?.ordering;
    const [{ data: history }, { data: callerBookings }, { data: kb }, { data: venueBookings }, menuRes] = await Promise.all([
      sb.from("messages").select("direction, body").eq("venue_id", venue.id)
        .eq("channel", "whatsapp").eq("contact", fromE164)
        .order("created_at", { ascending: false }).limit(10),
      sb.from("bookings").select("id,guest_name,party_size,booking_time,status,notes")
        .eq("venue_id", venue.id).eq("guest_phone", fromE164)
        .order("booking_time", { ascending: false }).limit(5),
      sb.from("knowledge_base").select("title,content").eq("venue_id", venue.id).limit(30),
      sb.from("bookings").select("guest_name,party_size,booking_time,status,notes")
        .eq("venue_id", venue.id).gte("booking_time", new Date().toISOString())
        .order("booking_time").limit(15),
      orderingEnabled
        ? sb.from("menu_items").select("name,price,section,description").eq("venue_id", venue.id).order("position").limit(120)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const menu = (menuRes as any)?.data || [];

    const turns = (history || []).slice().reverse().map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.body,
    }));

    // 5) Build caller context block + voice-agent-style prompt.
    const nextBooking = (callerBookings || []).find((b: any) => new Date(b.booking_time) >= new Date());
    const fmtBooking = (b: any) => `${b.guest_name}, party of ${b.party_size}, ${b.booking_time} (id: ${b.id}, status: ${b.status})`;

    const basePrompt = buildPrompt(venue, kb || [], {
      tools: { create_booking: true, update_booking: true, take_message: true, take_order: orderingEnabled },
      responseLength: "short",
    }, { bookings: venueBookings || [], menu });

    const now = new Date();
    const todayLong = now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" });
    const tz = "Australia/Sydney (+10:00 / +11:00 DST)";

    const system = basePrompt
      .replace("{{current_datetime_local}}", now.toLocaleString("en-AU", { timeZone: "Australia/Sydney" }))
      .replace("{{today_weekday}}", now.toLocaleDateString("en-AU", { weekday: "long", timeZone: "Australia/Sydney" }))
      .replace("{{today_long}}", todayLong)
      .replace("{{tomorrow_weekday}}", new Date(now.getTime() + 86400000).toLocaleDateString("en-AU", { weekday: "long", timeZone: "Australia/Sydney" }))
      .replace("{{tomorrow_long}}", new Date(now.getTime() + 86400000).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" }))
      .replace("{{venue_timezone}}", tz)
      .replace("{{caller_number}}", fromE164)
      .replace("{{caller_known}}", existing ? "yes" : "no")
      .replace("{{caller_first_name}}", (guestName || "").split(" ")[0] || "")
      .replace("{{caller_name}}", guestName || "")
      .replace("{{caller_notes}}", guestNotes || "")
      .replace("{{caller_history}}", `${(callerBookings || []).length} bookings on file`)
      .replace("{{caller_bookings}}", (callerBookings || []).map(fmtBooking).join(" | ") || "none")
      .replace("{{caller_next_booking}}", nextBooking ? fmtBooking(nextBooking) : "none")
      + `

CHANNEL: WhatsApp text. Reply in 1–2 short sentences, friendly, no markdown, no emoji spam. You CAN take real action via tools — never tell the guest to "call us" if the booking change is something you can do yourself.

BOOKING CALENDAR RULES (CRITICAL — these prevent you sounding fake)
- Venue capacity is ${venue.capacity || 60} covers at a time. Treat a slot as available only when check_availability says so.
- BEFORE quoting any time or promising "yep that works", call check_availability with the requested ISO time + party size. Do not guess. Do not say "let me check" without actually calling the tool.
- If the requested slot is unavailable, look at the alternatives the tool returned and offer the closest one before and the closest one after the requested time (e.g. "7pm's full unfortunately — I've got 6pm or 8:15 if either works"). Quote real times from the tool result, never invented ones.
- BEFORE create_booking, you MUST have a successful check_availability for that exact time and party size in the conversation. If you skipped it, call it now.
- Only confirm a booking after the tool returns ok:true — then read back the time and party size in plain English.

CALLER LOOKUP RULES
- If the guest asks to change/cancel a booking and CALLER CONTEXT shows bookings on file under their number, reference the right one and proceed.
- If they ask to change/cancel but "Bookings on file" is "none", DO NOT pretend or guess. Say something like: "I'm not seeing a booking under this number — was it made under a different name, a different number, or do you have a booking reference?" Then call find_booking with whatever they give you (name, last 4 of reference, or alternate phone).
- Never invent a booking. If find_booking returns no matches, say so honestly and offer to take details and have the team check.
- Never say "system glitch" or "I can't check that right now" — the tools work, use them.`;


    const messages: any[] = [{ role: "system", content: system }, ...turns];

    // 6) Tool-calling loop (max 3 hops).
    let reply = "";
    for (let hop = 0; hop < 5; hop++) {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools: TOOLS,
          tool_choice: "auto",
        }),
      });
      const aiData = await aiRes.json().catch(() => ({}));
      const msg = aiData?.choices?.[0]?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls || [];
      if (toolCalls.length === 0) {
        reply = (msg.content || "").trim();
        break;
      }
      messages.push(msg);
      for (const tc of toolCalls) {
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* noop */ }
        const result = await execTool(sb, venue, fromE164, guestId, tc.function?.name, args);
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    }
    if (!reply) reply = "Got it — let me come back to you in a sec.";

    // 7) Send reply via Twilio.
    const sendRes = await fetch(`${GATEWAY}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `whatsapp:${fromE164}`,
        From: toWa || `whatsapp:${toE164 || ""}`,
        Body: reply,
      }),
    });
    const status = sendRes.ok ? "sent" : "failed";
    if (!sendRes.ok) console.error("whatsapp send failed", sendRes.status, await sendRes.text().catch(() => ""));

    await sb.from("messages").insert({
      venue_id: venue.id, contact: fromE164, body: reply,
      channel: "whatsapp", direction: "outbound", status,
    });
    await sb.from("brain_events").insert({
      venue_id: venue.id, title: "WhatsApp reply sent",
      reason: `AI responded to ${profileName || fromE164}`, severity: "info",
    });

    return twiml();
  } catch (e) {
    console.error("whatsapp-inbound error", e);
    return twiml();
  }
});
