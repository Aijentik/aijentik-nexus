// Twilio <Stream> ↔ ElevenLabs Conversational AI bridge with ambience mixing.
// Twilio sends μ-law 8kHz audio; ElevenLabs returns μ-law 8kHz audio.
// We mix a looped venue ambience PCM track under the agent's audio frames
// before forwarding them back to Twilio.
import { AMBIENCE_ULAW_BASE64 } from "./ambience-data.ts";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const PORT = Number(Deno.env.get("PORT") ?? 8080);
const DEBUG_URL = Deno.env.get("DEBUG_URL") ?? "https://ifqizzldcgkttwlltdbo.supabase.co/functions/v1/mixer-debug-log";

function dbg(kind: string, message: string, extra: Record<string, unknown> = {}) {
  console.log(`[mixer:${kind}] ${message}`, extra);
  fetch(DEBUG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, message, ...extra, ts: new Date().toISOString() }),
  }).catch(() => {});
}

// Decode looped ambience once at startup (μ-law 8kHz mono).
const AMBIENCE = Uint8Array.from(atob(AMBIENCE_ULAW_BASE64), (c) => c.charCodeAt(0));
const AMBIENCE_GAIN = 0.18; // ~18% — soft pub murmur under the agent

// μ-law <-> linear PCM conversion (G.711)
function ulawToLinear(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}
function linearToUlaw(s: number): number {
  const BIAS = 0x84, CLIP = 32635;
  let sign = (s >> 8) & 0x80;
  if (sign) s = -s;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

function mixFrame(agentUlaw: Uint8Array, ambienceOffset: number): { mixed: Uint8Array; nextOffset: number } {
  const out = new Uint8Array(agentUlaw.length);
  let off = ambienceOffset;
  for (let i = 0; i < agentUlaw.length; i++) {
    const a = ulawToLinear(agentUlaw[i]);
    const b = ulawToLinear(AMBIENCE[off]) * AMBIENCE_GAIN;
    let mixed = a + b;
    if (mixed > 32767) mixed = 32767; else if (mixed < -32768) mixed = -32768;
    out[i] = linearToUlaw(mixed);
    off = (off + 1) % AMBIENCE.length;
  }
  return { mixed: out, nextOffset: off };
}

async function getSignedUrl(agentId: string): Promise<string> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": ELEVENLABS_API_KEY } },
  );
  if (!res.ok) throw new Error(`signed-url ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.signed_url;
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/health") return new Response("ok");
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("venue-mixer up", { status: 200 });
  }

  const agentId = url.searchParams.get("agent_id");
  if (!agentId) return new Response("agent_id required", { status: 400 });

  const { socket: twilioWs, response } = Deno.upgradeWebSocket(req);
  let elWs: WebSocket | null = null;
  let streamSid: string | null = null;
  let ambienceOffset = 0;
  let customParams: Record<string, string> = {};

  twilioWs.onmessage = async (ev) => {
    let msg: any;
    try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg.event === "start") {
      streamSid = msg.start?.streamSid;
      customParams = msg.start?.customParameters || {};
      console.log("[mixer] twilio start", { streamSid, customParams });
      try {
        const signedUrl = await getSignedUrl(agentId);
        elWs = new WebSocket(signedUrl);
        elWs.onopen = () => {
          elWs!.send(JSON.stringify({
            type: "conversation_initiation_client_data",
            dynamic_variables: customParams,
          }));
        };
        elWs.onmessage = (e) => {
          let m: any;
          try { m = JSON.parse(e.data); } catch { return; }
          if (m.type === "audio") {
            const b64 = m.audio_event?.audio_base_64 || m.audio?.chunk;
            if (!b64 || !streamSid) return;
            const agentBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const { mixed, nextOffset } = mixFrame(agentBytes, ambienceOffset);
            ambienceOffset = nextOffset;
            const mixedB64 = btoa(String.fromCharCode(...mixed));
            twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: mixedB64 } }));
          } else if (m.type === "ping") {
            elWs!.send(JSON.stringify({ type: "pong", event_id: m.ping_event?.event_id }));
          } else if (m.type === "interruption") {
            if (streamSid) twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
          }
        };
        elWs.onerror = (e) => console.error("[mixer] el error", e);
        elWs.onclose = () => { try { twilioWs.close(); } catch {} };
      } catch (e) {
        console.error("[mixer] el connect failed", e);
        try { twilioWs.close(); } catch {}
      }
    } else if (msg.event === "media") {
      if (elWs?.readyState === WebSocket.OPEN) {
        elWs.send(JSON.stringify({ user_audio_chunk: msg.media.payload }));
      }
    } else if (msg.event === "stop") {
      try { elWs?.close(); } catch {}
    }
  };

  twilioWs.onclose = () => { try { elWs?.close(); } catch {} };
  twilioWs.onerror = (e) => console.error("[mixer] twilio error", e);

  return response;
});

console.log(`[mixer] listening on :${PORT}`);
