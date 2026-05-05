import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return new Response(JSON.stringify({ error: "invalid" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { venue_id } = await req.json();
    const { data: venue } = await sb.from("venues").select("*").eq("id", venue_id).single();
    const { data: bookings } = await sb.from("bookings").select("*").eq("venue_id", venue_id).order("booking_time", { ascending: false }).limit(50);
    const { data: calls } = await sb.from("calls").select("*").eq("venue_id", venue_id).order("started_at", { ascending: false }).limit(50);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You generate overnight operational insights for a hospitality venue. Return strict JSON." },
          { role: "user", content: `Venue: ${venue?.name} (${venue?.venue_type}). Bookings (${bookings?.length || 0}) and calls (${calls?.length || 0}) summary:\n${JSON.stringify({ bookings: bookings?.slice(0,15), calls: calls?.slice(0,15) })}\n\nReturn JSON: { insights: [{title, body, category, impact}] } with 4-6 actionable insights covering revenue opportunities, staffing, no-shows, repeat guests, and call patterns. Be specific even if data is sparse.` },
        ],
      }),
    });
    const aiJson = await aiRes.json();
    const parsed = JSON.parse(aiJson.choices[0].message.content);
    const insights = parsed.insights || [];
    for (const i of insights) {
      await sb.from("insights").insert({ venue_id, title: i.title, body: i.body, category: i.category, impact: i.impact });
    }
    await sb.from("brain_events").insert({ venue_id, title: "Overnight insights generated", reason: `${insights.length} insights from last 50 bookings & calls.`, severity: "success" });
    return new Response(JSON.stringify({ insights }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
