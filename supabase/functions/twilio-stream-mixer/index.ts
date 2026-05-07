// Twilio <Stream> ⇄ ElevenLabs ConvAI bridge with venue ambience mixing.
//
// Twilio connects here over WebSocket using <Connect><Stream url="wss://.../twilio-stream-mixer?agent_id=..."/> </Connect>.
// We open a second WS to ElevenLabs ConvAI (8kHz μ-law in/out) and:
//   - forward caller audio frames straight to ElevenLabs
//   - on every outbound audio frame from ElevenLabs, MIX a looping low-volume
//     "busy venue" ambience track in (μ-law decode → linear → add → re-encode)
//     before sending it to Twilio. This gives real phone callers the same
//     subtle background as the browser test.

import { AMBIENCE_ULAW_B64 } from "./ambience-data.ts";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;

// ── μ-law codec ─────────────────────────────────────────────────────────────
const BIAS = 0x84;
const CLIP = 32635;
function ulawToLinear(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + BIAS) << exponent;
  sample -= BIAS;
  return sign ? -sample : sample;
}
function linearToUlaw(sample: number): number {
  let sign = 0;
  if (sample < 0) { sample = -sample; sign = 0x80; }
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

// Decode the embedded ambience once at boot.
const AMB_BYTES = (() => {
  const bin = atob(AMBIENCE_ULAW_B64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
})();
console.log("[twilio-stream-mixer] ambience bytes:", AMB_BYTES.length);

// Mix a Twilio audio payload (base64 μ-law) with the ambience loop.
// AMBIENT_GAIN keeps it well under the agent's voice (~10%).
const AMBIENT_GAIN = 0.10;
function mixWithAmbience(b64Payload: string, ambIdxRef: { i: number }): string {
  const bin = atob(b64Payload);
  const out = new Uint8Array(bin.length);
  for (let n = 0; n < bin.length; n++) {
    const voice = ulawToLinear(bin.charCodeAt(n));
    const amb = ulawToLinear(AMB_BYTES[ambIdxRef.i]);
    ambIdxRef.i = (ambIdxRef.i + 1) % AMB_BYTES.length;
    let mixed = voice + Math.round(amb * AMBIENT_GAIN);
    if (mixed > 32767) mixed = 32767;
    if (mixed < -32768) mixed = -32768;
    out[n] = linearToUlaw(mixed);
  }
  // base64 encode
  let s = "";
  for (let i = 0; i < out.length; i++) s += String.fromCharCode(out[i]);
  return btoa(s);
}

// ── Server ──────────────────────────────────────────────────────────────────
Deno.serve((req) => {
  const url = new URL(req.url);
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("twilio-stream-mixer ready", { status: 200 });
  }

  const agentId = url.searchParams.get("agent_id");
  if (!agentId) return new Response("missing agent_id", { status: 400 });

  console.log("[mixer] upgrade request", {
    agent_id: agentId,
    sec_proto: req.headers.get("sec-websocket-protocol"),
    sec_ver: req.headers.get("sec-websocket-version"),
    ua: req.headers.get("user-agent"),
  });

  // Twilio offers a subprotocol on its Media Streams handshake. If we don't
  // echo one back, some intermediaries (Cloudflare in front of Supabase) will
  // 502 the upgrade. Honor whatever the client sent.
  const offered = (req.headers.get("sec-websocket-protocol") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const upgradeOpts = offered.length ? { protocol: offered[0] } : undefined;
  const { socket: twilioWs, response } = Deno.upgradeWebSocket(req, upgradeOpts);

  let elWs: WebSocket | null = null;
  let streamSid: string | null = null;
  const ambIdx = { i: 0 };
  let elReady = false;
  const pending: string[] = []; // caller audio queued before EL ready

  const connectEleven = (callerCtx: Record<string, unknown>) => {
    // Get a signed URL for the agent then connect.
    fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    })
      .then((r) => r.json())
      .then(({ signed_url }) => {
        if (!signed_url) throw new Error("no signed_url from elevenlabs");
        elWs = new WebSocket(signed_url);
        elWs.onopen = () => {
          console.log("[mixer] elevenlabs ws open");
          elWs!.send(JSON.stringify({
            type: "conversation_initiation_client_data",
            dynamic_variables: callerCtx,
          }));
        };
        elWs.onmessage = (ev) => {
          let msg: any;
          try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch { return; }
          if (msg.type === "conversation_initiation_metadata") {
            elReady = true;
            // Flush any caller audio captured while EL was warming up.
            for (const p of pending) elWs!.send(JSON.stringify({ user_audio_chunk: p }));
            pending.length = 0;
            return;
          }
          if (msg.type === "audio") {
            const b64 = msg.audio_event?.audio_base_64 || msg.audio_base_64;
            if (!b64 || !streamSid || twilioWs.readyState !== WebSocket.OPEN) return;
            const mixed = mixWithAmbience(b64, ambIdx);
            twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: mixed } }));
            return;
          }
          if (msg.type === "interruption" && streamSid && twilioWs.readyState === WebSocket.OPEN) {
            twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
            return;
          }
          if (msg.type === "ping" && msg.ping_event?.event_id != null) {
            elWs!.send(JSON.stringify({ type: "pong", event_id: msg.ping_event.event_id }));
            return;
          }
        };
        elWs.onerror = (e) => console.error("[mixer] el error", e);
        elWs.onclose = () => {
          console.log("[mixer] el closed");
          try { twilioWs.close(); } catch {}
        };
      })
      .catch((e) => {
        console.error("[mixer] failed to connect EL", e);
        try { twilioWs.close(); } catch {}
      });
  };

  twilioWs.onopen = () => console.log("[mixer] twilio ws open");
  twilioWs.onmessage = (ev) => {
    let msg: any;
    try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch { return; }
    switch (msg.event) {
      case "start": {
        streamSid = msg.start?.streamSid || msg.streamSid;
        const customParams = msg.start?.customParameters || {};
        console.log("[mixer] start", { streamSid, customParams });
        connectEleven({
          caller_first_name: customParams.caller_first_name || "",
          caller_known: customParams.caller_known || "no",
          venue_name: customParams.venue_name || "",
          twilio_call_sid: customParams.call_sid || "",
        });
        break;
      }
      case "media": {
        const payload = msg.media?.payload;
        if (!payload) return;
        if (elReady && elWs && elWs.readyState === WebSocket.OPEN) {
          elWs.send(JSON.stringify({ user_audio_chunk: payload }));
        } else {
          if (pending.length < 250) pending.push(payload); // ~5s safety cap
        }
        break;
      }
      case "stop": {
        console.log("[mixer] twilio stop");
        try { elWs?.close(); } catch {}
        try { twilioWs.close(); } catch {}
        break;
      }
    }
  };
  twilioWs.onclose = () => {
    console.log("[mixer] twilio ws close");
    try { elWs?.close(); } catch {}
  };
  twilioWs.onerror = (e) => console.error("[mixer] twilio ws error", e);

  return response;
});
