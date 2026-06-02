// Webhook target for ElevenLabs server-side tool calls.
// Receives create_booking / update_booking / take_message during a live call,
// writes to the DB, and returns a short result string for the agent to speak.
// pg_net triggers handle forwarding to the external system after writes.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOOL_SECRET = Deno.env.get("ELEVENLABS_TOOL_SECRET")!;

function ok(result: string) {
  return new Response(JSON.stringify({ result }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    const authOk = !!TOOL_SECRET && token === TOOL_SECRET;
    if (!authOk) {
      console.error("[elevenlabs-tool-handler] unauthorized", { hasSecret: !!TOOL_SECRET, authPrefix: auth.slice(0, 12) });
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    // Tool name is baked into the per-tool webhook URL (?tool=create_booking).
    // Fall back to body.tool_name for legacy callers.
    const tool_name = (url.searchParams.get("tool") || (typeof body.tool_name === "string" ? body.tool_name : "")).trim() || undefined;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // venue_id is baked into the webhook URL per-agent (?venue_id=<uuid>).
    // Fall back to header/body only for legacy callers.
    const candidates = [
      (url.searchParams.get("venue_id") || "").trim(),
      typeof body.venue_id === "string" ? body.venue_id.trim() : "",
      (req.headers.get("x-venue-id") || "").trim(),
    ].filter(Boolean);
    const venue_id = candidates.find((v) => UUID_RE.test(v));
    console.log("[elevenlabs-tool-handler] call", { tool_name, venue_id, candidates, keys: Object.keys(body) });

    if (!tool_name) return ok("Sorry, I couldn't process that request.");
    if (!venue_id) {
      console.error("[elevenlabs-tool-handler] missing/invalid venue_id", { candidates });
      return ok("Sorry, I'm not connected to the venue right now.");
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    if (tool_name === "create_booking") {
      const { guest_name, party_size, booking_time, guest_phone, notes } = body;
      if (!guest_name || !party_size || !booking_time) {
        return ok("I still need the name, party size, and time to book that in.");
      }
      const time = new Date(booking_time);
      if (isNaN(time.getTime())) return ok("That booking time didn't look right — could you confirm it?");

      const { data, error } = await sb.from("bookings").insert({
        venue_id,
        guest_name,
        party_size: Number(party_size) || 2,
        booking_time: time.toISOString(),
        guest_phone: guest_phone || null,
        notes: notes || null,
        source: "ai_voice",
        status: "confirmed",
      }).select().single();
      if (error) {
        console.error("[create_booking] insert failed", error);
        return ok("I couldn't save that booking just now — let me take a message and the team will call back.");
      }

      await sb.from("brain_events").insert({
        venue_id,
        title: "Booking created by voice agent",
        reason: `${guest_name} · party of ${party_size} · ${time.toLocaleString()}`,
        severity: "info",
      });

      if (guest_phone) {
        const { data: venue } = await sb.from("venues").select("name").eq("id", venue_id).single();
        sb.functions.invoke("send-sms", {
          body: {
            venue_id,
            to: guest_phone,
            booking_id: data.id,
            body: `Hi ${guest_name}, your table for ${party_size} at ${venue?.name || "the venue"} on ${time.toLocaleString()} is confirmed. Reply STOP to opt out.`,
          },
        }).catch((e) => console.error("[create_booking] sms failed", e));
      }

      return ok(`Booking confirmed for ${guest_name}, party of ${party_size} on ${time.toLocaleString()}. Booking ID: ${data.id}.`);
    }

    if (tool_name === "update_booking") {
      const { action, booking_id, guest_name, guest_phone, original_booking_time, new_booking_time, new_party_size, notes } = body;
      if (!action || (action !== "update" && action !== "cancel")) {
        return ok("I need to know whether to update or cancel that booking.");
      }

      // Find the booking
      let target: any = null;
      if (booking_id) {
        const { data } = await sb.from("bookings").select("*").eq("id", booking_id).eq("venue_id", venue_id).maybeSingle();
        target = data;
      }
      if (!target) {
        let q = sb.from("bookings").select("*").eq("venue_id", venue_id);
        if (guest_name) q = q.ilike("guest_name", `%${guest_name}%`);
        if (guest_phone) q = q.eq("guest_phone", guest_phone);
        if (original_booking_time) {
          const t = new Date(original_booking_time);
          if (!isNaN(t.getTime())) q = q.eq("booking_time", t.toISOString());
        }
        const { data } = await q.order("booking_time", { ascending: false }).limit(1);
        target = data?.[0] || null;
      }

      if (!target) return ok("I couldn't find that booking — could you confirm the name and time on it?");

      const patch: Record<string, any> = {};
      if (action === "cancel") {
        patch.status = "cancelled";
      } else {
        if (new_booking_time) {
          const t = new Date(new_booking_time);
          if (!isNaN(t.getTime())) patch.booking_time = t.toISOString();
        }
        if (new_party_size) patch.party_size = Number(new_party_size);
        if (notes) patch.notes = notes;
      }
      if (!Object.keys(patch).length) return ok("Nothing to change on that booking.");

      const { error } = await sb.from("bookings").update(patch).eq("id", target.id);
      if (error) {
        console.error("[update_booking] update failed", error);
        return ok("I couldn't update that booking just now — let me take a message.");
      }

      await sb.from("brain_events").insert({
        venue_id,
        title: action === "cancel" ? "Booking cancelled by voice agent" : "Booking updated by voice agent",
        reason: `${target.guest_name} · ${JSON.stringify(patch)}`,
        severity: "info",
      });

      return ok(action === "cancel" ? "Booking cancelled." : "Booking updated successfully.");
    }

    if (tool_name === "take_message") {
      const { caller_name, caller_phone, message, reason } = body;
      if (!message) return ok("Sorry, I didn't catch the message.");
      const { error } = await sb.from("messages").insert({
        venue_id,
        contact: caller_name || caller_phone || "Unknown caller",
        body: message,
        direction: "inbound",
        channel: "voice",
        status: "received",
        reason: reason === "Call Back" ? "Call Back" : "Message",
      } as any);
      if (error) {
        console.error("[take_message] insert failed", error);
        return ok("I couldn't save that message just now — please call back shortly.");
      }
      await sb.from("brain_events").insert({
        venue_id,
        title: "Message taken by voice agent",
        reason: `${caller_name || "Caller"}: ${String(message).slice(0, 200)}`,
        severity: "info",
      });
      return ok("Message recorded for the team.");
    }

    return ok(`I'm not set up to do "${tool_name}" yet.`);
  } catch (e) {
    console.error("[elevenlabs-tool-handler] error", e);
    return ok("Sorry, something went wrong on my end.");
  }
});
