import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { venue_id, question } = await req.json();
    if (!venue_id || !question) {
      return new Response(JSON.stringify({ error: "venue_id and question required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    const venue = venueRes.data;
    const bookings = bookingsRes.data || [];
    const tables = tablesRes.data || [];
    const vips = vipRes.data || [];
    const pendingEmails = threadsRes.data || [];
    const recentCalls = callsRes.data || [];

    const covers = bookings.reduce((s: number, b: any) => s + (b.party_size || 0), 0);
    const totalCap = tables.reduce((s: number, t: any) => s + (t.capacity || 0), 0);

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

LIVE CONTEXT:
${context}`,
      },
      { role: "user", content: question },
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
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.25,
        max_tokens: 140,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text();
      return new Response(JSON.stringify({ error: "AI gateway error", detail: txt }), {
        status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tee one branch for background logging, one for the client.
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
            reason: full.slice(0, 200), meta: { question, answer: full, kind: "manager_earpiece" },
          });
        }
      } catch (e) { console.warn("log failed", e); }
    })();

    const ctxSummary = { bookings: bookings.length, covers, vips: vips.length, pending_emails: pendingEmails.length };

    return new Response(forClient, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Earpiece-Context": btoa(JSON.stringify(ctxSummary)),
        "Access-Control-Expose-Headers": "X-Earpiece-Context",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
