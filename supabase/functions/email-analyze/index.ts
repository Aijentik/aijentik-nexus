// Reads the latest inbound message in a thread, calls Lovable AI to classify
// intent + extract entities + draft a reply + score confidence. Writes an
// email_ai_action (status proposed/pending_approval) and an email_draft.
// If confidence >= inbox.auto_send_threshold and ai_takeover, auto-executes
// the reply via email-action.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { generateText, Output } from "npm:ai@^5.0.0";
import { z } from "npm:zod@^3.23.0";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const analysisSchema = z.object({
  intent: z.enum([
    "new_booking","modify_booking","cancel_booking","dietary","vip_request",
    "event_enquiry","function_enquiry","takeaway_order","general_question","spam","other",
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  guest_name: z.string().nullable(),
  party_size: z.number().int().nullable(),
  requested_time_iso: z.string().nullable(),
  dietary_notes: z.string().nullable(),
  vip_signals: z.string().nullable(),
  needs_clarification: z.boolean(),
  reply_subject: z.string(),
  reply_body: z.string(),
  order_fulfillment: z.enum(["takeaway","delivery","dine_in"]).nullable(),
  delivery_address: z.string().nullable(),
  pickup_time_iso: z.string().nullable(),
  order_items: z.array(z.object({
    name: z.string(),
    qty: z.number().int().min(1),
    modifiers: z.string().nullable(),
    notes: z.string().nullable(),
  })).nullable(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { thread_id } = await req.json();
    if (!thread_id) throw new Error("thread_id required");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: thread } = await supabase
      .from("email_threads")
      .select("*, email_inboxes(*)")
      .eq("id", thread_id)
      .single();
    if (!thread) throw new Error("thread not found");

    const { data: msgs } = await supabase
      .from("email_messages")
      .select("direction, from_address, body_text, subject, created_at")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: true })
      .limit(20);

    const { data: venue } = await supabase
      .from("venues")
      .select("name, brand_voice, hours, address, phone, cuisine")
      .eq("id", thread.venue_id)
      .single();

    // Quick live availability snapshot for next 14 days
    const nextWeek = new Date(Date.now() + 14 * 86400e3).toISOString();
    const { data: upcoming } = await supabase
      .from("bookings")
      .select("booking_time, party_size")
      .eq("venue_id", thread.venue_id)
      .gte("booking_time", new Date().toISOString())
      .lte("booking_time", nextWeek)
      .neq("status", "cancelled");

    const inbox = (thread as any).email_inboxes;
    const transcript = (msgs || []).map(m =>
      `[${m.direction === "inbound" ? "GUEST" : "VENUE"} ${m.created_at}] ${m.subject ? `(${m.subject}) ` : ""}${m.body_text || ""}`
    ).join("\n\n");

    const system = `You are the AI Email Operations Manager for "${venue?.name ?? "the venue"}".
Brand voice: ${venue?.brand_voice ?? "warm, professional, concise"}.
Cuisine/style: ${venue?.cuisine ?? "—"}.
Address: ${venue?.address ?? "—"}.
You handle inbound emails: new bookings, modifications, cancellations, dietary, VIPs, events.
Always:
- Be concise (4–8 sentences max), warm, on-brand.
- Confirm details (date/time/party size) explicitly when proposing a booking.
- Never invent menu items or policies you weren't told.
- If you are unsure or missing critical info, ask one clarifying question and set needs_clarification=true.
- confidence reflects how safe it would be to auto-send AND auto-execute the action without a human.
  Use >=0.85 only when intent is unambiguous and required fields are present and consistent with venue availability.
Live availability snapshot (upcoming 14 days, ${upcoming?.length ?? 0} bookings on books).`;

    const provider = createLovableAiGatewayProvider(LOVABLE_API_KEY);
    const model = provider("google/gemini-3-flash-preview");

    const { output } = await generateText({
      model,
      system,
      prompt: `Email thread (oldest first):\n\n${transcript}\n\nClassify intent, extract entities, and draft the reply.`,
      output: Output.object({ schema: analysisSchema }),
    });

    const intent = output.intent;
    const confidence = Math.max(0, Math.min(1, output.confidence));

    // Decide action kind
    let kind: string = "reply";
    if (intent === "new_booking" && !output.needs_clarification && output.party_size && output.requested_time_iso) kind = "create_booking";
    else if (intent === "modify_booking") kind = "update_booking";
    else if (intent === "cancel_booking") kind = "cancel_booking";
    else if (intent === "spam") kind = "no_action";
    else kind = "reply";

    const threshold = Number(inbox?.auto_send_threshold ?? 0.85);
    const willAuto = thread.ai_takeover && confidence >= threshold && kind !== "no_action" && !output.needs_clarification;

    // Update thread intent
    await supabase.from("email_threads").update({
      intent,
      status: willAuto ? "awaiting_guest" : "awaiting_staff",
    }).eq("id", thread_id);

    // Create AI action
    const { data: action } = await supabase.from("email_ai_actions").insert({
      thread_id,
      venue_id: thread.venue_id,
      kind,
      status: willAuto ? "approved" : "pending_approval",
      confidence,
      reasoning: output.reasoning,
      payload: {
        intent,
        guest_name: output.guest_name,
        party_size: output.party_size,
        requested_time_iso: output.requested_time_iso,
        dietary_notes: output.dietary_notes,
        vip_signals: output.vip_signals,
        needs_clarification: output.needs_clarification,
        reply_subject: output.reply_subject,
        reply_body: output.reply_body,
      },
    }).select("id").single();

    // Create draft
    await supabase.from("email_drafts").insert({
      thread_id,
      venue_id: thread.venue_id,
      subject: output.reply_subject,
      body_text: output.reply_body,
      confidence,
      reasoning: output.reasoning,
      action_id: action?.id,
    });

    // Log brain event
    await supabase.from("brain_events").insert({
      venue_id: thread.venue_id,
      title: `AI email · ${intent}${willAuto ? " · auto" : " · awaiting approval"}`,
      reason: output.reasoning,
      severity: willAuto ? "success" : "info",
      meta: { thread_id, action_id: action?.id, confidence },
    });

    // Auto-execute if confidence high enough
    if (willAuto && action?.id) {
      fetch(`${SUPABASE_URL}/functions/v1/email-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ action_id: action.id, decision: "execute" }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ ok: true, action_id: action?.id, confidence, intent, auto: willAuto }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[email-analyze]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
