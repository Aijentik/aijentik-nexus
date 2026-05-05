import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { global: { headers: { Authorization: auth } } });

    const { event_id, venue_id } = await req.json();
    if (!event_id || !venue_id) return new Response(JSON.stringify({ error: "event_id and venue_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: ev } = await sb.from("brain_events").select("*").eq("id", event_id).single();
    const { data: venue } = await sb.from("venues").select("name,venue_type").eq("id", venue_id).single();
    if (!ev) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You are the AI brain of ${venue?.name || "a venue"}. Explain a single decision in 1-2 plain-English sentences. No fluff, no apologies.` },
          { role: "user", content: `Action: ${ev.title}\nReason logged: ${ev.reason || "(none)"}\nSeverity: ${ev.severity}\nMeta: ${JSON.stringify(ev.meta || {}).slice(0, 400)}\n\nExplain to the venue owner why this happened and what it means for them.` },
        ],
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return new Response(JSON.stringify({ error: "AI gateway: " + aiRes.status, details: t.slice(0, 200) }), { status: aiRes.status === 429 ? 429 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await aiRes.json();
    const explanation = data.choices?.[0]?.message?.content || "No explanation produced.";

    return new Response(JSON.stringify({ explanation }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
