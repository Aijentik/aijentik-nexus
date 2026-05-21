import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Premium AI-powered run sheet generator.
// Pulls live operational data for a given date and runs an AI briefing pass.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { venue_id, target_date } = await req.json();
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = req.headers.get("Authorization") || "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const target = target_date ? new Date(target_date) : new Date();
    const dayStart = new Date(target); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(target); dayEnd.setHours(23, 59, 59, 999);

    // 90-day same-dow history
    const dow = target.getDay();
    const histStart = new Date(target.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [venueR, bookingsR, histR, tablesR, zonesR, guestsR, rolesR, eventsR] = await Promise.all([
      sb.from("venues").select("name,cuisine,capacity,brand_voice,city,address,phone,logo_url,hours").eq("id", venue_id).maybeSingle(),
      sb.from("bookings").select("*").eq("venue_id", venue_id)
        .gte("booking_time", dayStart.toISOString()).lte("booking_time", dayEnd.toISOString())
        .order("booking_time"),
      sb.from("bookings").select("party_size,booking_time,status").eq("venue_id", venue_id)
        .gte("booking_time", histStart.toISOString()).lt("booking_time", dayStart.toISOString()).limit(2000),
      sb.from("tables").select("id,label,capacity,zone_id").eq("venue_id", venue_id),
      sb.from("zones").select("id,name,color").eq("venue_id", venue_id),
      sb.from("guests").select("id,name,phone,vip,visit_count,tags,notes").eq("venue_id", venue_id),
      sb.from("user_roles").select("user_id,role").eq("venue_id", venue_id),
      sb.from("brain_events").select("title,reason,severity,created_at").eq("venue_id", venue_id)
        .gte("created_at", new Date(Date.now() - 24*3600*1000).toISOString()).order("created_at", { ascending: false }).limit(10),
    ]);

    if (!venueR.data) {
      return new Response(JSON.stringify({ error: "Venue not found or access denied" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const venue = venueR.data;
    const bookings = bookingsR.data || [];
    const hist = histR.data || [];
    const tables = tablesR.data || [];
    const zones = zonesR.data || [];
    const guests = guestsR.data || [];
    const roles = rolesR.data || [];
    const events = eventsR.data || [];

    const guestMap = new Map(guests.map((g: any) => [g.id, g]));
    const guestByPhone = new Map(guests.filter((g: any) => g.phone).map((g: any) => [g.phone.replace(/\s/g, ""), g]));
    const zoneMap = new Map(zones.map((z: any) => [z.id, z]));
    const tableMap = new Map(tables.map((t: any) => [t.id, t]));

    // Profiles for staff display names
    const userIds = roles.map((r: any) => r.user_id);
    let profiles: any[] = [];
    if (userIds.length) {
      const { data } = await sb.from("profiles").select("user_id,display_name,avatar_url").in("user_id", userIds);
      profiles = data || [];
    }
    const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));
    const team = roles.map((r: any) => ({
      user_id: r.user_id,
      role: r.role,
      name: profileMap.get(r.user_id)?.display_name || "Team member",
      avatar_url: profileMap.get(r.user_id)?.avatar_url || null,
    }));

    // Enrich bookings
    const totalSeats = tables.reduce((s: number, t: any) => s + (t.capacity || 0), 0) || (venue?.capacity ?? 60);
    const totalCovers = bookings.reduce((s: number, b: any) => s + (b.party_size || 0), 0);
    const partySegments = { solo: 0, couple: 0, small: 0, group: 0, large: 0 };
    const dietaryHits: any[] = [];
    const vipBookings: any[] = [];
    const largeGroups: any[] = [];
    const birthdayBookings: any[] = [];
    const allergyKw = /(allerg|gluten|vegan|vegetarian|dairy|nut|shellfish|halal|kosher|coeliac|celiac|lactose)/i;
    const birthdayKw = /(birthday|anniversary|celebration|engagement|hen|stag|proposal)/i;

    const enriched = bookings.map((b: any) => {
      const g: any = b.guest_id ? guestMap.get(b.guest_id) : (b.guest_phone ? guestByPhone.get(b.guest_phone.replace(/\s/g, "")) : null);
      const t: any = b.table_id ? tableMap.get(b.table_id) : null;
      const z: any = t?.zone_id ? zoneMap.get(t.zone_id) : null;
      const notes = (b.notes || "").trim();
      const isVip = !!g?.vip;
      const isRepeat = (g?.visit_count || 0) >= 2;
      const hasDietary = allergyKw.test(notes) || (g?.tags || []).some((tg: string) => allergyKw.test(tg));
      const isBirthday = birthdayKw.test(notes);
      const isLarge = (b.party_size || 0) >= 6;

      if ((b.party_size || 0) === 1) partySegments.solo++;
      else if ((b.party_size || 0) === 2) partySegments.couple++;
      else if ((b.party_size || 0) <= 5) partySegments.small++;
      else if ((b.party_size || 0) <= 9) partySegments.group++;
      else partySegments.large++;

      if (isVip) vipBookings.push({ id: b.id, name: b.guest_name, time: b.booking_time, party: b.party_size, notes });
      if (isLarge) largeGroups.push({ id: b.id, name: b.guest_name, time: b.booking_time, party: b.party_size, notes });
      if (isBirthday) birthdayBookings.push({ id: b.id, name: b.guest_name, time: b.booking_time, party: b.party_size, notes });
      if (hasDietary) dietaryHits.push({ id: b.id, name: b.guest_name, time: b.booking_time, party: b.party_size, notes });

      return {
        id: b.id,
        booking_time: b.booking_time,
        guest_name: b.guest_name,
        guest_phone: b.guest_phone,
        party_size: b.party_size,
        status: b.status,
        notes,
        source: b.source,
        table_label: t?.label || null,
        zone_name: z?.name || null,
        zone_color: z?.color || null,
        vip: isVip,
        repeat: isRepeat,
        visit_count: g?.visit_count || 0,
        dietary: hasDietary,
        birthday: isBirthday,
      };
    });

    // Pacing buckets by hour
    const hourly: Record<string, { count: number; covers: number }> = {};
    enriched.forEach((b: any) => {
      const h = new Date(b.booking_time).getHours();
      const key = `${String(h).padStart(2, "0")}:00`;
      hourly[key] = hourly[key] || { count: 0, covers: 0 };
      hourly[key].count++;
      hourly[key].covers += b.party_size || 0;
    });
    const pacing = Object.entries(hourly).map(([hour, v]) => ({ hour, ...v })).sort((a, b) => a.hour.localeCompare(b.hour));
    const peakHour = pacing.slice().sort((a, b) => b.covers - a.covers)[0]?.hour || null;

    // Same-dow average for context
    const sameDow = hist.filter((b: any) => new Date(b.booking_time).getDay() === dow);
    const sameDowDays = new Set(sameDow.map((b: any) => new Date(b.booking_time).toDateString()));
    const avgCoversSameDow = sameDowDays.size
      ? Math.round(sameDow.reduce((s, b: any) => s + (b.party_size || 0), 0) / sameDowDays.size)
      : 0;

    const utilisation = totalSeats ? Math.round((totalCovers / (totalSeats * 3)) * 100) : 0; // 3 turns/day rough

    // ---- AI briefing ----
    const lovKey = Deno.env.get("LOVABLE_API_KEY");
    let briefing = { headline: "", summary: "", risks: [] as string[], recommendations: [] as string[], staffing_notes: "" };

    if (lovKey && bookings.length) {
      try {
        const aiPayload = {
          venue: { name: venue.name, cuisine: venue.cuisine, capacity: totalSeats, city: venue.city },
          date: dayStart.toISOString(),
          totals: { bookings: bookings.length, covers: totalCovers, utilisation_pct: utilisation, avg_covers_same_dow: avgCoversSameDow, peak_hour: peakHour },
          party_mix: partySegments,
          pacing,
          vips: vipBookings.length,
          large_groups: largeGroups.length,
          birthdays: birthdayBookings.length,
          dietary_count: dietaryHits.length,
          team_size: team.length,
        };
        const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: `You are a Michelin-trained restaurant operations director writing today's pre-service briefing. Voice: ${venue.brand_voice || "warm, professional, concise"}. Output STRICT JSON only, no markdown, with keys: headline (≤10 words, punchy), summary (2 sentences, what defines today), risks (array of 2-4 short concrete risks), recommendations (array of 2-4 short concrete actions), staffing_notes (1 sentence). Be specific to the data, not generic.` },
              { role: "user", content: JSON.stringify(aiPayload) },
            ],
            response_format: { type: "json_object" },
          }),
        });
        const data = await ai.json();
        const txt = data?.choices?.[0]?.message?.content;
        if (txt) {
          try {
            const parsed = JSON.parse(txt);
            briefing = { ...briefing, ...parsed };
          } catch { /* keep defaults */ }
        }
      } catch (_) { /* non-fatal */ }
    }

    if (!briefing.headline) {
      briefing.headline = bookings.length ? `${bookings.length} bookings, ${totalCovers} covers` : "Quiet service ahead";
      briefing.summary = bookings.length
        ? `Peak pressure around ${peakHour || "service"} with ${utilisation}% projected utilisation. Same-day average is ${avgCoversSameDow} covers.`
        : "No bookings on the diary yet — focus on walk-in readiness and outreach.";
      briefing.risks = [
        ...(largeGroups.length ? [`${largeGroups.length} large group(s) — confirm timings and table joins.`] : []),
        ...(dietaryHits.length ? [`${dietaryHits.length} dietary note(s) — brief kitchen.`] : []),
        ...(utilisation > 85 ? ["High utilisation — protect turn times."] : []),
      ];
      briefing.recommendations = [
        ...(vipBookings.length ? [`Pre-greet ${vipBookings.length} VIP arrival(s).`] : []),
        ...(birthdayBookings.length ? [`Prepare celebration for ${birthdayBookings.length} party.`] : []),
        "Pre-shift huddle 15 min before doors.",
      ];
      briefing.staffing_notes = `${team.length} team member(s) on the system.`;
    }

    return new Response(JSON.stringify({
      venue,
      date: dayStart.toISOString(),
      totals: { bookings: bookings.length, covers: totalCovers, seats: totalSeats, utilisation_pct: utilisation, avg_covers_same_dow: avgCoversSameDow, peak_hour: peakHour },
      bookings: enriched,
      pacing,
      vips: vipBookings,
      large_groups: largeGroups,
      birthdays: birthdayBookings,
      dietary: dietaryHits,
      events,
      team,
      briefing,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed to generate run sheet" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
