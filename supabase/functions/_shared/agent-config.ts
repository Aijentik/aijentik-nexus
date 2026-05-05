// Shared helpers used by voice-token, twilio-voice-webhook, and agent-configure.
// Builds an ElevenLabs agent payload from a venue + the user-editable agent.config.

export const VOICE_CANDIDATES: Record<string, string> = {
  sarah: "EXAVITQu4vr4xnSDxMaL",   // warm female
  jessica: "cgSgspJ2msm6clMCkdW9", // friendly female
  brian: "nPczCjzI2devNBz1zQrb",   // relaxed male
  charlie: "IKne3meq5aSn9XLyUdCD", // confident male
  matilda: "XrExE9yKIg1WjnnlVkGX", // bright female
};

export const DEMEANOR_PRESETS: Record<string, string> = {
  warm: "Warm, welcoming, and personable. Make every caller feel like a regular.",
  professional: "Polished, efficient, and precise. Respect the caller's time.",
  playful: "Light, witty, and a touch playful — but always tasteful and clear.",
  luxury: "Refined and discreet. Speak with the calm confidence of a five-star concierge.",
  casual: "Relaxed and easy-going, like a friendly local recommending their favourite spot.",
};

export const LENGTH_PRESETS: Record<string, string> = {
  short: "Keep responses to 1 sentence whenever possible. Never more than 2.",
  medium: "Keep responses concise — usually 1–3 sentences.",
  detailed: "You may give fuller answers when the caller asks for detail, but stay focused.",
};

export type AgentConfig = {
  intention?: string;
  demeanor?: string;       // preset key OR custom text
  voice?: string;          // preset key OR raw voice_id
  language?: string;       // ISO, default "en"
  firstMessage?: string;
  responseLength?: "short" | "medium" | "detailed";
  customInstructions?: string;
  tools?: {
    create_booking?: boolean;
    take_message?: boolean;
    transfer_call?: boolean;
    transfer_number?: string;
  };
  speed?: number;          // 0.7–1.2
  stability?: number;      // 0–1
  similarity_boost?: number;
  style?: number;
};

export function resolveVoiceId(cfg: AgentConfig | null | undefined): string {
  const v = cfg?.voice;
  if (typeof v === "string" && VOICE_CANDIDATES[v]) return VOICE_CANDIDATES[v];
  if (typeof v === "string" && v.length > 15) return v;
  return VOICE_CANDIDATES.sarah;
}

export function resolveDemeanor(cfg: AgentConfig | null | undefined): string {
  const d = cfg?.demeanor;
  if (!d) return DEMEANOR_PRESETS.warm;
  return DEMEANOR_PRESETS[d] || d; // raw text falls through
}

export function buildPrompt(venue: any, kb: any[] = [], cfg: AgentConfig | null | undefined, context: any = {}) {
  const knowledge = (kb || []).slice(0, 30).map(k => `• ${k.title}: ${k.content}`).join("\n");
  const bookings = (context.bookings || []).map((b: any) => `• ${b.guest_name}, party of ${b.party_size}, ${b.booking_time}, status: ${b.status}${b.notes ? `, notes: ${b.notes}` : ""}`).join("\n");
  const messages = (context.messages || []).map((m: any) => `• ${m.direction || "message"} ${m.channel || "sms"} ${m.contact || ""}: ${m.body}`).join("\n");
  const events = (context.events || []).map((e: any) => `• ${e.title}: ${e.reason || ""}`).join("\n");
  const insights = (context.insights || []).map((i: any) => `• ${i.title}: ${i.body}`).join("\n");

  const intention = cfg?.intention?.trim() || "Greet guests, take reservations, and answer questions about the menu, hours, location, policies, and current operational context.";
  const demeanor = resolveDemeanor(cfg);
  const lengthRule = LENGTH_PRESETS[cfg?.responseLength || "medium"];
  const tools = cfg?.tools || { create_booking: true, take_message: true };
  const enabledTools: string[] = [];
  if (tools.create_booking !== false) enabledTools.push("create_booking — confirm bookings only after collecting name, party size, date, time, and phone.");
  if (tools.take_message) enabledTools.push("take_message — for anything you cannot resolve, take a clear message for the team.");
  if (tools.transfer_call && tools.transfer_number) enabledTools.push(`transfer_call — if the caller insists on speaking to a human, transfer to ${tools.transfer_number}.`);

  return `You are ${venue.name}'s AI host — a voice agent for a ${venue.venue_type || "restaurant"}${venue.cuisine ? ` serving ${venue.cuisine}` : ""}.

PRIMARY INTENTION
${intention}

DEMEANOR
${demeanor}

VENUE DETAILS
- Name: ${venue.name}
- Address: ${venue.address || "—"}, ${venue.city || ""}
- Phone: ${venue.phone || "—"}
- Capacity: ${venue.capacity || 60}
- Brand voice: ${venue.brand_voice || "warm, professional"}
- Hours: ${JSON.stringify(venue.hours || {})}
${venue.description ? `\nAbout: ${venue.description}` : ""}

KNOWLEDGE BASE
${knowledge || "(none yet)"}

UPCOMING BOOKINGS
${bookings || "(none available)"}

RECENT MESSAGES
${messages || "(none available)"}

LIVE BRAIN / ACTION CONTEXT
${events || "(none available)"}

INSIGHTS
${insights || "(none available)"}

ENABLED CAPABILITIES
${enabledTools.length ? enabledTools.map(t => `- ${t}`).join("\n") : "- Conversation only — do not promise to take any actions."}

RESPONSE LENGTH
${lengthRule}

GENERAL RULES
- Never invent facts. If you don't know, say so and offer to take a message.
- Never share private operational data beyond what is needed to help the caller.
- Talk like a real person working at the venue, not a narrator or AI assistant.
- Vary phrasing — never repeat the same sentence twice.

${cfg?.customInstructions ? `CUSTOM INSTRUCTIONS FROM THE OWNER\n${cfg.customInstructions}\n` : ""}`;
}

export function buildAgentBody(venue: any, prompt: string, cfg: AgentConfig | null | undefined) {
  const voiceId = resolveVoiceId(cfg);
  const tools = cfg?.tools || { create_booking: true, take_message: true };
  const toolDefs: any[] = [];

  if (tools.create_booking !== false) {
    toolDefs.push({
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
    });
  }
  if (tools.take_message) {
    toolDefs.push({
      type: "client",
      name: "take_message",
      description: "Record a message for the venue team when the caller wants to leave one or you cannot resolve their request.",
      parameters: {
        type: "object",
        required: ["caller_name", "message"],
        properties: {
          caller_name: { type: "string", description: "Full name of the caller leaving the message" },
          caller_phone: { type: "string", description: "Callback phone number, optional" },
          message: { type: "string", description: "The message to relay to the venue team" },
        },
      },
    });
  }
  if (tools.transfer_call && tools.transfer_number) {
    toolDefs.push({
      type: "system",
      name: "transfer_to_number",
      params: { transfer_destination: { type: "phone", phone_number: tools.transfer_number } },
      description: "Transfer the call to a human at the venue when the caller asks for one.",
    });
  }

  const firstMessage = cfg?.firstMessage?.trim() || `Hi, thanks for calling ${venue.name}. How can I help today?`;

  return {
    name: `${venue.name} — Voice Host`,
    conversation_config: {
      agent: {
        prompt: { prompt, tools: toolDefs },
        first_message: firstMessage,
        language: cfg?.language || "en",
      },
      tts: {
        voice_id: voiceId,
        model_id: "eleven_turbo_v2",
        stability: typeof cfg?.stability === "number" ? cfg.stability : 0.35,
        similarity_boost: typeof cfg?.similarity_boost === "number" ? cfg.similarity_boost : 0.7,
        style: typeof cfg?.style === "number" ? cfg.style : 0.45,
        use_speaker_boost: true,
        speed: typeof cfg?.speed === "number" ? cfg.speed : 1.0,
      },
      client_events: [
        "audio", "interruption", "user_transcript", "agent_response",
        "agent_response_correction", "client_tool_call", "ping",
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
