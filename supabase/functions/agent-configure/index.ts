// Saves agent.config to the database AND immediately syncs the configuration
// to the linked ElevenLabs Conversational AI agent so changes are live.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { buildPrompt, buildAgentBody, type AgentConfig } from "../_shared/agent-config.ts";

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
  const data = await res.json();
  return data.agent_id as string;
}

async function patchElAgent(agentId: string, body: any) {
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`agent patch failed: ${res.status} ${await res.text()}`);
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

    const { agent_id, config } = await req.json();
    if (!agent_id || !config) return new Response(JSON.stringify({ error: "agent_id and config required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: agent, error: aErr } = await sb.from("agents").select("*").eq("id", agent_id).single();
    if (aErr || !agent) throw new Error("agent not found");

    const { data: venue } = await sb.from("venues").select("*").eq("id", agent.venue_id).single();
    if (!venue) throw new Error("venue not found");
    const { data: kb } = await sb.from("knowledge_base").select("title,content").eq("venue_id", agent.venue_id).limit(30);

    const cfg = config as AgentConfig;
    const prompt = buildPrompt(venue, kb || [], cfg);
    const body = buildAgentBody(venue, prompt, cfg);

    let elevenlabsAgentId = agent.elevenlabs_agent_id;
    if (agent.kind === "voice") {
      if (!elevenlabsAgentId) {
        elevenlabsAgentId = await createElAgent(body);
      } else {
        await patchElAgent(elevenlabsAgentId, body);
      }
    }

    await sb.from("agents").update({
      config: cfg,
      prompt,
      elevenlabs_agent_id: elevenlabsAgentId,
      status: "active",
    }).eq("id", agent.id);

    await sb.from("brain_events").insert({
      venue_id: agent.venue_id,
      agent_id: agent.id,
      severity: "success",
      title: `${agent.name} configuration updated`,
      reason: "Owner updated agent configuration — synced to live voice agent.",
      meta: { keys: Object.keys(cfg) },
    });

    return new Response(JSON.stringify({ ok: true, elevenlabs_agent_id: elevenlabsAgentId, prompt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[agent-configure] error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
