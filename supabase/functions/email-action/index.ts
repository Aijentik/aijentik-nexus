// Approves/edits/rejects/undoes an AI email action.
// Executes side-effects: send reply via Mailgun (if connected) or log-only,
// create/update/cancel booking in DB.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const MAILGUN_KEY = Deno.env.get("MAILGUN_CONNECTION_KEY") ?? Deno.env.get("MAILGUN_API_KEY") ?? "";

async function sendViaMailgun(opts: {
  domain: string; from: string; to: string; subject: string; text: string; inReplyTo?: string | null;
}) {
  if (!LOVABLE_API_KEY || !MAILGUN_KEY) return { ok: false, skipped: true, reason: "mailgun not connected" };
  const body = new URLSearchParams({
    from: opts.from, to: opts.to, subject: opts.subject, text: opts.text,
  });
  if (opts.inReplyTo) body.set("h:In-Reply-To", opts.inReplyTo);
  const res = await fetch(`https://connector-gateway.lovable.dev/mailgun/${opts.domain}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": MAILGUN_KEY,
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, skipped: false, error: `mailgun ${res.status}: ${JSON.stringify(json)}` };
  return { ok: true, provider_id: json.id || null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action_id, decision, edited_body, edited_subject } = await req.json();
    if (!action_id || !decision) throw new Error("action_id and decision required");

    // Authenticate user via JWT (if signed in) — service key for operations
    const userJwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const userClient = userJwt && userJwt !== SERVICE_KEY
      ? createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
          global: { headers: { Authorization: `Bearer ${userJwt}` } }, auth: { persistSession: false },
        })
      : null;
    let userId: string | null = null;
    if (userClient) {
      const { data: u } = await userClient.auth.getUser();
      userId = u?.user?.id ?? null;
    }

    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: action } = await svc
      .from("email_ai_actions").select("*, email_threads(*, email_inboxes(*))")
      .eq("id", action_id).single();
    if (!action) throw new Error("action not found");

    const thread = (action as any).email_threads;
    const inbox = thread?.email_inboxes;

    if (decision === "reject") {
      await svc.from("email_ai_actions").update({
        status: "rejected", executed_by: userId, executed_at: new Date().toISOString(),
      }).eq("id", action_id);
      return new Response(JSON.stringify({ ok: true, status: "rejected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (decision === "undo") {
      if (action.status !== "executed") throw new Error("only executed actions can be undone");
      const result: any = action.result || {};
      // Reverse side-effects
      if (result.booking_id && (action.kind === "create_booking")) {
        await svc.from("bookings").update({ status: "cancelled" }).eq("id", result.booking_id);
      } else if (result.booking_id && action.kind === "update_booking" && result.previous) {
        await svc.from("bookings").update(result.previous).eq("id", result.booking_id);
      } else if (result.booking_id && action.kind === "cancel_booking" && result.previous_status) {
        await svc.from("bookings").update({ status: result.previous_status }).eq("id", result.booking_id);
      }
      await svc.from("email_ai_actions").update({
        status: "undone", reverted_at: new Date().toISOString(),
      }).eq("id", action_id);
      await svc.from("brain_events").insert({
        venue_id: action.venue_id, title: `AI email action undone`, severity: "warn",
        meta: { action_id, kind: action.kind },
      });
      return new Response(JSON.stringify({ ok: true, status: "undone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (decision !== "execute") throw new Error("invalid decision");

    const payload: any = action.payload || {};
    const result: any = {};

    // 1) Side-effect by kind
    if (action.kind === "create_booking" && payload.requested_time_iso && payload.party_size) {
      const { data: booking } = await svc.from("bookings").insert({
        venue_id: action.venue_id,
        guest_name: payload.guest_name || thread.guest_name || thread.guest_email,
        guest_email: thread.guest_email,
        party_size: payload.party_size,
        booking_time: payload.requested_time_iso,
        status: "pending",
        source: "ai_email",
        notes: payload.dietary_notes ? `Dietary: ${payload.dietary_notes}` : null,
      }).select("id").single();
      result.booking_id = booking?.id;
    } else if (action.kind === "update_booking") {
      // Best-effort: find latest booking by email
      const { data: b } = await svc.from("bookings")
        .select("id, booking_time, party_size, status")
        .eq("venue_id", action.venue_id).eq("guest_email", thread.guest_email)
        .order("booking_time", { ascending: false }).limit(1).maybeSingle();
      if (b) {
        const patch: any = {};
        if (payload.requested_time_iso) patch.booking_time = payload.requested_time_iso;
        if (payload.party_size) patch.party_size = payload.party_size;
        if (Object.keys(patch).length) {
          await svc.from("bookings").update(patch).eq("id", b.id);
          result.booking_id = b.id;
          result.previous = { booking_time: b.booking_time, party_size: b.party_size };
        }
      }
    } else if (action.kind === "cancel_booking") {
      const { data: b } = await svc.from("bookings")
        .select("id, status")
        .eq("venue_id", action.venue_id).eq("guest_email", thread.guest_email)
        .neq("status", "cancelled")
        .order("booking_time", { ascending: false }).limit(1).maybeSingle();
      if (b) {
        await svc.from("bookings").update({ status: "cancelled" }).eq("id", b.id);
        result.booking_id = b.id;
        result.previous_status = b.status;
      }
    }

    // 2) Send reply (unless no_action)
    if (action.kind !== "no_action") {
      const subject = edited_subject || payload.reply_subject || `Re: ${thread.subject}`;
      const body = edited_body || payload.reply_body || "";
      const fromAddr = inbox?.reply_from_address || inbox?.forwarding_address;
      const fromName = inbox?.reply_from_name || "Reservations";
      const fromHeader = `${fromName} <${fromAddr}>`;
      const domain = fromAddr?.split("@")[1];

      // last inbound message id for threading
      const { data: lastInbound } = await svc.from("email_messages")
        .select("message_provider_id").eq("thread_id", thread.id).eq("direction", "inbound")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const send = await sendViaMailgun({
        domain: domain ?? "",
        from: fromHeader, to: thread.guest_email, subject, text: body,
        inReplyTo: lastInbound?.message_provider_id ?? null,
      });
      result.send = send;

      await svc.from("email_messages").insert({
        thread_id: thread.id, venue_id: action.venue_id, direction: "outbound",
        from_address: fromAddr, to_address: thread.guest_email,
        subject, body_text: body, ai_generated: true,
        sent_by: userId, message_provider_id: (send as any).provider_id ?? null,
      });
      await svc.from("email_threads").update({
        last_message_at: new Date().toISOString(), unread: false,
        status: payload.needs_clarification ? "awaiting_guest" : "resolved",
      }).eq("id", thread.id);
    }

    await svc.from("email_ai_actions").update({
      status: "executed", result, executed_by: userId, executed_at: new Date().toISOString(),
    }).eq("id", action_id);

    await svc.from("brain_events").insert({
      venue_id: action.venue_id,
      title: `AI email · executed ${action.kind}`,
      severity: result.send?.ok === false && !result.send?.skipped ? "warn" : "success",
      reason: result.send?.skipped ? "Reply not sent — Mailgun not connected (logged only)" : undefined,
      meta: { action_id, ...result },
    });

    return new Response(JSON.stringify({ ok: true, status: "executed", result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[email-action]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
