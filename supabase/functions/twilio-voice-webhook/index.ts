// Public webhook called by Twilio when a phone number rings.
// Looks up the agent by the dialed number, gets a signed WebSocket URL from
// ElevenLabs, and returns TwiML that bridges Twilio Media Streams <-> ElevenLabs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { buildPrompt, buildAgentBody, buildCallerContext } from "../_shared/agent-config.ts";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const xmlHeaders = { "Content-Type": "text/xml; charset=utf-8" };

async function provisionElevenLabsAgent(sb: any, agent: any) {
  const [{ data: venue }, { data: kb }] = await Promise.all([
    sb.from("venues").select("*").eq("id", agent.venue_id).single(),
    sb.from("knowledge_base").select("title,content").eq("venue_id", agent.venue_id).limit(30),
  ]);
  if (!venue) throw new Error("venue not found for linked voice agent");
  const cfg = agent.config || {};
  const prompt = buildPrompt(venue, kb || [], cfg);
  const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(buildAgentBody(venue, prompt, cfg)),
  });
  if (!res.ok) throw new Error(`ElevenLabs agent create failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  await sb.from("agents").update({ elevenlabs_agent_id: data.agent_id, status: "active", prompt }).eq("id", agent.id);
  return data.agent_id;
}

function twiml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: xmlHeaders });
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const params = req.method === "POST"
      ? new URLSearchParams(await req.text())
      : new URL(req.url).searchParams;

    const from = params.get("From") || "";
    const to = params.get("To") || "";
    const callSid = params.get("CallSid") || "";

    console.log("[twilio-voice-webhook] incoming", { from, to, callSid });

    if (!to) return twiml(`<Say>We could not determine the dialed number. Goodbye.</Say><Hangup/>`);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Try exact match first, then loose match (strip non-digits) as a safety net
    let { data: agent } = await sb
      .from("agents")
      .select("id, venue_id, elevenlabs_agent_id, name, twilio_phone_number, config")
      .eq("twilio_phone_number", to)
      .maybeSingle();

    if (!agent) {
      const digits = to.replace(/\D/g, "");
      const { data: all } = await sb
        .from("agents")
        .select("id, venue_id, elevenlabs_agent_id, name, twilio_phone_number, config")
        .not("twilio_phone_number", "is", null);
      agent = (all || []).find((a: any) => (a.twilio_phone_number || "").replace(/\D/g, "") === digits) || null;
    }

    if (!agent) {
      console.error("[twilio-voice-webhook] no agent linked to", to);
      return twiml(`<Say voice="Polly.Joanna">This number is not linked to an A I host yet. Goodbye.</Say><Hangup/>`);
    }

    let elevenlabsAgentId = agent.elevenlabs_agent_id;
    if (!elevenlabsAgentId) {
      console.error("[twilio-voice-webhook] agent has no elevenlabs_agent_id", agent.id);
      try {
        elevenlabsAgentId = await provisionElevenLabsAgent(sb, agent);
        await sb.from("brain_events").insert({
          venue_id: agent.venue_id, agent_id: agent.id, severity: "success",
          title: "Voice host auto-provisioned for inbound call",
          reason: `Created the ElevenLabs agent when ${to} rang.`,
          meta: { from, to, callSid },
        });
      } catch (e) {
        console.error("[twilio-voice-webhook] auto-provision failed", e);
        await sb.from("brain_events").insert({
          venue_id: agent.venue_id, agent_id: agent.id, severity: "error",
          title: "Inbound call rejected — voice agent provisioning failed",
          reason: String(e).slice(0, 500),
          meta: { from, to, callSid },
        });
        return twiml(`<Say voice="Polly.Joanna">The A I host is still being set up. Please try again in a moment. Goodbye.</Say><Hangup/>`);
      }
    }

    // Register the Twilio call with ElevenLabs and return their TwiML directly.
    // A browser signed_url is not a Twilio media-stream bridge and causes calls to hang up.
    let twilioXml: string | undefined;
    try {
      const reg = await fetch("https://api.elevenlabs.io/v1/convai/twilio/register-call", {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: elevenlabsAgentId,
          from_number: from,
          to_number: to,
          direction: "inbound",
          conversation_initiation_client_data: {
            dynamic_variables: { caller_number: from, twilio_call_sid: callSid },
          },
        }),
      });
      if (reg.ok) {
        const text = await reg.text();
        if (text.trim().startsWith("<")) {
          twilioXml = text;
        } else {
          const result = JSON.parse(text || "{}");
          twilioXml = result?.twiml || result?.TwiML || result?.xml;
        }
      } else {
        const txt = await reg.text();
        console.error("[twilio-voice-webhook] register-call non-200", reg.status, txt);
        await sb.from("brain_events").insert({
          venue_id: agent.venue_id, agent_id: agent.id, severity: "error",
          title: "Inbound call routing failed",
          reason: `ElevenLabs register-call ${reg.status}: ${txt.slice(0, 400)}`,
          meta: { from, to, callSid, elevenlabsAgentId },
        });
      }
    } catch (e) {
      console.error("[twilio-voice-webhook] register-call error", e);
    }

    if (!twilioXml) {
      return twiml(`<Say>Sorry, our A I host is unavailable right now. Please try again shortly.</Say><Hangup/>`);
    }

    // Log the call + brain event
    await sb.from("calls").insert({
      venue_id: agent.venue_id, agent_id: agent.id, caller: from,
      conversation_id: callSid, summary: "Inbound Twilio call routed to AI agent",
    });
    await sb.from("brain_events").insert({
      venue_id: agent.venue_id, agent_id: agent.id, severity: "success",
      title: `Inbound call routed to ${agent.name}`,
      reason: `Caller ${from} → ${to}`, meta: { from, to, callSid },
    });

    return new Response(twilioXml.includes("<Response") ? twilioXml : `<?xml version="1.0" encoding="UTF-8"?><Response>${twilioXml}</Response>`, { headers: xmlHeaders });
  } catch (e) {
    console.error("[twilio-voice-webhook] error", e);
    return twiml(`<Say>An unexpected error occurred. Goodbye.</Say><Hangup/>`);
  }
});
