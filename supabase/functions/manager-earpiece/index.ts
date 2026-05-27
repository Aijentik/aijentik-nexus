import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// ---------- Intent pre-classifier ----------
// If the question maps cleanly to a fast data lookup, we answer with deterministic text
// derived from the live context and skip the LLM entirely (sub-second response).
type Intent =
  | { kind: "covers" }
  | { kind: "bookings_count" }
  | { kind: "vips" }
  | { kind: "pending_emails" }
  | { kind: "next_booking" }
  | { kind: "capacity" }
  | null;

function classifyIntent(q: string): Intent {
  const t = q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (/(how many|whats|what is|tell me).*(cover|covers)|covers (tonight|today)|^covers\b/.test(t)) return { kind: "covers" };
  if (/(how many|count|what|which).*(booking|reservation)|bookings? (tonight|today)|bookings?.*(coming|got|have|tonight|today)|^bookings?$/.test(t)) return { kind: "bookings_count" };
  if (/\bvips?\b|any vip|big spenders|regulars in/.test(t)) return { kind: "vips" };
  if (/\bemail/.test(t) && /(handle|reply|pending|awaiting|need)/.test(t)) return { kind: "pending_emails" };
  if (/\bnext (booking|reservation|guest)|whats next|who is next/.test(t)) return { kind: "next_booking" };
  if (/(capacity|how full|how busy|utilisation|utilization)/.test(t)) return { kind: "capacity" };
  return null;
}

function sseStream(text: string): ReadableStream<Uint8Array> {
  // Split into ~12-char chunks for natural streaming feel; client groups by sentence anyway.
  const enc = new TextEncoder();
  const chunks: string[] = [];
  let remainder = text;
  while (remainder.length > 0) {
    const take = Math.min(remainder.length, 18 + Math.floor(Math.random() * 12));
    chunks.push(remainder.slice(0, take));
    remainder = remainder.slice(take);
  }
  return new ReadableStream({
    async start(controller) {
      for (const c of chunks) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`));
        await new Promise(r => setTimeout(r, 12));
      }
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

// ---------- In-memory context cache (per warm isolate) ----------
// Skips the 6 Supabase queries on repeat questions within the TTL window.
// This is the single biggest first-token latency win on follow-ups.
const CTX_TTL_MS = 20_000;
type CtxBundle = {
  venue: any; bookings: any[]; tables: any[]; vips: any[];
  pendingEmails: any[]; recentCalls: any[]; ts: number;
};
const ctxCache = new Map<string, CtxBundle>();

function repairQuestion(q: string): string {
  const words = q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const starts = words.map((word, index) => (/^(who|what|when|where|why|how|which|any|is|are|can|could|do|does|did|will|walk|show|tell|check|find|book|seat)$/.test(word) ? index : -1)).filter(i => i >= 0);
  if (starts.length >= 3) return words.slice(starts[starts.length - 1]).filter(w => w !== "hi" && w !== "hello").join(" ");
  return words.join(" ");
}

async function loadContext(supabase: any, venue_id: string): Promise<CtxBundle> {
  const cached = ctxCache.get(venue_id);
  if (cached && Date.now() - cached.ts < CTX_TTL_MS) return cached;

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const endOfTomorrow = new Date(tomorrow.setHours(23, 59, 59, 999)).toISOString();

  const [venueRes, bookingsRes, tablesRes, vipRes, threadsRes, callsRes] = await Promise.all([
    supabase.from("venues").select("name,cuisine,capacity,brand_voice").eq("id", venue_id).maybeSingle(),
    supabase.from("bookings").select("guest_name,party_size,booking_time,status,notes,table_id")
      .eq("venue_id", venue_id).gte("booking_time", startOfDay).lte("booking_time", endOfTomorrow)
      .order("booking_time").limit(60),
    supabase.from("tables").select("label,capacity,zone_id").eq("venue_id", venue_id).limit(100),
    supabase.from("guests").select("name,visit_count,tags,notes").eq("venue_id", venue_id).eq("vip", true).limit(20),
    supabase.from("email_threads").select("guest_name,subject,intent,status,last_message_at")
      .eq("venue_id", venue_id).eq("status", "awaiting_staff").limit(10),
    supabase.from("calls").select("caller,outcome,summary,started_at")
      .eq("venue_id", venue_id).order("started_at", { ascending: false }).limit(5),
  ]);

  const bundle: CtxBundle = {
    venue: venueRes.data,
    bookings: bookingsRes.data || [],
    tables: tablesRes.data || [],
    vips: vipRes.data || [],
    pendingEmails: threadsRes.data || [],
    recentCalls: callsRes.data || [],
    ts: Date.now(),
  };
  ctxCache.set(venue_id, bundle);
  return bundle;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { venue_id, question, page, history } = body as {
      venue_id: string;
      question: string;
      page?: string;
      history?: { role: "user" | "assistant"; content: string }[];
    };
    if (!venue_id || !question) {
      return new Response(JSON.stringify({ error: "venue_id and question required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const safeHistory = Array.isArray(history)
      ? history
          .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
          .slice(-8)
          .map(m => ({ role: m.role, content: m.content.slice(0, 600) }))
      : [];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cleanedQuestion = repairQuestion(question);
    const { venue, bookings, tables, vips, pendingEmails, recentCalls } = await loadContext(supabase, venue_id);


    const covers = bookings.reduce((s: number, b: any) => s + (b.party_size || 0), 0);
    const totalCap = tables.reduce((s: number, t: any) => s + (t.capacity || 0), 0);
    const nowMs = Date.now();
    const upcoming = bookings.filter((b: any) => new Date(b.booking_time).getTime() >= nowMs - 5 * 60 * 1000);
    const next = upcoming[0];

    const ctxSummary = {
      bookings: bookings.length, covers, vips: vips.length, pending_emails: pendingEmails.length,
    };
    const ctxHeader = btoa(JSON.stringify(ctxSummary));

    // ---------- Try intent pre-classifier (skip LLM) ----------
    const intent = classifyIntent(cleanedQuestion || question);
    if (intent) {
      let answer = "";
      switch (intent.kind) {
        case "covers":
          answer = bookings.length
            ? `${covers} covers across ${bookings.length} bookings${totalCap ? `, against ${totalCap} seats` : ""}.`
            : "No covers on the book yet for today.";
          break;
        case "bookings_count":
          answer = bookings.length
            ? `${bookings.length} bookings on the book, ${covers} covers total.`
            : "Nothing booked in yet for today.";
          break;
        case "vips":
          answer = vips.length
            ? `${vips.length} VIPs flagged. Top one: ${vips[0].name}${vips[0].visit_count ? ` (${vips[0].visit_count} visits)` : ""}.`
            : "No VIPs flagged on the book right now.";
          break;
        case "pending_emails":
          answer = pendingEmails.length
            ? `${pendingEmails.length} emails awaiting you. First up: ${pendingEmails[0].guest_name || "guest"} — ${pendingEmails[0].subject}.`
            : "Inbox is clear, nothing waiting on you.";
          break;
        case "next_booking":
          answer = next
            ? `Next is ${next.guest_name}, party of ${next.party_size}, at ${new Date(next.booking_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
            : "Nothing more on the book today.";
          break;
        case "capacity": {
          const pct = totalCap ? Math.round((covers / totalCap) * 100) : 0;
          answer = totalCap
            ? `Sitting at ${pct}% of capacity — ${covers} of ${totalCap} seats.`
            : `${covers} covers booked. Capacity not set up yet.`;
          break;
        }
      }

      // Log fast-path response too
      (async () => {
        try {
          await supabase.from("brain_events").insert({
            venue_id, title: `Ear-piece: ${(cleanedQuestion || question).slice(0, 60)}`, severity: "info",
            reason: answer.slice(0, 200), meta: { question, cleaned_question: cleanedQuestion, answer, kind: "manager_earpiece", intent: intent.kind, fast_path: true, page },
          });
        } catch (e) { console.warn("log failed", e); }
      })();

      return new Response(sseStream(answer), {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Earpiece-Context": ctxHeader,
          "X-Earpiece-FastPath": intent.kind,
          "Access-Control-Expose-Headers": "X-Earpiece-Context, X-Earpiece-FastPath",
        },
      });
    }

    // ---------- Context-aware bias from current page ----------
    const pageBias = (() => {
      if (!page) return "";
      const p = page.toLowerCase();
      if (p.includes("booking")) return "The manager is on the Bookings screen — assume bookings/seating questions unless stated otherwise.";
      if (p.includes("email") || p.includes("inbox")) return "The manager is on the Inbox/Emails screen — assume email/reply questions unless stated otherwise.";
      if (p.includes("guest")) return "The manager is on the Guests screen — assume guest/VIP questions unless stated otherwise.";
      if (p.includes("call")) return "The manager is on the Calls screen — assume call/phone questions unless stated otherwise.";
      if (p.includes("dashboard") || p === "/" || p.includes("index")) return "The manager is on the Dashboard — assume high-level service status questions.";
      return "";
    })();

    const context = `
VENUE: ${venue?.name || "Unknown"} (${venue?.cuisine || "—"}, capacity ${venue?.capacity || "?"})
Brand voice: ${venue?.brand_voice || "warm, professional, concise"}

TODAY/TOMORROW BOOKINGS (${bookings.length} bookings, ${covers} covers vs ${totalCap} seats):
${bookings.slice(0, 20).map((b: any) => `- ${new Date(b.booking_time).toLocaleString()}: ${b.guest_name} party of ${b.party_size} (${b.status})${b.notes ? ` — ${b.notes}` : ""}`).join("\n") || "None"}

VIP GUESTS (${vips.length}):
${vips.slice(0, 8).map((g: any) => `- ${g.name} (${g.visit_count} visits)${g.tags?.length ? ` [${g.tags.join(", ")}]` : ""}${g.notes ? ` — ${g.notes}` : ""}`).join("\n") || "None"}

EMAILS AWAITING STAFF (${pendingEmails.length}):
${pendingEmails.map((t: any) => `- ${t.guest_name || "?"}: ${t.subject} [${t.intent}]`).join("\n") || "None"}

RECENT CALLS:
${recentCalls.map((c: any) => `- ${c.caller || "?"}: ${c.outcome}${c.summary ? ` — ${c.summary}` : ""}`).join("\n") || "None"}
`.trim();

    const messages = [
      {
        role: "system",
        content: `You are the manager's AI ear-piece — a fast, confident, calm operations co-pilot speaking directly into a venue manager's ear during service.

Style: short, spoken English. 1-2 sentences max. No bullet points, no markdown, no preambles like "Sure" or "Based on the data". Speak like a trusted GM whispering insight. Use the venue's brand voice.

Answer ONLY the user's question. Use ONLY the live context below. If asked for an action, describe what you'd do; do not invent confirmations.
${pageBias ? `\nCONTEXT BIAS: ${pageBias}\n` : ""}
LIVE CONTEXT:
${context}`,
      },
      { role: "user", content: cleanedQuestion || question },
    ];

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages,
        temperature: 0.2,
        max_tokens: 120,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text();
      return new Response(JSON.stringify({ error: "AI gateway error", detail: txt }), {
        status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [forClient, forLog] = upstream.body.tee();

    (async () => {
      try {
        const reader = forLog.getReader();
        const dec = new TextDecoder();
        let buf = ""; let full = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const d = t.slice(5).trim();
            if (!d || d === "[DONE]") continue;
            try { full += JSON.parse(d).choices?.[0]?.delta?.content || ""; } catch { /* ignore */ }
          }
        }
        if (full.trim()) {
          await supabase.from("brain_events").insert({
            venue_id, title: `Ear-piece: ${question.slice(0, 60)}`, severity: "info",
            reason: full.slice(0, 200), meta: { question, answer: full, kind: "manager_earpiece", page },
          });
        }
      } catch (e) { console.warn("log failed", e); }
    })();

    return new Response(forClient, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Earpiece-Context": ctxHeader,
        "Access-Control-Expose-Headers": "X-Earpiece-Context",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
