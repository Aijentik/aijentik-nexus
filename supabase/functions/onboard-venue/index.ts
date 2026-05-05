import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function ai(messages: any[], json = false) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return new Response(JSON.stringify({ error: "invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = u.user.id;

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { name, website, venue_type, cuisine, city, phone } = await req.json();
    if (!name) return new Response(JSON.stringify({ error: "name required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: run } = await sb.from("onboarding_runs").insert({ user_id: userId, input: { name, website, venue_type, cuisine, city, phone }, steps: [] }).select().single();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: any) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        try {
          send({ step: "research", message: `Researching ${name}…` });
          const research = await ai([
            { role: "system", content: "You are a hospitality researcher. Return concise JSON with venue details. Invent realistic plausible details if not provided." },
            { role: "user", content: `Build a JSON profile for this venue:\nName: ${name}\nWebsite: ${website || "n/a"}\nType: ${venue_type || "restaurant"}\nCuisine: ${cuisine || "modern"}\nCity: ${city || ""}\nPhone: ${phone || ""}\n\nReturn keys: description (1-2 sentences), brand_voice (short phrase), capacity (int), address (string), country (string), hours (object mon..sun → "HH:MM-HH:MM" or "closed").` },
          ], true);
          const profile = JSON.parse(research);
          send({ step: "research", message: "Venue profile compiled.", data: profile });

          send({ step: "venue", message: "Creating venue workspace…" });
          const { data: venue } = await sb.from("venues").insert({
            owner_id: userId,
            name, venue_type: venue_type || "restaurant", cuisine, phone, website, city,
            address: profile.address, country: profile.country, capacity: profile.capacity || 60,
            hours: profile.hours || {}, brand_voice: profile.brand_voice, description: profile.description,
          }).select().single();
          await sb.from("user_roles").insert({ user_id: userId, venue_id: venue.id, role: "owner" });
          await sb.from("profiles").update({ current_venue_id: venue.id }).eq("user_id", userId);
          send({ step: "venue", message: `Venue "${venue.name}" created.`, venue_id: venue.id });

          send({ step: "knowledge", message: "Generating knowledge base…" });
          const kbRaw = await ai([
            { role: "system", content: "You build operational knowledge bases for hospitality venues. Return strict JSON." },
            { role: "user", content: `Create a knowledge base for ${name}. Return JSON: { entries: [{category, title, content, tags:[]}] } with 8-12 entries covering: hours, dress code, parking, reservation policy, cancellation, dietary, signature dishes, seating policy, group bookings, private events, accessibility, gift cards.` },
          ], true);
          const kb = JSON.parse(kbRaw).entries || [];
          for (const e of kb) {
            await sb.from("knowledge_base").insert({ venue_id: venue.id, category: e.category, title: e.title, content: e.content, tags: e.tags || [] });
          }
          send({ step: "knowledge", message: `${kb.length} knowledge entries written.` });

          send({ step: "agents", message: "Spinning up AI agents…" });
          await sb.from("agents").insert([
            { venue_id: venue.id, kind: "voice", name: "Voice Host", status: "active", prompt: "Primary phone-answering host." },
            { venue_id: venue.id, kind: "booking", name: "Booking Concierge", status: "active", prompt: "Handles reservation logic & diary." },
            { venue_id: venue.id, kind: "ops", name: "Ops Brain", status: "active", prompt: "Watches diary, alerts on conflicts, suggests staffing." },
            { venue_id: venue.id, kind: "marketing", name: "Marketing Studio", status: "idle", prompt: "Drafts campaigns from booking trends." },
            { venue_id: venue.id, kind: "concierge", name: "Guest Concierge", status: "active", prompt: "Pre/post-arrival follow-up via SMS." },
          ]);
          send({ step: "agents", message: "5 agents online." });

          send({ step: "brain", message: "Live Brain online." });
          await sb.from("brain_events").insert([
            { venue_id: venue.id, title: "Operating system online", reason: `${venue.name} is live. Voice host ready to answer calls.`, severity: "success" },
            { venue_id: venue.id, title: "Knowledge indexed", reason: `${kb.length} entries embedded into agent memory.`, severity: "info" },
          ]);

          send({ step: "done", message: "Build complete.", venue_id: venue.id });
          await sb.from("onboarding_runs").update({ status: "complete", venue_id: venue.id, completed_at: new Date().toISOString() }).eq("id", run.id);
        } catch (e) {
          send({ step: "error", message: String(e) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
