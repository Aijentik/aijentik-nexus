// Inbound email webhook — accepts Mailgun-style or generic JSON payloads.
// Routes by recipient address to the matching venue inbox, creates/updates
// thread, stores message, then kicks off AI analysis.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function pick(obj: Record<string, any>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function parseAddress(raw: string | null): { name: string | null; email: string } {
  if (!raw) return { name: null, email: "" };
  const m = raw.match(/^\s*(?:"?([^"<]+?)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/);
  if (!m) return { name: null, email: raw };
  return { name: m[1]?.trim() || null, email: m[2].toLowerCase() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ct = req.headers.get("content-type") || "";
    let payload: Record<string, any> = {};
    if (ct.includes("application/json")) {
      payload = await req.json();
    } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) payload[k] = typeof v === "string" ? v : "";
    } else {
      const txt = await req.text();
      try { payload = JSON.parse(txt); } catch { payload = { raw: txt }; }
    }

    const to = pick(payload, ["recipient", "To", "to"]);
    const from = pick(payload, ["sender", "From", "from"]);
    const subject = pick(payload, ["subject", "Subject"]) || "(no subject)";
    const bodyText = pick(payload, ["body-plain", "stripped-text", "text", "body_text"]) || "";
    const bodyHtml = pick(payload, ["body-html", "html", "body_html"]) || null;
    const messageId = pick(payload, ["Message-Id", "message_id", "messageId"]) || null;
    const inReplyTo = pick(payload, ["In-Reply-To", "in_reply_to"]) || null;

    if (!to || !from) {
      return new Response(JSON.stringify({ error: "missing recipient/sender" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipient = parseAddress(to).email.toLowerCase();
    const sender = parseAddress(from);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: inbox, error: inboxErr } = await supabase
      .from("email_inboxes")
      .select("id, venue_id, enabled")
      .eq("forwarding_address", recipient)
      .maybeSingle();

    if (inboxErr) throw inboxErr;
    if (!inbox || !inbox.enabled) {
      return new Response(JSON.stringify({ error: "no active inbox for recipient", recipient }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find existing thread by subject + guest in last 14 days, else create
    const normSubject = subject.replace(/^\s*(re|fwd?):\s*/i, "").trim().slice(0, 200);
    const since = new Date(Date.now() - 14 * 86400e3).toISOString();

    let threadId: string;
    const { data: existing } = await supabase
      .from("email_threads")
      .select("id, message_count")
      .eq("venue_id", inbox.venue_id)
      .eq("guest_email", sender.email)
      .ilike("subject", `%${normSubject.slice(0, 60)}%`)
      .gte("last_message_at", since)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      threadId = existing.id;
      await supabase.from("email_threads").update({
        last_message_at: new Date().toISOString(),
        message_count: (existing.message_count || 0) + 1,
        unread: true,
        status: "open",
      }).eq("id", threadId);
    } else {
      const { data: created, error: createErr } = await supabase.from("email_threads").insert({
        venue_id: inbox.venue_id,
        inbox_id: inbox.id,
        subject: normSubject,
        guest_email: sender.email,
        guest_name: sender.name,
        message_count: 1,
      }).select("id").single();
      if (createErr) throw createErr;
      threadId = created.id;
    }

    const { data: msg, error: msgErr } = await supabase.from("email_messages").insert({
      thread_id: threadId,
      venue_id: inbox.venue_id,
      direction: "inbound",
      from_address: sender.email,
      to_address: recipient,
      subject,
      body_text: bodyText,
      body_html: bodyHtml,
      message_provider_id: messageId,
      in_reply_to: inReplyTo,
    }).select("id").single();
    if (msgErr) throw msgErr;

    // VIP check
    const { data: guest } = await supabase
      .from("guests")
      .select("vip, visit_count, name")
      .eq("venue_id", inbox.venue_id)
      .eq("email", sender.email)
      .maybeSingle();
    if (guest?.vip) {
      await supabase.from("email_threads").update({ vip: true }).eq("id", threadId);
    }

    // Fire-and-forget AI analysis
    fetch(`${SUPABASE_URL}/functions/v1/email-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ thread_id: threadId, message_id: msg.id }),
    }).catch(() => {});

    return new Response(JSON.stringify({ ok: true, thread_id: threadId, message_id: msg.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[email-inbound]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
