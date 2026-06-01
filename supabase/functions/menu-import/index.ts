// Imports a menu for a venue from either a pasted text blob or a URL.
// Uses Lovable AI to parse into structured items, then inserts a menu row + menu_items.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { global: { headers: { Authorization: auth } } });
    const { venue_id, name, url, text, is_live } = await req.json();
    if (!venue_id) return new Response(JSON.stringify({ error: "venue_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!url && !text) return new Response(JSON.stringify({ error: "url or text required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let source = text || "";
    if (!source && url) {
      try {
        const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 AijentikBot" }, signal: AbortSignal.timeout(15000) });
        source = stripHtml(await r.text());
      } catch (e) {
        return new Response(JSON.stringify({ error: "could not fetch url: " + String(e) }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    if (source.trim().length < 20) {
      return new Response(JSON.stringify({ error: "menu text too short to parse" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Extract a structured restaurant menu. Reply ONLY using the extract_menu tool. Be accurate, do not invent items." },
          { role: "user", content: `Menu content:\n\n${source}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_menu",
            description: "Extract structured menu",
            parameters: {
              type: "object",
              required: ["items"],
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: { type: "string" },
                      section: { type: "string", description: "starters, mains, desserts, drinks, sides, etc." },
                      description: { type: "string" },
                      price: { type: "string", description: "Include currency symbol if present" },
                    },
                  },
                },
              },
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_menu" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      return new Response(JSON.stringify({ error: "AI: " + aiRes.status, details: t.slice(0, 300) }), { status: aiRes.status === 429 ? 429 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await aiRes.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return new Response(JSON.stringify({ error: "no extraction" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const parsed = JSON.parse(args);
    const items = (parsed.items || []).slice(0, 200);
    if (!items.length) return new Response(JSON.stringify({ error: "no items found in menu" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: menu, error: mErr } = await sb.from("menus").insert({
      venue_id,
      name: name || (url ? new URL(url).hostname : "Menu"),
      is_live: is_live !== false,
      source_url: url || null,
      raw_text: text ? text.slice(0, 20000) : null,
    }).select().single();
    if (mErr) return new Response(JSON.stringify({ error: mErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    await sb.from("menu_items").insert(
      items.map((it: any, i: number) => ({
        venue_id,
        menu_id: menu.id,
        section: (it.section || "mains").toString().toLowerCase().slice(0, 40),
        name: String(it.name).slice(0, 160),
        description: it.description ? String(it.description).slice(0, 600) : null,
        price: it.price ? String(it.price).slice(0, 40) : null,
        position: i,
      }))
    );

    await sb.from("brain_events").insert({
      venue_id,
      title: `Menu imported · ${menu.name}`,
      reason: `${items.length} items added${url ? ` from ${url}` : " from pasted text"}`,
      severity: "success",
    });

    return new Response(JSON.stringify({ ok: true, menu, count: items.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
