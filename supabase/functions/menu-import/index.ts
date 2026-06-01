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
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

const MENU_KEYWORDS = ["menu", "menus", "food", "drinks", "wine", "cocktail", "dinner", "lunch", "brunch", "breakfast", "takeaway", "delivery", "eat", "order"];

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18000);
}

async function firecrawlScrape(url: string): Promise<string> {
  const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`firecrawl scrape ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.data?.markdown || j.markdown || "").toString();
}

async function firecrawlMap(url: string): Promise<string[]> {
  const r = await fetch("https://api.firecrawl.dev/v2/map", {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, search: "menu", limit: 80, includeSubdomains: false }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) return [];
  const j = await r.json();
  const links: string[] = j.data?.links?.map((l: any) => typeof l === "string" ? l : l.url) || j.links || [];
  return links.filter(Boolean);
}

async function smartScrapeMenu(url: string): Promise<string> {
  if (!FIRECRAWL_API_KEY) {
    // Fallback: plain fetch
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 AijentikBot" }, signal: AbortSignal.timeout(15000) });
    return stripHtml(await r.text());
  }

  // 1. Scrape the entry page as clean markdown
  let combined = "";
  try {
    combined = `## ${url}\n` + (await firecrawlScrape(url));
  } catch (_) { /* keep going */ }

  // 2. Map the site for menu-like URLs
  let candidates: string[] = [];
  try {
    candidates = await firecrawlMap(url);
  } catch (_) { /* ignore */ }

  const origin = (() => { try { return new URL(url).origin; } catch { return ""; } })();
  const ranked = candidates
    .filter((l) => l && (!origin || l.startsWith(origin)))
    .filter((l) => l.toLowerCase() !== url.toLowerCase())
    .map((l) => {
      const lo = l.toLowerCase();
      const score = MENU_KEYWORDS.reduce((s, k) => s + (lo.includes(k) ? 1 : 0), 0)
        + (lo.endsWith(".pdf") ? 2 : 0);
      return { l, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.l);

  // 3. Scrape top menu pages
  for (const link of ranked) {
    try {
      const md = await firecrawlScrape(link);
      if (md && md.length > 80) combined += `\n\n## ${link}\n${md}`;
      if (combined.length > 40000) break;
    } catch (_) { /* skip */ }
  }

  return combined.slice(0, 45000);
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
        source = await smartScrapeMenu(url);
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
    let parsed: any = {};
    try { parsed = JSON.parse(args); } catch { parsed = {}; }
    const items = (parsed.items || []).slice(0, 200);

    const { data: menu, error: mErr } = await sb.from("menus").insert({
      venue_id,
      name: name || (url ? new URL(url).hostname : "Menu"),
      is_live: is_live !== false,
      source_url: url || null,
      raw_text: text ? text.slice(0, 20000) : null,
    }).select().single();
    if (mErr) return new Response(JSON.stringify({ error: mErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (items.length) {
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
    }

    await sb.from("brain_events").insert({
      venue_id,
      title: `Menu imported · ${menu.name}`,
      reason: `${items.length} items added${url ? ` from ${url}` : " from pasted text"}`,
      severity: items.length ? "success" : "warning",
    });

    return new Response(JSON.stringify({ ok: true, menu, count: items.length, warning: items.length ? null : "No items could be extracted automatically — menu created empty, add items manually." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
