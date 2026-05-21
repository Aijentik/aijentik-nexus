import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { venue_id, question, history } = await req.json();
    if (!venue_id || !question) {
      return new Response(JSON.stringify({ error: "venue_id and question required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pull live venue context in parallel
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

Style: short, spoken English. 1-3 sentences max. No bullet points, no markdown, no preambles like "Sure" or "Based on the data". Speak like a trusted GM whispering insight. Use the venue's brand voice.

You have full live context of today's bookings, VIPs, pending emails, and recent calls below. Answer using ONLY this context. If asked for an action (e.g. "move table 4 to 8pm"), describe what you'd do; do not invent confirmations.

LIVE CONTEXT:
${context}`,
      },
      ...(history || []).slice(-6),
      { role: "user", content: question },
    ];

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, temperature: 0.4 }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(JSON.stringify({ error: "AI gateway error", detail: txt }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await resp.json();
    const answer = json.choices?.[0]?.message?.content?.trim() || "I didn't catch that.";

    // Log to brain_events for transparency
    await supabase.from("brain_events").insert({
      venue_id, title: `Ear-piece: ${question.slice(0, 60)}`, severity: "info",
      reason: answer.slice(0, 200), meta: { question, answer, kind: "manager_earpiece" },
    });

    return new Response(JSON.stringify({ answer, context_summary: { bookings: bookings.length, covers, vips: vips.length, pending_emails: pendingEmails.length } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
