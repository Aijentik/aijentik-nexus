// Dev/demo helper: lets the UI inject a realistic inbound email into a
// venue's inbox without needing live Mailgun routing. Authenticated.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: corsHeaders });
    const user = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false },
    });
    const { data: u } = await user.auth.getUser();
    if (!u?.user) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: corsHeaders });

    const { venue_id, from_name, from_email, subject, body } = await req.json();
    if (!venue_id) throw new Error("venue_id required");

    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    // Ensure inbox exists
    let { data: inbox } = await svc.from("email_inboxes").select("forwarding_address").eq("venue_id", venue_id).maybeSingle();
    if (!inbox) {
      const addr = `venue-${venue_id.slice(0, 8)}@inbound.aijentik.app`;
      const { data: created } = await svc.from("email_inboxes").insert({
        venue_id, forwarding_address: addr, reply_from_address: addr,
        reply_from_name: "Reservations",
      }).select("forwarding_address").single();
      inbox = created!;
    }

    const payload = {
      recipient: inbox.forwarding_address,
      sender: `${from_name || "Guest"} <${from_email}>`,
      subject: subject || "Booking enquiry",
      "body-plain": body || "Hello, I'd like to make a booking.",
      "Message-Id": `<sim-${crypto.randomUUID()}@aijentik.app>`,
    };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/email-inbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return new Response(JSON.stringify(json), {
      status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
