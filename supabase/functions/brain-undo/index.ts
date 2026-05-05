import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { global: { headers: { Authorization: auth } } });

    const { event_id, venue_id } = await req.json();
    const { data: ev } = await sb.from("brain_events").select("*").eq("id", event_id).single();
    if (!ev) return new Response(JSON.stringify({ error: "event not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let message = "Marked as reversed.";
    const meta = (ev.meta as any) || {};

    // Booking-related undo
    if (meta.booking_id) {
      await sb.from("bookings").update({ status: "cancelled" }).eq("id", meta.booking_id).eq("venue_id", venue_id);
      message = "Booking cancelled.";
    } else if (ev.title?.toLowerCase().includes("booking")) {
      // best-effort: cancel most recent ai_voice booking matching reason name
      const name = (ev.reason || "").split("·")[0]?.trim();
      if (name) {
        const { data: b } = await sb.from("bookings").select("id").eq("venue_id", venue_id).ilike("guest_name", `%${name}%`).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (b) {
          await sb.from("bookings").update({ status: "cancelled" }).eq("id", b.id);
          message = `Booking for ${name} cancelled.`;
        }
      }
    }

    await sb.from("brain_events").insert({
      venue_id,
      title: "Action reversed by operator",
      reason: `Undid: ${ev.title}`,
      severity: "warn",
      meta: { undid_event_id: event_id },
    });

    return new Response(JSON.stringify({ ok: true, message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
