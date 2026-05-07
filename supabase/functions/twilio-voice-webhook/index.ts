// Public webhook called by Twilio when a phone number rings.
// Looks up the agent by the dialed number, gets a signed WebSocket URL from
// ElevenLabs, and returns TwiML that bridges Twilio Media Streams <-> ElevenLabs.
//
// NOTE on background ambience for phone calls:
// ElevenLabs' Twilio media-stream bridge replaces the call audio with the
// agent's TTS output, so we cannot directly mix a "busy venue" ambient track
// in here. To add ambience on real phone calls we'd need to insert our own
// WebSocket proxy between Twilio <Stream> and ElevenLabs that mixes a looped
// ambient PCM clip into each outbound audio frame. Browser test calls
// (src/pages/VoiceLive.tsx) already loop /ambience-venue.mp3 client-side at
// low volume to give the same effect during testing.
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

    // Bridge Twilio to our own WebSocket mixer (which talks to ElevenLabs and
    // mixes a looped venue ambience under the agent's voice). This replaces
    // the previous ElevenLabs register-call path so we control the audio path.
    const callerCtx = await buildCallerContext(sb, agent.venue_id, from);
    const venueRow = (await sb.from("venues").select("name").eq("id", agent.venue_id).single()).data;
    const venueName = venueRow?.name || "us";

    // Supabase's WebSocket gateway requires an apikey query param even when verify_jwt=false.
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const wsUrl = `wss://${SUPABASE_URL.replace(/^https?:\/\//, "")}/functions/v1/twilio-stream-mixer?agent_id=${encodeURIComponent(elevenlabsAgentId)}&apikey=${encodeURIComponent(ANON_KEY)}`;
    const streamParams = [
      ["caller_first_name", callerCtx.caller_first_name || ""],
      ["caller_known", callerCtx.caller_known || "no"],
      ["venue_name", venueName],
      ["call_sid", callSid],
    ]
      .map(([k, v]) => `<Parameter name="${escapeXml(k)}" value="${escapeXml(String(v))}"/>`)
      .join("");
    const twilioXml = `<Connect><Stream url="${escapeXml(wsUrl)}">${streamParams}</Stream></Connect>`;

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
