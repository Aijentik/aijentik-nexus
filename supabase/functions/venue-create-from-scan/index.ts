// Create venue, knowledge base, and agents from a confirmed deep-scan profile.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const { profile } = await req.json();
    if (!profile?.name) return new Response(JSON.stringify({ error: "profile.name required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: venue, error: vErr } = await sb.from("venues").insert({
      owner_id: userId,
      name: profile.name,
      venue_type: profile.venue_type || "restaurant",
      cuisine: profile.cuisine || null,
      phone: profile.phone || null,
      website: profile.source_url || null,
      city: profile.city || null,
      address: profile.address || null,
      country: profile.country || null,
      capacity: profile.capacity_estimate || 60,
      hours: profile.hours || {},
      brand_voice: profile.brand_voice || null,
      description: profile.description || null,
    }).select().single();
    if (vErr) throw vErr;

    await sb.from("user_roles").insert({ user_id: userId, venue_id: venue.id, role: "owner" });
    await sb.from("profiles").update({ current_venue_id: venue.id }).eq("user_id", userId);

    const kb = (profile.knowledge || []) as any[];
    if (kb.length) {
      await sb.from("knowledge_base").insert(kb.map((e) => ({
        venue_id: venue.id, title: e.title, category: e.category, content: e.content, tags: ["scanned"],
      })));
    }

    // Persist policies as KB entries too
    const pol = profile.policies || {};
    const polEntries = Object.entries(pol).filter(([_, v]) => !!v).map(([k, v]) => ({
      venue_id: venue.id, title: `${k.replace(/_/g, " ")} policy`, category: "policy", content: String(v), tags: ["policy"],
    }));
    if (polEntries.length) await sb.from("knowledge_base").insert(polEntries);

    await sb.from("agents").insert([
      { venue_id: venue.id, kind: "voice", name: "Voice Host", status: "active", prompt: `Primary phone-answering host for ${venue.name}. Tone: ${profile.brand_voice || "warm and professional"}.` },
      { venue_id: venue.id, kind: "booking", name: "Booking Concierge", status: "active", prompt: "Handles reservation logic & diary." },
      { venue_id: venue.id, kind: "ops", name: "Ops Brain", status: "active", prompt: "Watches diary, alerts on conflicts, suggests staffing." },
      { venue_id: venue.id, kind: "marketing", name: "Marketing Studio", status: "idle", prompt: "Drafts campaigns from booking trends." },
      { venue_id: venue.id, kind: "concierge", name: "Guest Concierge", status: "active", prompt: "Pre/post-arrival follow-up via SMS." },
    ]);

    await sb.from("brain_events").insert([
      { venue_id: venue.id, title: "Venue scanned & launched", reason: `Imported ${kb.length} knowledge entries from ${profile.source_url || "manual setup"}.`, severity: "success" },
      { venue_id: venue.id, title: "Voice Host online", reason: `${venue.name} is ready to answer calls.`, severity: "info" },
    ]);

    return new Response(JSON.stringify({ venue_id: venue.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
