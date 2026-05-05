import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { buildPrompt, buildAgentBody } from "../_shared/agent-config.ts";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function createElAgent(body: any) {
  const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`agent create failed: ${res.status} ${await res.text()}`);
  return (await res.json()).agent_id as string;
}

async function syncElAgent(agentId: string, body: any) {
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.warn("agent sync failed", res.status, await res.text());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { global: { headers: { Authorization: auth } } });
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return new Response(JSON.stringify({ error: "invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { venue_id } = await req.json();
    if (!venue_id) return new Response(JSON.stringify({ error: "venue_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: venue } = await sb.from("venues").select("*").eq("id", venue_id).single();
    if (!venue) return new Response(JSON.stringify({ error: "venue not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [{ data: kb }, { data: bookings }, { data: messages }, { data: events }, { data: insights }] = await Promise.all([
      sb.from("knowledge_base").select("title,content").eq("venue_id", venue_id).limit(30),
      sb.from("bookings").select("guest_name,party_size,booking_time,status,notes").eq("venue_id", venue_id).gte("booking_time", new Date().toISOString()).order("booking_time", { ascending: true }).limit(10),
      sb.from("messages").select("direction,channel,contact,body,created_at").eq("venue_id", venue_id).order("created_at", { ascending: false }).limit(10),
      sb.from("brain_events").select("title,reason,severity,created_at").eq("venue_id", venue_id).order("created_at", { ascending: false }).limit(10),
      sb.from("insights").select("title,body,category,impact,created_at").eq("venue_id", venue_id).order("created_at", { ascending: false }).limit(8),
    ]);

    let { data: agent } = await sb.from("agents").select("*").eq("venue_id", venue_id).eq("kind", "voice").maybeSingle();
    const cfg = agent?.config || {};
    const context = { bookings: bookings || [], messages: messages || [], events: events || [], insights: insights || [] };
    const prompt = buildPrompt(venue, kb || [], cfg, context);
    const body = buildAgentBody(venue, prompt, cfg);

    let agentId = agent?.elevenlabs_agent_id;
    if (!agentId) {
      agentId = await createElAgent(body);
      if (agent) {
        await sb.from("agents").update({ elevenlabs_agent_id: agentId, status: "active", prompt }).eq("id", agent.id);
      } else {
        const { data: inserted } = await sb.from("agents").insert({ venue_id, kind: "voice", name: "Voice Host", elevenlabs_agent_id: agentId, status: "active", prompt }).select().single();
        agent = inserted;
      }
    } else {
      await syncElAgent(agentId, body);
      if (agent && agent.prompt !== prompt) {
        await sb.from("agents").update({ prompt, status: "active" }).eq("id", agent.id);
      }
    }

    const signedUrlRes = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });
    if (!signedUrlRes.ok) {
      const txt = await signedUrlRes.text();
      if (signedUrlRes.status === 429) {
        return new Response(JSON.stringify({
          error: "ElevenLabs is at concurrent-call capacity. End any other active sessions and try again in ~30s.",
          code: "concurrency_limit", retryable: true,
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`signed_url failed: ${signedUrlRes.status} ${txt}`);
    }
    const signedUrlData = await signedUrlRes.json();

    return new Response(JSON.stringify({ signed_url: signedUrlData.signed_url, agent_id: agentId, prompt }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
