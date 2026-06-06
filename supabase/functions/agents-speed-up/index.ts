// Resets all linked phone (kind=voice) ElevenLabs agents to sane turn settings.
// Previous version set turn_timeout=1 + turn_eagerness=eager which made the
// agent get interrupted by Twilio line noise mid-greeting and drop the call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function patchAgent(id: string, isBrowser: boolean) {
  const body = {
    conversation_config: {
      turn: { turn_timeout: 7, mode: "turn", turn_eagerness: "normal", silence_end_call_timeout: 30 },
      tts: { model_id: "eleven_flash_v2", optimize_streaming_latency: 3 },
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
  const { data } = await sb.from("agents").select("elevenlabs_agent_id, kind").not("elevenlabs_agent_id", "is", null);
  const results: any[] = [];
  for (const a of data || []) {
    try {
      const st = await patchAgent(a.elevenlabs_agent_id, a.kind === "voice_browser");
      results.push({ id: a.elevenlabs_agent_id, kind: a.kind, ok: true, status: st });
    } catch (e) {
      results.push({ id: a.elevenlabs_agent_id, kind: a.kind, ok: false, error: String(e) });
    }
  }
  return new Response(JSON.stringify({ ok: true, count: (data || []).length, results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
