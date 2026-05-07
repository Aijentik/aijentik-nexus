// One-shot helper: generate a restaurant ambience clip via ElevenLabs Sound
// Generation and attach it to a Conversational AI agent as background audio.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { encodeBase64 as b64encode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateAmbience(prompt: string, duration: number): Promise<Uint8Array> {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text: prompt, duration_seconds: duration, prompt_influence: 0.4, loop: true }),
  });
  if (!res.ok) throw new Error(`sound-generation ${res.status}: ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function attachBackground(agentId: string, mp3: Uint8Array, volume: number) {
  const dataUri = `data:audio/mpeg;base64,${b64encode(mp3)}`;
  const body = {
    conversation_config: {
      agent: {
        background_audio: { enabled: true, volume, source: dataUri },
      },
    },
  };
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`agent patch ${res.status}: ${text}`);
  return text;
}

async function runJob(payload: any) {
  const promptText = payload.prompt || "Busy upscale restaurant ambience: distant murmur of conversations, soft cutlery clinks, gentle background music, warm room tone. No distinct voices, no sudden noises, smooth and loopable.";
  const duration = Math.min(Math.max(Number(payload.duration_seconds) || 22, 5), 22);
  const vol = typeof payload.volume === "number" ? Math.max(0, Math.min(1, payload.volume)) : 0.15;

  console.log("[bg-audio] generating ambience", { duration, vol });
  let mp3: Uint8Array;
  try {
    mp3 = await generateAmbience(promptText, duration);
  } catch (e) {
    console.error("[bg-audio] sound-gen failed", e);
    return;
  }
  console.log("[bg-audio] generated", mp3.byteLength, "bytes");

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  let agentIds: string[] = [];
  if (payload.agent_id) agentIds = [payload.agent_id];
  else {
    const { data } = await sb.from("agents").select("elevenlabs_agent_id").not("elevenlabs_agent_id", "is", null);
    agentIds = Array.from(new Set((data || []).map((a: any) => a.elevenlabs_agent_id).filter(Boolean)));
  }
  console.log("[bg-audio] patching", agentIds.length, "agents");
  for (const id of agentIds) {
    try {
      await attachBackground(id, mp3, vol);
      console.log("[bg-audio] OK", id);
    } catch (e) {
      console.error("[bg-audio] FAIL", id, String(e).slice(0, 300));
    }
  }
  console.log("[bg-audio] done");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const payload = await req.json().catch(() => ({}));
  // Fire-and-forget so client disconnect doesn't kill the work.
  // @ts-ignore EdgeRuntime is provided by Supabase
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(runJob(payload));
  } else {
    runJob(payload).catch((e) => console.error("[bg-audio] job error", e));
  }
  return new Response(JSON.stringify({ ok: true, started: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
