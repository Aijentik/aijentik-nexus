// Public webhook called by Twilio when a phone number rings.
// Looks up the agent by the dialed number, asks ElevenLabs to register the
// call, returns TwiML that bridges Twilio <-> ElevenLabs agent over a stream.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const xmlHeaders = { "Content-Type": "text/xml; charset=utf-8" };

function twiml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: xmlHeaders });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Twilio posts application/x-www-form-urlencoded
    const params = req.method === "POST"
      ? new URLSearchParams(await req.text())
      : new URL(req.url).searchParams;

    const from = params.get("From") || "";
    const to = params.get("To") || "";
    const callSid = params.get("CallSid") || "";

    if (!to) return twiml(`<Say>We could not determine the dialed number. Goodbye.</Say><Hangup/>`);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: agent } = await sb
      .from("agents")
      .select("id, venue_id, elevenlabs_agent_id, name")
      .eq("twilio_phone_number", to)
      .maybeSingle();

    if (!agent?.elevenlabs_agent_id) {
      return twiml(`<Say voice="Polly.Joanna">This number is not connected to an A I agent yet. Goodbye.</Say><Hangup/>`);
    }

    // Register the call with ElevenLabs and get back ready-to-use TwiML
    const reg = await fetch("https://api.elevenlabs.io/v1/convai/twilio/register-call", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agent.elevenlabs_agent_id,
        from_number: from,
        to_number: to,
        direction: "inbound",
        conversation_initiation_client_data: {
          dynamic_variables: { caller_number: from, call_sid: callSid },
        },
      }),
    });

    if (!reg.ok) {
      const txt = await reg.text();
      console.error("register-call failed", reg.status, txt);
      // Log brain event for visibility
      await sb.from("brain_events").insert({
        venue_id: agent.venue_id, agent_id: agent.id, severity: "error",
        title: "Twilio call routing failed",
        reason: `register-call ${reg.status}: ${txt.slice(0, 400)}`,
        meta: { from, to, callSid },
      });
      return twiml(`<Say>Sorry, our A I host is unavailable right now. Please try again shortly.</Say><Hangup/>`);
    }

    const result = await reg.json().catch(() => ({} as any));
    const xml: string | undefined = result?.twiml || result?.TwiML;

    // Log inbound call
    await sb.from("calls").insert({
      venue_id: agent.venue_id, agent_id: agent.id, caller: from,
      conversation_id: callSid, summary: "Inbound Twilio call routed to AI agent",
    });
    await sb.from("brain_events").insert({
      venue_id: agent.venue_id, agent_id: agent.id, severity: "success",
      title: `Inbound call routed to ${agent.name}`,
      reason: `Caller ${from} → ${to}`, meta: { from, to, callSid },
    });

    if (xml) {
      // ElevenLabs returns a complete TwiML document — return as-is
      return new Response(xml, { headers: xmlHeaders });
    }

    // Fallback: stream URL pattern
    const streamUrl: string | undefined = result?.stream_url || result?.streamUrl;
    if (streamUrl) {
      return twiml(`<Connect><Stream url="${streamUrl}"/></Connect>`);
    }

    console.error("register-call: unexpected response", result);
    return twiml(`<Say>Sorry, our A I host could not start the call.</Say><Hangup/>`);
  } catch (e) {
    console.error("[twilio-voice-webhook] error", e);
    return twiml(`<Say>An unexpected error occurred. Goodbye.</Say><Hangup/>`);
  }
});
