import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Hybrid predictive engine: deterministic rules + AI reasoning layer.
// Returns forecast for "today" by default, or any ISO date passed in.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { venue_id, target_date } = await req.json();
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const target = target_date ? new Date(target_date) : now;
    const dayStart = new Date(target); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(target); dayEnd.setHours(23, 59, 59, 999);

    // History window: last 90 days, same day-of-week
    const dow = target.getDay();
    const histStart = new Date(target.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [venueRes, todayBookingsRes, histBookingsRes, tablesRes, guestsRes] = await Promise.all([
      supabase.from("venues").select("name,cuisine,capacity,brand_voice").eq("id", venue_id).maybeSingle(),
      supabase.from("bookings").select("id,guest_name,party_size,booking_time,status,notes,guest_id,guest_phone,guest_email,table_id")
        .eq("venue_id", venue_id).gte("booking_time", dayStart.toISOString()).lte("booking_time", dayEnd.toISOString())
        .order("booking_time"),
      supabase.from("bookings").select("party_size,booking_time,status")
        .eq("venue_id", venue_id).gte("booking_time", histStart.toISOString()).lt("booking_time", dayStart.toISOString())
        .limit(2000),
      supabase.from("tables").select("id,capacity").eq("venue_id", venue_id),
      supabase.from("guests").select("id,name,visit_count,vip,tags").eq("venue_id", venue_id),
    ]);

    const venue = venueRes.data;
    const todayBookings = todayBookingsRes.data || [];
    const hist = histBookingsRes.data || [];
    const tables = tablesRes.data || [];
    const guests = guestsRes.data || [];
    const guestMap = new Map(guests.map((g: any) => [g.id, g]));

    const totalSeats = tables.reduce((s, t: any) => s + (t.capacity || 0), 0) || (venue?.capacity ?? 60);

    // --- Rules: same day-of-week historical comparison ---
    const sameDow = hist.filter((b: any) => new Date(b.booking_time).getDay() === dow);
    const sameDowDays = new Set(sameDow.map((b: any) => new Date(b.booking_time).toDateString()));
    const avgCoversSameDow = sameDowDays.size
      ? Math.round(sameDow.reduce((s, b: any) => s + (b.party_size || 0), 0) / sameDowDays.size)
      : 0;
    const noShowRate = hist.length
      ? hist.filter((b: any) => b.status === "no_show").length / hist.length
      : 0.06;

    // --- Per-booking no-show risk ---
    const riskedBookings = todayBookings.map((b: any) => {
      const g: any = b.guest_id ? guestMap.get(b.guest_id) : null;
      let risk = noShowRate; // base
      const reasons: string[] = [];
      if (!g || (g.visit_count || 0) === 0) { risk += 0.08; reasons.push("first-time guest"); }
      else if ((g.visit_count || 0) >= 3) { risk -= 0.05; reasons.push("repeat guest"); }
      if (g?.vip) { risk -= 0.03; reasons.push("VIP"); }
      if (!b.guest_phone && !b.guest_email) { risk += 0.05; reasons.push("no contact details"); }
      if ((b.party_size || 0) >= 8) { risk += 0.05; reasons.push("large party"); }
      const hour = new Date(b.booking_time).getHours();
      if (hour >= 21) { risk += 0.03; reasons.push("late slot"); }
      risk = Math.max(0.02, Math.min(0.65, risk));
      return {
        id: b.id, guest_name: b.guest_name, booking_time: b.booking_time, party_size: b.party_size,
        risk: Number(risk.toFixed(2)), reasons,
        tier: risk > 0.25 ? "high" : risk > 0.12 ? "medium" : "low",
      };
    });

    // --- Cover load by hour ---
    const byHour: Record<number, number> = {};
    todayBookings.forEach((b: any) => {
      const h = new Date(b.booking_time).getHours();
      byHour[h] = (byHour[h] || 0) + (b.party_size || 0);
    });
    const peakHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
    const todayCovers = todayBookings.reduce((s, b: any) => s + (b.party_size || 0), 0);
    const expectedShowCovers = Math.round(
      riskedBookings.reduce((s, r) => s + r.party_size * (1 - r.risk), 0)
    );

    // --- Capacity stress per hour (assume 90 min turn) ---
    const stressHours: { hour: number; covers: number; utilization: number }[] = [];
    for (let h = 11; h <= 23; h++) {
      const covers = byHour[h] || 0;
      const utilization = totalSeats ? Math.min(1.5, covers / totalSeats) : 0;
      if (covers > 0) stressHours.push({ hour: h, covers, utilization: Number(utilization.toFixed(2)) });
    }
    const overbookedHours = stressHours.filter(s => s.utilization > 0.95);

    // --- Staffing recommendation (rule of thumb: 1 FOH per 20 covers, 1 BOH per 15) ---
    const peakCovers = peakHour ? Number(peakHour[1]) : 0;
    const staffing = {
      foh: Math.max(2, Math.ceil(peakCovers / 20)),
      boh: Math.max(2, Math.ceil(peakCovers / 15)),
      peak_hour: peakHour ? Number(peakHour[0]) : null,
    };

    // --- Revenue estimate ($45 avg cover, configurable later) ---
    const avgCover = 45;
    const projectedRevenue = expectedShowCovers * avgCover;

    // --- AI narrative layer (hybrid) ---
    let narrative = "";
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (apiKey) {
      try {
        const summary = {
          venue: venue?.name,
          target_date: dayStart.toISOString(),
          today_bookings: todayBookings.length,
          today_covers: todayCovers,
          expected_show_covers: expectedShowCovers,
          avg_covers_same_dow: avgCoversSameDow,
          no_show_rate: Number(noShowRate.toFixed(3)),
          high_risk_count: riskedBookings.filter(r => r.tier === "high").length,
          peak_hour: staffing.peak_hour,
          peak_covers: peakCovers,
          overbooked_hours: overbookedHours,
          staffing,
          projected_revenue: projectedRevenue,
        };
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            temperature: 0.4,
            messages: [
              { role: "system", content: `You are a hospitality operations forecaster. Write a tight 2-3 sentence shift briefing in the venue's brand voice (${venue?.brand_voice || "warm, professional, concise"}). No bullets, no markdown. Focus on what the manager should DO, not just observe.` },
              { role: "user", content: `Forecast data: ${JSON.stringify(summary)}` },
            ],
          }),
        });
        if (aiResp.ok) {
          const j = await aiResp.json();
          narrative = j.choices?.[0]?.message?.content?.trim() || "";
        }
      } catch { /* swallow */ }
    }

    const forecast = {
      target_date: dayStart.toISOString(),
      venue_name: venue?.name,
      total_seats: totalSeats,
      today: {
        bookings: todayBookings.length, covers: todayCovers,
        expected_show_covers: expectedShowCovers,
        projected_revenue: projectedRevenue,
      },
      history: {
        avg_covers_same_dow: avgCoversSameDow,
        no_show_rate: Number(noShowRate.toFixed(3)),
        sample_days: sameDowDays.size,
      },
      hours: stressHours,
      overbooked_hours: overbookedHours,
      staffing,
      no_show_risks: riskedBookings.sort((a, b) => b.risk - a.risk),
      narrative,
    };

    // Log a brain event
    await supabase.from("brain_events").insert({
      venue_id, title: `Forecast: ${expectedShowCovers} covers expected`,
      severity: overbookedHours.length ? "warn" : "info",
      reason: narrative || `Predicted ${expectedShowCovers} show-covers vs ${todayCovers} booked.`,
      meta: { kind: "forecast", forecast },
    });

    return new Response(JSON.stringify(forecast), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
