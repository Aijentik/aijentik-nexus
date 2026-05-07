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
const AMBIENCE_GAIN = 0.12; // soft restaurant murmur — kept low so agent voice stays clear

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
    dbg("http", `non-ws hit ${url.pathname}`, { ua: req.headers.get("user-agent") });
    return new Response("venue-mixer up", { status: 200 });
  }

  const urlAgentId = url.searchParams.get("agent_id");
  dbg("ws-upgrade", `incoming ws urlAgentId=${urlAgentId}`, { url: url.toString() });

  const { socket: twilioWs, response } = Deno.upgradeWebSocket(req);
  let elWs: WebSocket | null = null;
  let streamSid: string | null = null;
  let ambienceOffset = 0;
  let customParams: Record<string, string> = {};
  let firstAgentAudioAt: number | null = null;
  let mediaFromTwilio = 0;
  let audioToTwilio = 0;
  let lastAgentFrameAt = 0;
  const openedAt = Date.now();

  // Continuous ambience: emit a 20ms ambience-only frame whenever agent isn't speaking,
  // so the restaurant murmur is always audible to the caller.
  const ambienceTimer = setInterval(() => {
    if (!streamSid || twilioWs.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastAgentFrameAt < 40) return; // agent is currently speaking; skip
    const silent = new Uint8Array(160).fill(0xff); // μ-law silence
    const { mixed, nextOffset } = mixFrame(silent, ambienceOffset);
    ambienceOffset = nextOffset;
    let bin = "";
    for (let k = 0; k < mixed.length; k++) bin += String.fromCharCode(mixed[k]);
    try {
      twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: btoa(bin) } }));
    } catch {}
  }, 20);

  twilioWs.onopen = () => dbg("ws-open", "twilio ws open");

  twilioWs.onmessage = async (ev) => {
    let msg: any;
    try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg.event === "connected") {
      dbg("twilio-connected", "twilio sent connected", { protocol: msg.protocol, version: msg.version });
    } else if (msg.event === "start") {
      streamSid = msg.start?.streamSid;
      customParams = msg.start?.customParameters || {};
      const agentId = customParams.agent_id || urlAgentId;
      dbg("twilio-start", `streamSid=${streamSid} agentId=${agentId}`, { customParams, mediaFormat: msg.start?.mediaFormat });
      if (!agentId) {
        dbg("no-agent-id", "no agent_id in url or customParameters; closing");
        try { twilioWs.close(); } catch {}
        return;
      }
      try {
        const signedUrl = await getSignedUrl(agentId);
        dbg("el-signed-url", "got signed url");
        elWs = new WebSocket(signedUrl);
        elWs.onopen = () => {
          dbg("el-open", "el ws open, sending init");
          // Strip routing-only params; pass the rest as dynamic variables.
          const dyn: Record<string, string> = {};
          for (const [k, v] of Object.entries(customParams)) {
            if (k === "agent_id" || k === "first_message_override") continue;
            dyn[k] = v;
          }
          const init: any = {
            type: "conversation_initiation_client_data",
            dynamic_variables: dyn,
          };
          const fm = customParams.first_message_override;
          if (fm) {
            init.conversation_config_override = { agent: { first_message: fm } };
          }
          dbg("el-init", "sending init", { dynKeys: Object.keys(dyn), hasFirstMessageOverride: !!fm });
          elWs!.send(JSON.stringify(init));
        };
        elWs.onmessage = (e) => {
          let m: any;
          try { m = JSON.parse(e.data); } catch { return; }
          if (m.type === "audio") {
            const b64 = m.audio_event?.audio_base_64 || m.audio?.chunk;
            if (!b64 || !streamSid) return;
            if (firstAgentAudioAt === null) {
              firstAgentAudioAt = Date.now();
              dbg("first-audio", `first agent audio after ${firstAgentAudioAt - openedAt}ms`, { b64Len: b64.length });
            }
            // Agent now emits ulaw_8000 directly (matches Twilio native format).
            // Pass through unchanged but chunk to 160-byte (20ms) frames so Twilio
            // paces the audio correctly.
            const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            // Mix in restaurant ambience and chunk to 20ms (160-byte) frames.
            for (let off = 0; off < raw.length; off += 160) {
              const frame = raw.subarray(off, Math.min(off + 160, raw.length));
              const { mixed, nextOffset } = mixFrame(frame, ambienceOffset);
              ambienceOffset = nextOffset;
              let bin = "";
              for (let k = 0; k < mixed.length; k++) bin += String.fromCharCode(mixed[k]);
              twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: btoa(bin) } }));
              audioToTwilio++;
            }
            lastAgentFrameAt = Date.now();
          } else if (m.type === "ping") {
            elWs!.send(JSON.stringify({ type: "pong", event_id: m.ping_event?.event_id }));
          } else if (m.type === "interruption") {
            if (streamSid) twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
          } else if (m.type === "conversation_initiation_metadata") {
            dbg("el-init-meta", "el init metadata received");
          }
        };
        elWs.onerror = (e) => dbg("el-error", "el ws error", { err: String((e as any)?.message || e) });
        elWs.onclose = (e) => {
          dbg("el-close", `el closed code=${e.code}`, { reason: e.reason, mediaFromTwilio, audioToTwilio });
          try { twilioWs.close(); } catch {}
        };
      } catch (e) {
        dbg("el-connect-failed", String(e));
        try { twilioWs.close(); } catch {}
      }
    } else if (msg.event === "media") {
      mediaFromTwilio++;
      if (mediaFromTwilio === 1) dbg("first-twilio-media", "got first media frame from twilio");
      if (elWs?.readyState === WebSocket.OPEN) {
        elWs.send(JSON.stringify({ user_audio_chunk: msg.media.payload }));
      }
    } else if (msg.event === "stop") {
      dbg("twilio-stop", "twilio sent stop", { mediaFromTwilio, audioToTwilio });
      try { elWs?.close(); } catch {}
    }
  };

  twilioWs.onclose = (e) => {
    dbg("twilio-close", `twilio ws closed code=${e.code}`, { reason: e.reason, mediaFromTwilio, audioToTwilio, durationMs: Date.now() - openedAt });
    try { elWs?.close(); } catch {}
  };
  twilioWs.onerror = (e) => dbg("twilio-error", "twilio ws error", { err: String((e as any)?.message || e) });

  return response;
});

console.log(`[mixer] listening on :${PORT}`);
