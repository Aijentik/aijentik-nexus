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
    update_booking?: boolean;
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
  const tools = cfg?.tools || { create_booking: true, update_booking: true, take_message: true };
  const enabledTools: string[] = [];
  if (tools.create_booking !== false) enabledTools.push("create_booking — confirm bookings only after collecting name, party size, date, time, and phone.");
  if (tools.update_booking !== false) enabledTools.push("update_booking — change or cancel an existing booking. Use the caller's recognised booking from CALLER CONTEXT when available; otherwise confirm which booking to change before calling.");
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

CALLER CONTEXT (this specific call)
- Caller phone number: {{caller_number}}
- Recognised guest: {{caller_known}}
- Guest first name (if known): {{caller_first_name}}
- Guest full name (if known): {{caller_name}}
- Guest notes / tags: {{caller_notes}}
- Visit history: {{caller_history}}
- Bookings on file: {{caller_bookings}}
- Next/most relevant booking: {{caller_next_booking}}

CALLER-AWARE BEHAVIOUR
- The very first message you say is already personalised — do not re-greet.
- If "Recognised guest" is "yes" AND there is a "Next/most relevant booking", you MUST proactively reference it in your first turn without being asked (e.g. "I can see your booking for {{caller_next_booking}} — is that what you're calling about?"). Do not wait for the caller to ask you to check.
- If they have no upcoming booking but a past one, acknowledge them as a returning guest by first name.
- If they're a VIP or have notes/tags, treat them with extra care, but never read raw notes verbatim.
- If "Recognised guest" is "no", greet normally and ask for their name.
- Never claim to recognise a caller when "Recognised guest" is "no".

KNOWLEDGE BASE
${knowledge || "(none yet)"}

UPCOMING BOOKINGS (venue-wide)
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

// Lookup caller context by phone number → returns dynamic_variables for ElevenLabs.
export async function buildCallerContext(sb: any, venueId: string, callerPhone: string) {
  const base: Record<string, string> = {
    caller_number: callerPhone || "unknown",
    caller_known: "no",
    caller_name: "",
    caller_notes: "none",
    caller_history: "no prior visits on record",
    caller_bookings: "none on file",
  };
  if (!callerPhone) return base;
  const digits = callerPhone.replace(/\D/g, "");
  if (!digits) return base;
  // Use last 8 digits to tolerate country codes + local trunk "0" (e.g. +61420505750 vs 0420505750)
  const tail = digits.slice(-8);
  const matchPhone = (p: string | null | undefined) => {
    if (!p) return false;
    const d = p.replace(/\D/g, "");
    return d.length >= 8 && d.slice(-8) === tail;
  };
  try {
    const { data: guests } = await sb
      .from("guests")
      .select("id,name,phone,vip,tags,notes,visit_count,last_visit")
      .eq("venue_id", venueId)
      .limit(500);
    const guest = (guests || []).find((g: any) => matchPhone(g.phone));
    if (guest) {
      base.caller_known = "yes";
      base.caller_name = guest.name || "";
      const tagPart = guest.tags?.length ? `tags: ${guest.tags.join(", ")}` : "";
      const vipPart = guest.vip ? "VIP guest" : "";
      base.caller_notes = [vipPart, tagPart, guest.notes].filter(Boolean).join(" — ") || "none";
      base.caller_history = guest.visit_count
        ? `${guest.visit_count} previous visit(s)${guest.last_visit ? `, last on ${new Date(guest.last_visit).toDateString()}` : ""}`
        : "no prior visits on record";
      const { data: bks } = await sb
        .from("bookings")
        .select("party_size,booking_time,status,notes")
        .eq("venue_id", venueId)
        .eq("guest_id", guest.id)
        .order("booking_time", { ascending: false })
        .limit(5);
      if (bks?.length) {
        base.caller_bookings = bks.map((b: any) =>
          `party of ${b.party_size} on ${new Date(b.booking_time).toLocaleString()} (${b.status})${b.notes ? ` — ${b.notes}` : ""}`
        ).join(" | ");
      }
    } else {
      const { data: bks } = await sb
        .from("bookings")
        .select("guest_name,guest_phone,party_size,booking_time,status")
        .eq("venue_id", venueId)
        .not("guest_phone", "is", null)
        .order("booking_time", { ascending: false })
        .limit(100);
      const matches = (bks || []).filter((b: any) => matchPhone(b.guest_phone));
      if (matches.length) {
        base.caller_known = "yes";
        base.caller_name = matches[0].guest_name || "";
        base.caller_bookings = matches
          .map((b: any) => `party of ${b.party_size} on ${new Date(b.booking_time).toLocaleString()} (${b.status})`)
          .join(" | ");
      }
    }
  } catch (e) {
    console.error("[buildCallerContext] lookup failed", e);
  }
  return base;
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
