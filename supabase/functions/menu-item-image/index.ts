// Generate a high-quality AI placeholder image for a menu item using Lovable AI.
// Saves the resulting data URL to menu_items.image_url and marks image_source='ai'.
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
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return new Response(JSON.stringify({ error: "invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { item_id } = await req.json();
    if (!item_id) return new Response(JSON.stringify({ error: "item_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: item, error } = await sb.from("menu_items").select("*").eq("id", item_id).single();
    if (error || !item) throw new Error("item not found");

    // Authorise: ensure caller is venue member
    const { data: ok } = await userClient.rpc("is_venue_member", { _user: u.user.id, _venue: item.venue_id });
    if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const prompt = `Editorial food photography of "${item.name}"${item.description ? ` — ${item.description}` : ""}. Overhead 45° angle, restaurant-quality plating, soft natural light, shallow depth of field, on a moody dark stone surface. Hyperreal, magazine-grade, no text, no watermark.`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!r.ok) throw new Error("AI image " + r.status + ": " + (await r.text()).slice(0, 200));
    const j = await r.json();
    const url = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) throw new Error("no image returned");

    await sb.from("menu_items").update({ image_url: url, image_source: "ai" }).eq("id", item_id);

    return new Response(JSON.stringify({ image_url: url }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
