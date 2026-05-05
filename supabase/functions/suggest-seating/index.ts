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

    const { venue_id, party_size, booking_time, vip, notes } = await req.json();
    if (!venue_id || !party_size) return new Response(JSON.stringify({ error: "venue_id, party_size required" }), { status: 400, headers: corsHeaders });

    const { data: tables } = await sb.from("tables").select("*").eq("venue_id", venue_id);
    const target = booking_time ? new Date(booking_time) : new Date();
    const start = new Date(target.getTime() - 90 * 60000).toISOString();
    const end = new Date(target.getTime() + 90 * 60000).toISOString();
    const { data: conflicts } = await sb.from("bookings")
      .select("table_id, booking_time, party_size, status")
      .eq("venue_id", venue_id)
      .gte("booking_time", start).lte("booking_time", end)
      .neq("status", "cancelled");

    const occupied = new Set((conflicts || []).map((c: any) => c.table_id).filter(Boolean));
    const free = (tables || []).filter((t: any) => !occupied.has(t.id) && t.capacity >= party_size);

    if (!free.length) {
      return new Response(JSON.stringify({ ok: true, suggestion: null, reason: "No free table fits this party at the requested time." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a maître d'. Pick the BEST table for the party. Prefer: closest capacity match, VIP→featured/window tables, larger groups→combinable. Reply ONLY via the pick_table tool." },
          { role: "user", content: `Party: ${party_size}${vip ? " (VIP)" : ""}. Notes: ${notes || "none"}.\nFree tables:\n${free.map((t: any) => `${t.id} | ${t.label} | seats ${t.capacity} | ${t.shape}`).join("\n")}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "pick_table",
            description: "Pick the best table",
            parameters: { type: "object", required: ["table_id", "reason"], properties: { table_id: { type: "string" }, reason: { type: "string" } } },
          },
        }],
        tool_choice: { type: "function", function: { name: "pick_table" } },
      }),
    });
    const aiData = await aiRes.json();
    const args = aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const pick = args ? JSON.parse(args) : { table_id: free[0].id, reason: "Best capacity match." };
    const table = free.find((t: any) => t.id === pick.table_id) || free[0];

    return new Response(JSON.stringify({ ok: true, suggestion: table, reason: pick.reason }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
