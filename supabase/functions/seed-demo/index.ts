import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return new Response(JSON.stringify({ error: "invalid" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { venue_id } = await req.json();

    const guests = ["Olivia Park","Marcus Chen","Sofia Rivera","James O'Brien","Aaliyah Khan","Theo Müller","Yuki Tanaka","Noah Bennett","Camila Rossi","Liam Walsh"];
    const sources = ["ai_voice","website","walk_in","ai_voice","ai_voice"];
    const now = Date.now();
    const bookings = Array.from({length: 12}, (_, i) => ({
      venue_id,
      guest_name: guests[i % guests.length],
      guest_phone: "+1555" + String(1000+i),
      party_size: 2 + (i % 6),
      booking_time: new Date(now + (i-2) * 3600_000).toISOString(),
      status: ["confirmed","confirmed","pending","seated","completed"][i%5],
      source: sources[i % sources.length],
      notes: i % 3 === 0 ? "Window seat preferred" : null,
    }));
    await sb.from("bookings").insert(bookings);

    const callsData = Array.from({length: 8}, (_,i) => ({
      venue_id,
      caller: "+1555" + String(2000+i),
      duration_seconds: 45 + i*20,
      outcome: ["booking","enquiry","booking","complaint","booking","enquiry","booking","voicemail"][i],
      summary: ["Booked table for 4 Saturday 8pm","Asked about gluten-free options","Booked anniversary dinner","Complaint about wait time — resolved","Re-booked after cancellation","Asked about parking","Booked corporate dinner for 12","Voicemail — callback queued"][i],
      transcript: [{role:"agent",text:"Hi, thanks for calling."},{role:"user",text:"I'd like a reservation."}],
      started_at: new Date(now - i*7200_000).toISOString(),
    }));
    await sb.from("calls").insert(callsData);

    await sb.from("brain_events").insert([
      { venue_id, title: "Voice agent answered call", reason: "Confirmed party of 4 for Saturday 8pm. Diary updated.", severity: "success" },
      { venue_id, title: "Conflict detected", reason: "Two parties of 6 requesting 7:30pm — 1 table available. Suggested alternative slot 8:15pm.", severity: "warn" },
      { venue_id, title: "Repeat guest recognized", reason: "Olivia Park — 4th visit this quarter. Flagged VIP service note.", severity: "info" },
      { venue_id, title: "Knowledge updated", reason: "Wine list refreshed from PDF upload.", severity: "info" },
      { venue_id, title: "No-show risk flagged", reason: "2 bookings without confirmation reply 24h out. Concierge agent sent reminder.", severity: "warn" },
    ]);

    return new Response(JSON.stringify({ ok: true, bookings: bookings.length, calls: callsData.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
