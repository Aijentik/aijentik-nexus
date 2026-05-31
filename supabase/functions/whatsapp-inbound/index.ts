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
      name: "create_booking",
      description: "Create a new reservation. Only call after confirming name, party size, date, time (ISO 8601 with TZ), and phone.",
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
      description: "Modify an existing reservation (date/time, party size, or notes). booking_id comes from CALLER CONTEXT.",
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
];

async function execTool(sb: any, venue: any, guestPhone: string, guestId: string | null, name: string, args: any) {
  try {
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

    // 4) Load thread (last 10), caller bookings, KB, venue context.
    const [{ data: history }, { data: callerBookings }, { data: kb }, { data: venueBookings }] = await Promise.all([
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
    ]);

    const turns = (history || []).slice().reverse().map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.body,
    }));

    // 5) Build caller context block + voice-agent-style prompt.
    const nextBooking = (callerBookings || []).find((b: any) => new Date(b.booking_time) >= new Date());
    const fmtBooking = (b: any) => `${b.guest_name}, party of ${b.party_size}, ${b.booking_time} (id: ${b.id}, status: ${b.status})`;

    const basePrompt = buildPrompt(venue, kb || [], {
      tools: { create_booking: true, update_booking: true, take_message: true },
      responseLength: "short",
    }, { bookings: venueBookings || [] });

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
      + `\n\nCHANNEL: WhatsApp text. Reply in 1–2 short sentences, friendly, no markdown, no emoji spam. You CAN take real action via tools — never tell the guest to "call us" if the booking change is something you can do yourself.`;

    const messages: any[] = [{ role: "system", content: system }, ...turns];

    // 6) Tool-calling loop (max 3 hops).
    let reply = "";
    for (let hop = 0; hop < 3; hop++) {
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
