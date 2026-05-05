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
    .slice(0, 12000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { global: { headers: { Authorization: auth } } });

    const { venue_id, url } = await req.json();
    if (!venue_id || !url) return new Response(JSON.stringify({ error: "venue_id and url required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let pageText = "";
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 AijentikBot" }, signal: AbortSignal.timeout(15000) });
      const html = await r.text();
      pageText = stripHtml(html);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Could not fetch website: " + String(e) }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (pageText.length < 100) {
      return new Response(JSON.stringify({ error: "Page contained no readable text" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Extract structured venue knowledge. Reply ONLY using the extract_venue tool. Be specific, concise, accurate. Do not invent facts." },
          { role: "user", content: `Website content:\n\n${pageText}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_venue",
            description: "Extract structured info from a hospitality website",
            parameters: {
              type: "object",
              required: ["entries"],
              properties: {
                description: { type: "string" },
                cuisine: { type: "string" },
                tone: { type: "string", description: "Brand tone of voice in 5-8 words" },
                hours: { type: "string", description: "Opening hours as plain text" },
                entries: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["title", "category", "content"],
                    properties: {
                      title: { type: "string" },
                      category: { type: "string", enum: ["menu", "hours", "policy", "faq", "about", "contact", "events"] },
                      content: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_venue" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      return new Response(JSON.stringify({ error: "AI: " + aiRes.status, details: t.slice(0, 200) }), { status: aiRes.status === 429 ? 429 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await aiRes.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return new Response(JSON.stringify({ error: "no extraction" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const parsed = JSON.parse(args);
    const entries = (parsed.entries || []).slice(0, 30);

    if (entries.length) {
      await sb.from("knowledge_base").insert(
        entries.map((e: any) => ({ venue_id, title: e.title, category: e.category, content: e.content, tags: ["scraped"] }))
      );
    }

    // Patch venue with discovered fields if available and currently empty
    const venueUpdates: any = {};
    if (parsed.description) venueUpdates.description = parsed.description;
    if (parsed.cuisine) venueUpdates.cuisine = parsed.cuisine;
    if (parsed.tone) venueUpdates.brand_voice = parsed.tone;
    if (Object.keys(venueUpdates).length) {
      await sb.from("venues").update(venueUpdates).eq("id", venue_id);
    }

    await sb.from("brain_events").insert({
      venue_id,
      title: "Website learned",
      reason: `Imported ${entries.length} knowledge entries from ${url}`,
      severity: "success",
    });

    return new Response(JSON.stringify({ ok: true, count: entries.length, parsed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
