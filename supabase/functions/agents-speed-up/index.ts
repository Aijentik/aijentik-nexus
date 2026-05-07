// One-shot: lower latency on all linked ElevenLabs agents.
// - turn.turn_timeout = 1s (was 7s) — agent responds ~as soon as you stop talking
// - tts.model_id = eleven_flash_v2_5 (fastest, ~75ms)
// - tts.optimize_streaming_latency = 4 (max)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function patchAgent(id: string) {
  const body = {
    conversation_config: {
      turn: { turn_timeout: 1, mode: "turn" },
      tts: {
        model_id: "eleven_flash_v2_5",
        optimize_streaming_latency: 4,
      },
    },
  };
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${id}`, {
    method: "PATCH",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`patch ${res.status}: ${text.slice(0, 300)}`);
  return res.status;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data } = await sb.from("agents").select("elevenlabs_agent_id").not("elevenlabs_agent_id", "is", null);
  const ids = Array.from(new Set((data || []).map((a: any) => a.elevenlabs_agent_id).filter(Boolean)));
  const results: any[] = [];
  for (const id of ids) {
    try {
      const st = await patchAgent(id);
      results.push({ id, ok: true, status: st });
    } catch (e) {
      results.push({ id, ok: false, error: String(e) });
    }
  }
  return new Response(JSON.stringify({ ok: true, count: ids.length, results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
