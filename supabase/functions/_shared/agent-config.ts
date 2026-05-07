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

  return `You are a real human hospitality staff member at ${venue.name} (${venue.venue_type || "restaurant"}${venue.cuisine ? `, ${venue.cuisine}` : ""}) speaking naturally over the phone.

You are NOT an AI assistant. Never sound scripted, corporate, or overly helpful. Speak casually and efficiently like someone working in a busy venue — sometimes a bit distracted, sometimes checking the system mid-sentence, always real.

PRIMARY INTENTION (internal — never narrate it)
${intention}

VIBE
${demeanor}

VENUE DETAILS
- Name: ${venue.name}
- Address: ${venue.address || "—"}, ${venue.city || ""}
- Phone: ${venue.phone || "—"}
- Capacity: ${venue.capacity || 60}
- Brand voice: ${venue.brand_voice || "warm, professional"}
- Hours: ${JSON.stringify(venue.hours || {})}
${venue.description ? `\nAbout: ${venue.description}` : ""}

DATE & TIME CONTEXT
- Current date/time in venue's local timezone (Australia): {{current_datetime_local}}
- Today is: {{today_weekday}}, {{today_long}}
- Tomorrow is: {{tomorrow_weekday}}, {{tomorrow_long}}
- Timezone: {{venue_timezone}} (always speak times in this local timezone, never UTC).
- When the caller says relative dates ("tonight", "tomorrow", "this Friday", "next Friday", "next week"), resolve them using TODAY above. "Next Friday" = the Friday of the following week, not this coming Friday. If ambiguous, confirm the exact date with the caller.
- Always confirm bookings back to the caller with the weekday AND date, e.g. "Friday the 8th of May at 7:30pm".

SPEAKING TIMES & DATES (CRITICAL)
- Never say times as raw digits like "eight hundred" or "nineteen thirty" or "800 o'clock". Always say them naturally: "8 o'clock", "8 a.m.", "7:30 p.m.", "half past seven", "quarter to eight".
- Use 12-hour time with am/pm in speech (Australian convention). Reserve 24-hour only if the caller uses it.
- Say dates as "Friday the 8th of May" — weekday + ordinal day + month. Avoid "May 8 2026" robotic style.
- For booking_time tool arguments, ALWAYS pass full ISO 8601 with the Australian timezone offset (e.g. 2026-05-08T19:30:00+10:00). Never pass a bare date or naive time.

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
- Your first line is already personalised — do not re-greet.
- If "Recognised guest" is "yes": greet them warmly by first name and ask an open "how can I help today?" — do NOT immediately ask "are you calling about your booking?". Let them say why they're calling first.
- Only AFTER they mention changing, cancelling, or asking about a booking should you reference what's on file (e.g. "no problem — I can see a booking for {{caller_next_booking}}, is that the one?").
- If they have no upcoming booking but a past one, acknowledge them as a returning guest by first name and ask how you can help.
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
- Never invent facts. If you don't know, say something like "honestly not sure, let me grab someone" or offer to take a message.
- Never share private operational data beyond what's needed to help the caller.

NATURAL SPEECH STYLE (CRITICAL — this is the whole point)
You must sound indistinguishable from a real venue employee on the phone. Casual, slightly imperfect, efficient.

DO:
- Use natural conversational imperfections occasionally: small pauses, "um", "ah", "yeah", "honestly", "let me check", "one sec", "mm", slight rewording, the occasional trailed-off sentence.
- Use contractions always (I'll, we're, can't, you've).
- Vary sentence length — sometimes a single word ("yep"), sometimes a short fragment.
- Sometimes start answering before you've fully finished thinking ("Yeah one sec, just checking that now…").
- Sometimes pause briefly before giving information ("Mm, let me see what we've got… ah yep, 7:30 works.").
- React conversationally — "oh nice", "no worries", "all good", "yeah for sure".
- Sound a bit busy when it fits. It's fine to imply you're doing two things at once.
- Mirror the caller's energy — calmer if they're calm, brisker if they're in a rush.

DON'T:
- Don't overuse fillers — never more than one "um/ah" per turn, and not every turn.
- Don't sound unintelligent or vague to the point of being unhelpful.
- Don't say "I'd be happy to assist", "Thank you for your patience", "Is there anything else I can help you with today?", or any customer-support-training phrasing.
- Don't give long structured responses or numbered lists out loud.
- Don't explain too much unless asked.
- Don't sound overly polished or polite.
- Don't repeat the same phrase twice in a call.

GOOD EXAMPLES:
- "Yeah one sec, just checking that now…"
- "Ah yep, looks like we can do 7:30."
- "Honestly Friday's pretty packed already."
- "Mm, let me see what we've got."
- "Yep all good, you're booked in."

${cfg?.customInstructions ? `CUSTOM INSTRUCTIONS FROM THE OWNER\n${cfg.customInstructions}\n` : ""}`;
}

// Lookup caller context by phone number → returns dynamic_variables for ElevenLabs.
// Format a Date as Australian local strings.
const AU_TZ = "Australia/Sydney";
function fmtAuDateTime(d: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: AU_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(d);
}
function fmtAuLongDate(d: Date) {
  return new Intl.DateTimeFormat("en-AU", { timeZone: AU_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}
function fmtAuWeekday(d: Date) {
  return new Intl.DateTimeFormat("en-AU", { timeZone: AU_TZ, weekday: "long" }).format(d);
}

export async function buildCallerContext(sb: any, venueId: string, callerPhone: string) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const base: Record<string, string> = {
    caller_number: callerPhone || "unknown",
    caller_known: "no",
    caller_name: "",
    caller_first_name: "",
    caller_notes: "none",
    caller_history: "no prior visits on record",
    caller_bookings: "none on file",
    caller_next_booking: "none",
    venue_timezone: AU_TZ,
    current_datetime_local: fmtAuDateTime(now),
    today_long: fmtAuLongDate(now),
    today_weekday: fmtAuWeekday(now),
    tomorrow_long: fmtAuLongDate(tomorrow),
    tomorrow_weekday: fmtAuWeekday(tomorrow),
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
    const setNextBooking = (bks: any[]) => {
      if (!bks?.length) return;
      const now = Date.now();
      const upcoming = bks.filter((b: any) => new Date(b.booking_time).getTime() >= now)
        .sort((a: any, b: any) => new Date(a.booking_time).getTime() - new Date(b.booking_time).getTime());
      const chosen = upcoming[0] || bks[0];
      if (chosen) {
        base.caller_next_booking = `party of ${chosen.party_size} on ${fmtAuDateTime(new Date(chosen.booking_time))} (${chosen.status})`;
      }
    };
    if (guest) {
      base.caller_known = "yes";
      base.caller_name = guest.name || "";
      base.caller_first_name = (guest.name || "").trim().split(/\s+/)[0] || "";
      const tagPart = guest.tags?.length ? `tags: ${guest.tags.join(", ")}` : "";
      const vipPart = guest.vip ? "VIP guest" : "";
      base.caller_notes = [vipPart, tagPart, guest.notes].filter(Boolean).join(" — ") || "none";
      base.caller_history = guest.visit_count
        ? `${guest.visit_count} previous visit(s)${guest.last_visit ? `, last on ${new Date(guest.last_visit).toDateString()}` : ""}`
        : "no prior visits on record";
      const { data: bks } = await sb
        .from("bookings")
        .select("id,party_size,booking_time,status,notes")
        .eq("venue_id", venueId)
        .eq("guest_id", guest.id)
        .order("booking_time", { ascending: false })
        .limit(10);
      if (bks?.length) {
        base.caller_bookings = bks.map((b: any) =>
          `party of ${b.party_size} on ${fmtAuDateTime(new Date(b.booking_time))} (${b.status})${b.notes ? ` — ${b.notes}` : ""}`
        ).join(" | ");
        setNextBooking(bks);
      }
    } else {
      const { data: bks } = await sb
        .from("bookings")
        .select("id,guest_name,guest_phone,party_size,booking_time,status")
        .eq("venue_id", venueId)
        .not("guest_phone", "is", null)
        .order("booking_time", { ascending: false })
        .limit(200);
      const matches = (bks || []).filter((b: any) => matchPhone(b.guest_phone));
      if (matches.length) {
        base.caller_known = "yes";
        base.caller_name = matches[0].guest_name || "";
        base.caller_first_name = (matches[0].guest_name || "").trim().split(/\s+/)[0] || "";
        base.caller_bookings = matches
          .map((b: any) => `party of ${b.party_size} on ${fmtAuDateTime(new Date(b.booking_time))} (${b.status})`)
          .join(" | ");
        setNextBooking(matches);
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
  if (tools.update_booking !== false) {
    toolDefs.push({
      type: "client",
      name: "update_booking",
      description: "Modify or cancel an existing booking. Provide as many identifying details as possible (booking_id if known, otherwise guest_name + original_booking_time + guest_phone). Set action to 'cancel' to cancel, or 'update' with the new fields.",
      parameters: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", description: "Either 'update' or 'cancel'." },
          booking_id: { type: "string", description: "Booking id if known from caller context." },
          guest_name: { type: "string", description: "Name on the booking, used to find it if no id." },
          guest_phone: { type: "string", description: "Phone on the booking, used to find it if no id." },
          original_booking_time: { type: "string", description: "Current ISO 8601 time on the booking, used to identify it." },
          new_booking_time: { type: "string", description: "New ISO 8601 datetime if changing the time." },
          new_party_size: { type: "integer", description: "New party size if changing." },
          notes: { type: "string", description: "New or additional notes." },
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
      asr: { quality: "high", user_input_audio_format: "ulaw_8000" },
      turn: { turn_timeout: 1, silence_end_call_timeout: 30, mode: "turn" },
      tts: {
        voice_id: voiceId,
        model_id: "eleven_flash_v2",
        agent_output_audio_format: "ulaw_8000",
        stability: typeof cfg?.stability === "number" ? cfg.stability : 0.4,
        similarity_boost: typeof cfg?.similarity_boost === "number" ? cfg.similarity_boost : 0.75,
        style: typeof cfg?.style === "number" ? cfg.style : 0.05,
        use_speaker_boost: false,
        speed: typeof cfg?.speed === "number" ? cfg.speed : 1.0,
        optimize_streaming_latency: 3,
      },
      conversation: { max_duration_seconds: 1800 },
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
