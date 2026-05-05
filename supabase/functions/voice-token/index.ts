import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function buildPrompt(venue: any, kb: any[], context: any = {}) {
  const knowledge = kb.slice(0, 30).map(k => `• ${k.title}: ${k.content}`).join("\n");
  const bookings = (context.bookings || []).map((b: any) => `• ${b.guest_name}, party of ${b.party_size}, ${b.booking_time}, status: ${b.status}${b.notes ? `, notes: ${b.notes}` : ""}`).join("\n");
  const messages = (context.messages || []).map((m: any) => `• ${m.direction || "message"} ${m.channel || "sms"} ${m.contact || ""}: ${m.body}`).join("\n");
  const events = (context.events || []).map((e: any) => `• ${e.title}: ${e.reason || ""}`).join("\n");
  const insights = (context.insights || []).map((i: any) => `• ${i.title}: ${i.body}`).join("\n");

  return `You are ${venue.name}'s AI host — a warm, professional voice agent for a ${venue.venue_type || "restaurant"}${venue.cuisine ? ` serving ${venue.cuisine}` : ""}.

Your job: greet guests, take reservations, answer questions about the menu, hours, location, dress code, policies, and current operational context. Be concise, friendly, and confident.

Venue details:
- Name: ${venue.name}
- Address: ${venue.address || "—"}, ${venue.city || ""}
- Phone: ${venue.phone || "—"}
- Capacity: ${venue.capacity || 60}
- Brand voice: ${venue.brand_voice || "warm, professional"}
- Hours: ${JSON.stringify(venue.hours || {})}
${venue.description ? `\nAbout: ${venue.description}` : ""}

Knowledge base:
${knowledge || "(none yet)"}

Upcoming bookings:
${bookings || "(none available)"}

Recent messages:
${messages || "(none available)"}

Live Brain / action context:
${events || "(none available)"}

Insights:
${insights || "(none available)"}

Rules:
- For bookings: collect name, party size, date, time, phone. Confirm explicitly.
- If the caller asks to change live data, confirm the details and say you have noted it for the team.
- If unsure, offer to take a message rather than invent facts.
- Never share private operational data beyond what is needed to help the caller.
- Keep responses under 2 sentences unless asked for detail.`;
}

function agentBody(venue: any, prompt: string) {
  return {
    name: `${venue.name} — Voice Host`,
    conversation_config: {
      agent: {
        prompt: {
          prompt,
          tools: [
            {
              type: "client",
              name: "create_booking",
              description: "Create a confirmed booking in the venue's diary. Call this only after explicitly confirming all required details with the caller.",
              parameters: {
                type: "object",
                required: ["guest_name", "party_size", "booking_time"],
                properties: {
                  guest_name: { type: "string", description: "Full name of the guest" },
                  party_size: { type: "integer", description: "Number of guests" },
                  booking_time: { type: "string", description: "ISO 8601 datetime, e.g. 2026-05-06T19:30:00Z" },
                  guest_phone: { type: "string", description: "Phone number, optional" },
                  notes: { type: "string", description: "Special requests / notes, optional" },
                },
              },
            },
          ],
        },
        first_message: `Hi, thanks for calling ${venue.name}. How can I help today?`,
        language: "en",
      },
      tts: { voice_id: "EXAVITQu4vr4xnSDxMaL", model_id: "eleven_v3" },
      client_events: [
        "audio",
        "interruption",
        "user_transcript",
        "agent_response",
        "agent_response_correction",
        "client_tool_call",
        "ping",
      ],
    },
    platform_settings: {
      overrides: {
        conversation_config_override: {
          agent: { prompt: { prompt: true }, first_message: true, language: true },
        },
      },
    },
  };
}

async function createElevenLabsAgent(venue: any, prompt: string) {
  const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(agentBody(venue, prompt)),
  });
  if (!res.ok) throw new Error(`agent create failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.agent_id;
}

async function syncElevenLabsAgent(agentId: string, venue: any, prompt: string) {
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(agentBody(venue, prompt)),
  });
  if (!res.ok) console.warn("agent sync failed", res.status, await res.text());
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

    const { venue_id } = await req.json();
    if (!venue_id) return new Response(JSON.stringify({ error: "venue_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: venue } = await sb.from("venues").select("*").eq("id", venue_id).single();
    if (!venue) return new Response(JSON.stringify({ error: "venue not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [{ data: kb }, { data: bookings }, { data: messages }, { data: events }, { data: insights }] = await Promise.all([
      sb.from("knowledge_base").select("title,content").eq("venue_id", venue_id).limit(30),
      sb.from("bookings").select("guest_name,party_size,booking_time,status,notes").eq("venue_id", venue_id).gte("booking_time", new Date().toISOString()).order("booking_time", { ascending: true }).limit(10),
      sb.from("messages").select("direction,channel,contact,body,created_at").eq("venue_id", venue_id).order("created_at", { ascending: false }).limit(10),
      sb.from("brain_events").select("title,reason,severity,created_at").eq("venue_id", venue_id).order("created_at", { ascending: false }).limit(10),
      sb.from("insights").select("title,body,category,impact,created_at").eq("venue_id", venue_id).order("created_at", { ascending: false }).limit(8),
    ]);

    const context = { bookings: bookings || [], messages: messages || [], events: events || [], insights: insights || [] };
    const prompt = buildPrompt(venue, kb || [], context);

    let { data: agent } = await sb.from("agents").select("*").eq("venue_id", venue_id).eq("kind", "voice").maybeSingle();
    let agentId = agent?.elevenlabs_agent_id;

    if (!agentId) {
      agentId = await createElevenLabsAgent(venue, prompt);
      if (agent) {
        await sb.from("agents").update({ elevenlabs_agent_id: agentId, status: "active", prompt }).eq("id", agent.id);
      } else {
        await sb.from("agents").insert({ venue_id, kind: "voice", name: "Voice Host", elevenlabs_agent_id: agentId, status: "active", prompt });
      }
    }
    // Always sync to ensure tools + client_events are up-to-date
    await syncElevenLabsAgent(agentId, venue, prompt);
    if (agent && agent.prompt !== prompt) {
      await sb.from("agents").update({ prompt, status: "active" }).eq("id", agent.id);
    }

    const signedUrlRes = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });
    if (!signedUrlRes.ok) {
      const txt = await signedUrlRes.text();
      if (signedUrlRes.status === 429) {
        return new Response(JSON.stringify({
          error: "ElevenLabs is at concurrent-call capacity for your workspace. End any other active calls (browser tabs, phone calls, dashboard test sessions) and try again in ~30s.",
          code: "concurrency_limit",
          retryable: true,
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`signed_url failed: ${signedUrlRes.status} ${txt}`);
    }
    const signedUrlData = await signedUrlRes.json();

    return new Response(JSON.stringify({ signed_url: signedUrlData.signed_url, agent_id: agentId, prompt }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
