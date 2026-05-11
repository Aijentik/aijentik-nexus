// Deep website scan for venue onboarding.
// Streams SSE events while fetching the homepage + key subpages,
// detecting platforms, then extracting structured venue intelligence with AI.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function strip(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absolutize(href: string, base: string): string | null {
  try { return new URL(href, base).toString(); } catch { return null; }
}

function extractLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  const re = /<a[^>]+href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = absolutize(m[1], base);
    if (u) out.add(u);
  }
  return [...out];
}

const PLATFORMS: { id: string; name: string; category: string; patterns: RegExp[] }[] = [
  { id: "opentable",   name: "OpenTable",   category: "Bookings", patterns: [/opentable\.com/i] },
  { id: "resy",        name: "Resy",        category: "Bookings", patterns: [/resy\.com/i] },
  { id: "sevenrooms",  name: "SevenRooms",  category: "Bookings", patterns: [/sevenrooms\.com/i] },
  { id: "tock",        name: "Tock",        category: "Bookings", patterns: [/exploretock\.com/i, /tockify/i] },
  { id: "eveve",       name: "Eveve",       category: "Bookings", patterns: [/eveve\.com/i] },
  { id: "quandoo",     name: "Quandoo",     category: "Bookings", patterns: [/quandoo\./i] },
  { id: "designmynight", name: "DesignMyNight", category: "Bookings", patterns: [/designmynight\.com/i] },
  { id: "dishcult",    name: "Dishcult",    category: "Bookings", patterns: [/dishcult\.com/i] },
  { id: "toast",       name: "Toast POS",   category: "POS", patterns: [/toasttab\.com/i] },
  { id: "square",      name: "Square",      category: "POS", patterns: [/squareup\.com/i] },
  { id: "deliveroo",   name: "Deliveroo",   category: "Delivery", patterns: [/deliveroo\./i] },
  { id: "ubereats",    name: "Uber Eats",   category: "Delivery", patterns: [/ubereats\.com/i] },
  { id: "doordash",    name: "DoorDash",    category: "Delivery", patterns: [/doordash\.com/i] },
  { id: "justeat",     name: "Just Eat",    category: "Delivery", patterns: [/just-?eat\./i] },
  { id: "mailchimp",   name: "Mailchimp",   category: "Marketing", patterns: [/mailchimp\.com/i, /mc\.us\d+\.list-manage/i] },
  { id: "klaviyo",     name: "Klaviyo",     category: "Marketing", patterns: [/klaviyo\.com/i] },
  { id: "shopify",     name: "Shopify",     category: "E-commerce", patterns: [/cdn\.shopify\.com/i, /myshopify\.com/i] },
  { id: "squarespace", name: "Squarespace", category: "Website", patterns: [/squarespace\.com/i, /static1\.squarespace/i] },
  { id: "wix",         name: "Wix",         category: "Website", patterns: [/wixstatic\.com/i, /wix\.com/i] },
  { id: "wordpress",   name: "WordPress",   category: "Website", patterns: [/wp-content/i, /wp-includes/i] },
  { id: "instagram",   name: "Instagram",   category: "Social", patterns: [/instagram\.com\//i] },
  { id: "facebook",    name: "Facebook",    category: "Social", patterns: [/facebook\.com\//i] },
  { id: "tiktok",      name: "TikTok",      category: "Social", patterns: [/tiktok\.com\//i] },
  { id: "tripadvisor", name: "Tripadvisor", category: "Reviews", patterns: [/tripadvisor\./i] },
  { id: "google_maps", name: "Google Maps", category: "Listings", patterns: [/maps\.google\./i, /goo\.gl\/maps/i, /maps\.app\.goo/i] },
  { id: "yelp",        name: "Yelp",        category: "Reviews", patterns: [/yelp\.com/i] },
  { id: "stripe",      name: "Stripe",      category: "Payments", patterns: [/js\.stripe\.com/i, /checkout\.stripe/i] },
];

function detectPlatforms(text: string) {
  const found = new Map<string, any>();
  for (const p of PLATFORMS) {
    if (p.patterns.some((r) => r.test(text))) {
      found.set(p.id, { id: p.id, name: p.name, category: p.category });
    }
  }
  return [...found.values()];
}

function classifyLink(href: string): string | null {
  const h = href.toLowerCase();
  if (/menu|food|drinks|wine|cocktail/.test(h)) return "menu";
  if (/book|reserv|table/.test(h)) return "book";
  if (/about|story|team/.test(h)) return "about";
  if (/contact|find|location/.test(h)) return "contact";
  if (/event|private|hire|party/.test(h)) return "events";
  if (/faq|help|policy|policies|terms/.test(h)) return "faq";
  return null;
}

async function fetchPage(url: string, timeoutMs = 12000): Promise<{ html: string; status: number } | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AijentikScanBot/1.0)" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!r.ok) return { html: "", status: r.status };
    const html = await r.text();
    return { html, status: r.status };
  } catch { return null; }
}

// Extract <img> tags + nearby text from raw HTML so the AI can pair dishes with photos.
function extractImageCandidates(html: string, base: string): { url: string; alt: string; nearby: string }[] {
  const out: { url: string; alt: string; nearby: string }[] = [];
  const re = /<img[^>]+>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 60) {
    const tag = m[0];
    const srcM = tag.match(/(?:data-src|src)=["']([^"']+)["']/i);
    if (!srcM) continue;
    const abs = absolutize(srcM[1], base);
    if (!abs) continue;
    if (/sprite|icon|logo|favicon|pixel|spacer|placeholder|\.svg(\?|$)/i.test(abs)) continue;
    const altM = tag.match(/alt=["']([^"']+)["']/i);
    const start = Math.max(0, m.index - 240);
    const end = Math.min(html.length, m.index + tag.length + 240);
    const nearby = strip(html.slice(start, end)).slice(0, 280);
    out.push({ url: abs, alt: altM?.[1] || "", nearby });
  }
  return out;
}

async function extractWithAI(payload: any) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are a hospitality intelligence engine. Extract a complete operational profile from raw website text. Be precise. Do not invent facts — leave fields empty if not present. Always reply via the build_venue_profile tool." },
        { role: "user", content: `Build a structured profile for this venue.\n\nDETECTED PLATFORMS: ${JSON.stringify(payload.platforms)}\n\nPAGES:\n${payload.pages.map((p: any) => `--- ${p.kind.toUpperCase()} (${p.url}) ---\n${p.text}`).join("\n\n").slice(0, 28000)}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "build_venue_profile",
          description: "Structured venue intelligence",
          parameters: {
            type: "object",
            required: ["name", "venue_type", "knowledge", "gaps", "suggested_integrations"],
            properties: {
              name: { type: "string" },
              tagline: { type: "string" },
              description: { type: "string", description: "1–2 sentence venue description" },
              brand_voice: { type: "string", description: "5–10 word tone of voice" },
              venue_type: { type: "string", enum: ["restaurant", "bar", "cafe", "hotel", "club"] },
              cuisine: { type: "string" },
              city: { type: "string" },
              country: { type: "string" },
              address: { type: "string" },
              phone: { type: "string" },
              email: { type: "string" },
              capacity_estimate: { type: "number" },
              hours_text: { type: "string", description: "Plain-text opening hours" },
              hours: {
                type: "object",
                properties: {
                  mon: { type: "string" }, tue: { type: "string" }, wed: { type: "string" },
                  thu: { type: "string" }, fri: { type: "string" }, sat: { type: "string" }, sun: { type: "string" },
                },
              },
              signature_dishes: { type: "array", items: { type: "string" } },
              dress_code: { type: "string" },
              dietary_options: { type: "array", items: { type: "string" } },
              policies: {
                type: "object",
                properties: {
                  cancellation: { type: "string" },
                  deposit: { type: "string" },
                  no_show: { type: "string" },
                  large_groups: { type: "string" },
                  children: { type: "string" },
                  dogs: { type: "string" },
                },
              },
              knowledge: {
                type: "array",
                description: "8–16 knowledge base entries the AI host should know",
                items: {
                  type: "object",
                  required: ["title", "category", "content"],
                  properties: {
                    title: { type: "string" },
                    category: { type: "string", enum: ["menu", "hours", "policy", "faq", "about", "contact", "events", "drinks"] },
                    content: { type: "string" },
                  },
                },
              },
              gaps: {
                type: "array",
                description: "Operational gaps with a one-click AI fix",
                items: {
                  type: "object",
                  required: ["id", "title", "severity", "suggested_fix"],
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    severity: { type: "string", enum: ["low", "medium", "high"] },
                    suggested_fix: { type: "string", description: "Ready-to-add knowledge entry or policy text" },
                    apply_as: { type: "string", enum: ["knowledge", "policy", "field"], description: "How to apply the fix" },
                    field: { type: "string", description: "If apply_as=field, the venue field to set" },
                  },
                },
              },
              suggested_integrations: {
                type: "array",
                description: "Integrations the venue should add based on what was detected (or absent)",
                items: {
                  type: "object",
                  required: ["name", "category", "reason"],
                  properties: {
                    name: { type: "string" },
                    category: { type: "string" },
                    reason: { type: "string" },
                    detected: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "build_venue_profile" } },
    }),
  });
  if (!res.ok) throw new Error("AI " + res.status + ": " + (await res.text()).slice(0, 200));
  const j = await res.json();
  const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("no extraction");
  return JSON.parse(args);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { url: rawUrl } = await req.json();
  if (!rawUrl) return new Response(JSON.stringify({ error: "url required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let startUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(startUrl)) startUrl = "https://" + startUrl;
  let origin: string;
  try { origin = new URL(startUrl).origin; } catch { return new Response(JSON.stringify({ error: "invalid url" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (ev: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
      try {
        send({ stage: "fetch", message: `Connecting to ${new URL(startUrl).host}…` });
        const home = await fetchPage(startUrl);
        if (!home || !home.html) { send({ stage: "error", message: "Could not reach the website. Try the manual builder." }); controller.close(); return; }
        send({ stage: "fetch", message: `Homepage loaded (${Math.round(home.html.length / 1024)}kb).`, ok: true });

        const allLinks = extractLinks(home.html, startUrl).filter((u) => u.startsWith(origin));
        const platforms = detectPlatforms(home.html);
        if (platforms.length) send({ stage: "platforms", message: `Detected ${platforms.length} platforms.`, platforms });

        // Pick up to 1 link per category
        const buckets = new Map<string, string>();
        for (const l of allLinks) {
          const k = classifyLink(l);
          if (k && !buckets.has(k)) buckets.set(k, l);
          if (buckets.size >= 6) break;
        }

        const pages: { url: string; kind: string; text: string }[] = [
          { url: startUrl, kind: "home", text: strip(home.html).slice(0, 6000) },
        ];

        for (const [kind, link] of buckets) {
          send({ stage: "page", message: `Reading ${kind} page…`, kind, url: link });
          const p = await fetchPage(link);
          if (p && p.html) {
            const text = strip(p.html).slice(0, 6000);
            pages.push({ url: link, kind, text });
            const more = detectPlatforms(p.html);
            for (const m of more) if (!platforms.find((x) => x.id === m.id)) platforms.push(m);
            send({ stage: "page", message: `${kind} captured (${text.length} chars).`, kind, url: link, ok: true });
          } else {
            send({ stage: "page", message: `${kind} page unreachable.`, kind, url: link, ok: false });
          }
        }

        if (platforms.length) send({ stage: "platforms", message: "Platform scan complete.", platforms });

        send({ stage: "ai", message: "Extracting brand voice, menu, policies & gaps…" });
        const profile = await extractWithAI({ pages, platforms });
        profile.source_url = startUrl;
        profile.detected_platforms = platforms;
        send({ stage: "ai", message: "Profile compiled.", ok: true });
        send({ stage: "complete", message: "Scan complete.", profile });
      } catch (e) {
        send({ stage: "error", message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
});
