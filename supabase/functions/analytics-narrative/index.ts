import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AVG_COVER = 45; // assumed avg revenue per cover

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: corsHeaders });
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { global: { headers: { Authorization: auth } } });

    const { venue_id } = await req.json();
    if (!venue_id) return new Response(JSON.stringify({ error: "venue_id required" }), { status: 400, headers: corsHeaders });

    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [{ data: bookings }, { data: calls }] = await Promise.all([
      sb.from("bookings").select("party_size, source, status, created_at").eq("venue_id", venue_id).gte("created_at", since),
      sb.from("calls").select("outcome, duration_seconds, created_at").eq("venue_id", venue_id).gte("created_at", since),
    ]);

    const bookingsList = bookings || [];
    const callsList = calls || [];
    const aiBookings = bookingsList.filter((b: any) => (b.source || "").includes("ai") || b.source === "ai_voice").length;
    const totalCovers = bookingsList.reduce((a: number, b: any) => a + (b.party_size || 0), 0);
    const aiCovers = bookingsList.filter((b: any) => (b.source || "").includes("ai")).reduce((a: number, b: any) => a + (b.party_size || 0), 0);
    const revenueInfluenced = aiCovers * AVG_COVER;
    const missedSaved = callsList.filter((c: any) => c.outcome === "booking").length;

    const stats = {
      total_calls: callsList.length,
      total_bookings: bookingsList.length,
      ai_bookings: aiBookings,
      total_covers: totalCovers,
      ai_covers: aiCovers,
      revenue_influenced: revenueInfluenced,
      missed_calls_saved: missedSaved,
      avg_call_seconds: Math.round(callsList.reduce((a: number, c: any) => a + (c.duration_seconds || 0), 0) / Math.max(1, callsList.length)),
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an operations analyst for a hospitality venue. In 3 short paragraphs, write a confident, specific 30-day performance narrative. Highlight wins, risks, and one actionable recommendation. No markdown headers." },
          { role: "user", content: `Stats (last 30 days): ${JSON.stringify(stats)}` },
        ],
      }),
    });
    const data = await aiRes.json();
    const narrative = data.choices?.[0]?.message?.content || "Not enough data yet — keep operating and check back tomorrow.";

    return new Response(JSON.stringify({ ok: true, stats, narrative }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
