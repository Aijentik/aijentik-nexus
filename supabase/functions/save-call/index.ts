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

    const { venue_id, agent_id, conversation_id, transcript, started_at, duration_seconds, caller, outcome } = await req.json();
    if (!venue_id || !Array.isArray(transcript)) {
      return new Response(JSON.stringify({ error: "venue_id and transcript required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let summary = "";
    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: "Summarize this hospitality call in 1-2 sentences. Capture: caller intent, outcome (booked / info / complaint / other), key details." },
            { role: "user", content: transcript.map((t: any) => `${t.role}: ${t.text}`).join("\n").slice(0, 6000) },
          ],
        }),
      });
      if (aiRes.ok) {
        const d = await aiRes.json();
        summary = d.choices?.[0]?.message?.content || "";
      }
    } catch { /* ignore */ }

    const { data: call, error } = await sb.from("calls").insert({
      venue_id,
      agent_id: agent_id || null,
      conversation_id: conversation_id || null,
      transcript,
      summary,
      started_at: started_at || new Date().toISOString(),
      ended_at: new Date().toISOString(),
      duration_seconds: duration_seconds || 0,
      caller: caller || null,
      outcome: outcome || (summary.toLowerCase().includes("book") ? "booking" : "info"),
    }).select().single();
    if (error) throw error;

    await sb.from("brain_events").insert({
      venue_id,
      title: "Call completed",
      reason: summary || `Call lasted ${duration_seconds}s`,
      severity: "info",
      meta: { call_id: call.id },
    });

    return new Response(JSON.stringify({ ok: true, call_id: call.id, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
