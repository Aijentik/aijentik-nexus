// Twilio WhatsApp inbound webhook.
// Receives a WhatsApp message via Twilio, routes it through the venue's AI host,
// and replies on the same WhatsApp thread. Stores both sides on public.messages.
//
// Twilio sender configuration:
//   When a message comes in -> POST
//   https://<project-ref>.supabase.co/functions/v1/whatsapp-inbound
//
// We identify the venue using the `To` number Twilio called us on (the
// venue's configured WhatsApp sender, stored on venues.features.channels.whatsapp.sender).
// For the Twilio Sandbox the sender is shared (whatsapp:+14155238886) — we fall back
// to the most-recently-updated venue that has WhatsApp marked connected.

import { createClient } from "npm:@supabase/supabase-js@2";

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function twiml(body: string) {
  // Empty TwiML so Twilio doesn't double-reply — we send the AI reply via REST.
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { ...cors, "Content-Type": "text/xml" }, status: 200 },
  );
}

function normalizeWa(n: string | null): string | null {
  if (!n) return null;
  return n.replace(/^whatsapp:/i, "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Twilio posts application/x-www-form-urlencoded
    const form = await req.formData();
    const fromWa = form.get("From")?.toString() || ""; // whatsapp:+15551234567
    const toWa = form.get("To")?.toString() || "";     // whatsapp:+14155238886 (sandbox)
    const bodyText = form.get("Body")?.toString()?.trim() || "";
    const profileName = form.get("ProfileName")?.toString() || "";

    const fromE164 = normalizeWa(fromWa);
    const toE164 = normalizeWa(toWa);
    if (!fromE164 || !bodyText) return twiml("");

    // 1) Find the venue this message is for.
    // Prefer exact match on configured WhatsApp sender; fall back to any venue with WA connected.
    let venue: any = null;
    if (toE164) {
      const { data: byNum } = await sb
        .from("venues")
        .select("*")
        .filter("features->channels->whatsapp->>sender", "eq", toE164)
        .maybeSingle();
      venue = byNum;
    }
    if (!venue) {
      const { data: anyWa } = await sb
        .from("venues")
        .select("*")
        .filter("features->channels->whatsapp->>connected", "eq", "true")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      venue = anyWa;
    }
    if (!venue) {
      console.warn("whatsapp-inbound: no venue mapped for", toE164);
      return twiml("");
    }

    // 2) Upsert guest by phone.
    let guestId: string | null = null;
    const { data: existing } = await sb
      .from("guests").select("id,name").eq("venue_id", venue.id).eq("phone", fromE164).maybeSingle();
    if (existing) {
      guestId = existing.id;
    } else {
      const { data: g } = await sb
        .from("guests")
        .insert({ venue_id: venue.id, phone: fromE164, name: profileName || "WhatsApp guest" })
        .select("id").maybeSingle();
      guestId = g?.id || null;
    }

    // 3) Persist inbound message.
    await sb.from("messages").insert({
      venue_id: venue.id, contact: fromE164, body: bodyText,
      channel: "whatsapp", direction: "inbound", status: "received",
    });

    // 4) Load recent thread for context (last 10 turns on this contact).
    const { data: history } = await sb
      .from("messages")
      .select("direction, body, created_at")
      .eq("venue_id", venue.id).eq("channel", "whatsapp").eq("contact", fromE164)
      .order("created_at", { ascending: false }).limit(10);
    const turns = (history || []).slice().reverse().map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.body,
    }));

    // 5) Load light knowledge base for grounding.
    const { data: kb } = await sb.from("knowledge_base")
      .select("title,content").eq("venue_id", venue.id).limit(20);

    const system = `You are ${venue.name}'s AI host on WhatsApp.
${venue.description || ""}
Brand voice: ${venue.brand_voice || "warm, concise, professional"}.
Reply briefly (1–3 short sentences, friendly, no markdown — this is WhatsApp).
For booking requests, collect: name, party size, date, time, phone, then confirm.
Knowledge:
${(kb || []).map((k: any) => `- ${k.title}: ${k.content}`).join("\n")}`;

    // 6) Generate AI reply via Lovable AI Gateway.
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, ...turns],
      }),
    });
    const aiData = await aiRes.json().catch(() => ({}));
    const reply = aiData?.choices?.[0]?.message?.content?.trim()
      || "Thanks for your message — we'll be right with you.";

    // 7) Send reply via Twilio.
    const sendRes = await fetch(`${GATEWAY}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `whatsapp:${fromE164}`,
        From: toWa || `whatsapp:${toE164 || ""}`,
        Body: reply,
      }),
    });
    const sendData = await sendRes.json().catch(() => ({}));
    const status = sendRes.ok ? "sent" : "failed";

    await sb.from("messages").insert({
      venue_id: venue.id, contact: fromE164, body: reply,
      channel: "whatsapp", direction: "outbound", status,
    });

    if (!sendRes.ok) {
      console.error("whatsapp-inbound send failed", sendRes.status, sendData);
    }

    if (guestId) {
      await sb.from("brain_events").insert({
        venue_id: venue.id, title: "WhatsApp reply sent",
        reason: `AI responded to ${profileName || fromE164}`, severity: "info",
      });
    }

    return twiml("");
  } catch (e) {
    console.error("whatsapp-inbound error", e);
    return twiml("");
  }
});
