import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const pick = <T,>(arr: T[], i: number) => arr[((i % arr.length) + arr.length) % arr.length];
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

// ---------- Content libraries ----------
const GUEST_NAMES = [
  "Olivia Park", "Marcus Chen", "Sofia Rivera", "James O'Brien", "Aaliyah Khan",
  "Theo Müller", "Yuki Tanaka", "Noah Bennett", "Camila Rossi", "Liam Walsh",
  "Isabelle Laurent", "Daniel Okafor", "Priya Shah", "Henrik Lindqvist",
  "Mei Nakamura", "Rafael Santos", "Anya Petrov", "Ethan Caldwell",
];

const PHONES = (i: number) => `+447700900${String(100 + i).slice(-3)}`;

const ZONES = [
  { name: "Main Dining", color: "#f59e0b", position: 0 },
  { name: "Window Bar", color: "#fb923c", position: 1 },
  { name: "Private", color: "#a855f7", position: 2 },
  { name: "Terrace", color: "#10b981", position: 3 },
];

const MENU = [
  { section: "starters", name: "Burrata, heritage tomato, basil oil", price: "$14", description: "Pugliese burrata with sweet Isle of Wight tomatoes." },
  { section: "starters", name: "Tuna tartare, yuzu, avocado", price: "$17", description: "Line-caught tuna, citrus, smoked sesame." },
  { section: "starters", name: "Crispy octopus, romesco", price: "$15", description: "Slow-cooked octopus, charred peppers, almond." },
  { section: "starters", name: "Beetroot, whipped goats curd, walnut", price: "$11", description: "Tri-colour beets, candied walnut." },
  { section: "mains", name: "Cornish lamb rump, salsa verde", price: "$32", description: "Pink-roasted lamb, anchovy, mint." },
  { section: "mains", name: "Hand-rolled tagliatelle, beef ragu", price: "$22", description: "48hr ragu, parmigiano reggiano." },
  { section: "mains", name: "Roasted halibut, brown butter", price: "$34", description: "Day-boat halibut, samphire, lemon." },
  { section: "mains", name: "Dry-aged ribeye 300g, bone marrow butter", price: "$42", description: "Aged 35 days, peppercorn jus." },
  { section: "mains", name: "Wild mushroom risotto", price: "$20", description: "Carnaroli, taleggio, truffle oil." },
  { section: "mains", name: "Miso-glazed cod, pak choi", price: "$28", description: "Black cod, sake glaze, sesame greens." },
  { section: "sides", name: "Triple-cooked chips", price: "$6" },
  { section: "sides", name: "Charred tenderstem, chilli oil", price: "$7" },
  { section: "sides", name: "Truffle pommes purée", price: "$8" },
  { section: "desserts", name: "Tonka bean panna cotta", price: "$9" },
  { section: "desserts", name: "Valrhona chocolate fondant", price: "$11" },
  { section: "desserts", name: "Yuzu tart, raspberry sorbet", price: "$10" },
  { section: "wine", name: "Chablis 1er Cru, Vaillons 2021", price: "$72", description: "Mineral, citrus, oyster shell." },
  { section: "wine", name: "Barolo, Vietti 2018", price: "$140", description: "Rose, tar, dark cherry." },
  { section: "wine", name: "Sancerre, Pascal Jolivet 2022", price: "$58" },
  { section: "wine", name: "Champagne, Billecart-Salmon Brut", price: "$95" },
  { section: "cocktails", name: "House Negroni, barrel-aged", price: "$14" },
  { section: "cocktails", name: "Smoked Old Fashioned", price: "$15" },
  { section: "cocktails", name: "Yuzu Spritz", price: "$12" },
  { section: "cocktails", name: "Espresso Martini, Mr Black", price: "$13" },
];

const KNOWLEDGE = [
  { category: "hours", title: "Opening hours", content: "Tue–Thu 17:30–22:30. Fri–Sat 12:00–14:30 lunch, 17:30–23:00 dinner. Sun 12:00–17:00. Closed Monday." },
  { category: "booking", title: "Booking policy", content: "Bookings up to 90 days ahead. Tables held 15 mins past arrival. Parties of 6+ require $20pp deposit." },
  { category: "booking", title: "Cancellation policy", content: "Free cancellation up to 24h before. Late cancellation forfeits deposit." },
  { category: "menu", title: "Dietary accommodations", content: "All dishes can be made gluten-free except pasta. Vegan tasting menu available with 24h notice. Nut allergens are documented per dish." },
  { category: "menu", title: "Children's policy", content: "Children welcome until 19:30. Half portions of mains $14. Children's menu on request." },
  { category: "service", title: "Service charge", content: "Discretionary 12.5% service charge added to tables of all sizes. 100% goes to the team via tronc." },
  { category: "service", title: "Dress code", content: "Smart casual. No sportswear or beachwear in the dining room." },
  { category: "venue", title: "Accessibility", content: "Ground floor fully accessible. Wheelchair-accessible WC on the same floor. Hearing loop installed at the host stand." },
  { category: "venue", title: "Parking & transit", content: "No on-site parking. Closest tube: Oxford Circus (4 min). NCP car park 2 minutes walk on Cavendish Square." },
  { category: "events", title: "Private dining", content: "The Library private room seats 14. $85pp set menu, minimum spend $1,800 Fri/Sat dinner." },
  { category: "events", title: "Buy-out", content: "Full buy-out available Sundays. Capacity 60 seated, 90 standing. Min spend $8,500." },
  { category: "policies", title: "Pet policy", content: "Assistance dogs welcome inside. Well-behaved dogs welcome on the terrace." },
];

const INSIGHTS = [
  { category: "revenue", impact: "+$1,840 / week", title: "Friday demand exceeds capacity by 18%",
    body: "5 of last 6 Fridays turned away parties of 4+. Opening the terrace from 18:00 (vs 19:00) and requiring deposits for 6+ would recover an estimated $1,840/week." },
  { category: "operations", impact: "−12 min avg wait", title: "Pre-order drinks for confirmed bookings",
    body: "Guests who pre-select drinks via the confirmation SMS sit and order 12 minutes faster on average — reduces bar pressure on Fri/Sat." },
  { category: "guest", impact: "VIP retention", title: "Repeat guest Olivia Park visited 4x this quarter",
    body: "Flag VIP service note. Recommend complimentary glass of Champagne on next arrival — Olivia's average spend is $92pp vs $61 venue avg." },
  { category: "marketing", impact: "+22 covers/week", title: "Tuesday is your weakest service",
    body: "Average 18 covers vs 54 Thu. Recommend a Chef's Counter set menu at $45 — concept tested well with similar venues in W1." },
  { category: "operations", impact: "Reduce no-shows 6%→2%", title: "Deposits cut no-shows by two-thirds",
    body: "Across 14 venues we observe deposit-required bookings have 2.1% no-show rate vs 6.4% without. Recommend $20pp for 6+ and all 19:30+ Fri/Sat." },
  { category: "menu", impact: "+$640 / week", title: "Halibut is your top-margin main",
    body: "Halibut at $34 carries the highest GP (74%) and sells at 1.4x rate. Promote at the top of the dinner menu and via the AI host's specials line." },
  { category: "staffing", impact: "Cover Saturday peak", title: "Saturday 20:00 demand peaks at 1.8x staffing ratio",
    body: "Recommend +1 runner and +1 bar back from 19:30 Saturdays. Service times currently spike to 14 min ticket time." },
  { category: "guest", impact: "Reduce churn", title: "3 regulars haven't booked in 60+ days",
    body: "Marcus Chen, Sofia Rivera, James O'Brien — all 5+ visit history. Recommend personalised SMS from manager." },
];

const CALL_SUMMARIES = [
  { caller: "Sarah Mitchell", outcome: "booking", summary: "Booked party of 4 for Fri 19:00 — anniversary, requested window table.",
    transcript: [
      { role: "agent", text: "Good evening, thank you for calling. How can I help?" },
      { role: "user", text: "Hi, I'd like to book a table for four on Friday around 7pm." },
      { role: "agent", text: "Of course — we have 7:00pm available. May I take the name?" },
      { role: "user", text: "Sarah Mitchell. It's our anniversary, could we have a window seat?" },
      { role: "agent", text: "Lovely, I've noted anniversary and window seat. Confirmation on its way." },
    ] },
  { caller: "+44 7700 900 184", outcome: "enquiry", summary: "Asked about gluten-free options across menu — confirmed all dishes can be GF except pasta.",
    transcript: [
      { role: "user", text: "Are most of your dishes gluten free?" },
      { role: "agent", text: "Yes — all dishes can be prepared gluten free except the hand-rolled pasta." },
    ] },
  { caller: "Daniel Okafor", outcome: "booking", summary: "Rebooked after cancellation — moved Sat 20:30 → 21:00.",
    transcript: [{ role: "agent", text: "I've moved your booking to 9pm Saturday." }] },
  { caller: "Priya Shah", outcome: "booking", summary: "Corporate dinner party of 12 booked for Thu 19:30. Deposit link issued.",
    transcript: [
      { role: "user", text: "I need a private space for 12 next Thursday." },
      { role: "agent", text: "The Library seats 14, perfect for your group. I'll send a deposit link to confirm." },
    ] },
  { caller: "+44 7700 900 221", outcome: "complaint", summary: "Wait time complaint resolved — manager flagged, comp dessert offered.",
    transcript: [
      { role: "user", text: "We waited 25 minutes for our table last Saturday." },
      { role: "agent", text: "I'm so sorry. I'm escalating to the floor manager and adding a service note." },
    ] },
  { caller: "Henrik Lindqvist", outcome: "enquiry", summary: "Asked about parking — gave NCP Cavendish Square direction.", transcript: [] },
  { caller: "Mei Nakamura", outcome: "booking", summary: "Party of 2, Tue 18:30 — first-time guest.", transcript: [] },
  { caller: "+44 7700 900 312", outcome: "voicemail", summary: "Voicemail outside hours — callback queued.", transcript: [] },
  { caller: "Rafael Santos", outcome: "booking", summary: "Birthday party of 8, Sat 20:00 — cake fee waived.", transcript: [] },
  { caller: "Anya Petrov", outcome: "enquiry", summary: "Asked about vegan tasting menu — confirmed with 24h notice.", transcript: [] },
  { caller: "+44 7700 900 408", outcome: "booking", summary: "Walk-in availability check — confirmed bar seats free.", transcript: [] },
  { caller: "Ethan Caldwell", outcome: "booking", summary: "Lunch booking party of 6, Fri 13:00.", transcript: [] },
  { caller: "+44 7700 900 519", outcome: "enquiry", summary: "Asked about private hire — quoted $8,500 min spend.", transcript: [] },
  { caller: "Olivia Park", outcome: "booking", summary: "Repeat VIP — usual table, party of 2, Wed 19:30.", transcript: [] },
  { caller: "Marcus Chen", outcome: "booking", summary: "Date night booking, party of 2 Fri 20:00.", transcript: [] },
  { caller: "Sofia Rivera", outcome: "enquiry", summary: "Asked about wine pairing for tasting menu.", transcript: [] },
  { caller: "+44 7700 900 622", outcome: "complaint", summary: "Cold soup — refunded, sincere apology issued.", transcript: [] },
  { caller: "Camila Rossi", outcome: "booking", summary: "Group of 5, Sun lunch 13:30.", transcript: [] },
];

const BRAIN_EVENTS = [
  { title: "Voice agent answered call", reason: "Confirmed party of 4 for Friday 19:00. Diary updated.", severity: "success" },
  { title: "Conflict detected", reason: "Two parties of 6 requesting 19:30 — 1 table available. Suggested 20:15 alternative.", severity: "warn" },
  { title: "Repeat guest recognized", reason: "Olivia Park — 4th visit this quarter. VIP service note flagged.", severity: "info" },
  { title: "Knowledge updated", reason: "Wine list refreshed from PDF upload. 14 new entries.", severity: "info" },
  { title: "No-show risk flagged", reason: "2 bookings without confirmation reply 24h out. Concierge sent reminder SMS.", severity: "warn" },
  { title: "Deposit captured", reason: "$240 deposit for Priya Shah corporate dinner — Stripe confirmed.", severity: "success" },
  { title: "Table assigned by Ops Brain", reason: "Sarah Mitchell → T7 (window, capacity 4). Confidence 0.94.", severity: "success" },
  { title: "Self-heal: FAQ added", reason: "AI learned 'do you have parking' from last 3 calls. Added to knowledge base.", severity: "info" },
  { title: "SMS confirmation sent", reason: "Daniel Okafor — Saturday 21:00, party of 2.", severity: "success" },
  { title: "Cover forecast", reason: "Tonight 78 covers projected — 12% above 4-week avg. Recommend +1 runner.", severity: "warn" },
  { title: "Voice agent escalated to human", reason: "Complaint detected in call — routed to manager line.", severity: "warn" },
  { title: "Tasting menu pre-ordered", reason: "Party of 6 — vegan tasting menu, 24h notice met.", severity: "info" },
  { title: "Floor plan rebalanced", reason: "T3+T4 combined for party of 8 at 20:00.", severity: "info" },
  { title: "Marketing pulse", reason: "Tuesday quiet — proposed Chef's Counter set menu campaign.", severity: "info" },
  { title: "Integration healthy", reason: "Twilio voice + Stripe + Resy all nominal.", severity: "success" },
  { title: "Allergen alert", reason: "Guest tagged shellfish allergy — kitchen notified for T9.", severity: "warn" },
  { title: "Wine pairing suggested", reason: "Halibut main → Chablis 1er Cru. Upsell sent to runner tablet.", severity: "info" },
  { title: "Revenue influenced", reason: "AI host booked 7 covers in last hour — est. $420 contribution.", severity: "success" },
  { title: "Concierge: birthday detected", reason: "Rafael Santos — birthday Saturday. Cake fee waived, candles ready.", severity: "info" },
  { title: "Critical: missed call recovered", reason: "Outside hours — voicemail transcribed, callback queued 09:00.", severity: "critical" },
];

const MESSAGES = [
  { channel: "sms", direction: "outbound", contact: "Sarah Mitchell", body: "Hi Sarah — confirming your table for 4 on Fri 19:00. Reply YES to confirm." },
  { channel: "sms", direction: "inbound", contact: "Sarah Mitchell", body: "YES" },
  { channel: "sms", direction: "outbound", contact: "Daniel Okafor", body: "Your booking is moved to Sat 21:00. See you then." },
  { channel: "whatsapp", direction: "outbound", contact: "Priya Shah", body: "Here's the deposit link for your private dining booking: …" },
  { channel: "whatsapp", direction: "inbound", contact: "Priya Shah", body: "Paid — thank you!" },
  { channel: "sms", direction: "outbound", contact: "Olivia Park", body: "Welcome back Olivia — we've reserved your usual table for Wed 19:30." },
  { channel: "sms", direction: "outbound", contact: "Henrik Lindqvist", body: "Reminder: your table for 2 tomorrow at 20:00. NCP Cavendish Square is the nearest car park." },
  { channel: "email", direction: "outbound", contact: "Rafael Santos", body: "Happy birthday week from all of us — see you Saturday." },
  { channel: "sms", direction: "outbound", contact: "Mei Nakamura", body: "Confirming your first visit Tue 18:30. We're looking forward to having you." },
  { channel: "sms", direction: "inbound", contact: "+44 7700 900 408", body: "Are you open for walk-ins tonight?" },
  { channel: "sms", direction: "outbound", contact: "+44 7700 900 408", body: "Yes — bar seats free until 21:00. Pop in." },
  { channel: "whatsapp", direction: "outbound", contact: "Ethan Caldwell", body: "Lunch booking for 6 confirmed Fri 13:00. Pre-order options attached." },
];

const STATUSES = ["confirmed", "confirmed", "confirmed", "pending", "seated", "completed", "confirmed"];

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "auth required" }, 401);

    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "invalid" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const venue_id: string = body.venue_id;
    const mode: "seed" | "reset" = body.mode === "reset" ? "reset" : "seed";
    if (!venue_id) return json({ error: "venue_id required" }, 400);

    // Verify membership
    const { data: vrow, error: vErr } = await sb
      .from("venues")
      .select("id, name, owner_id, status")
      .eq("id", venue_id)
      .maybeSingle();
    if (vErr || !vrow) return json({ error: "venue not found" }, 404);
    const { data: mem } = await sb
      .from("user_roles")
      .select("user_id")
      .eq("venue_id", venue_id)
      .eq("user_id", u.user.id)
      .maybeSingle();
    const isMember = vrow.owner_id === u.user.id || !!mem;
    if (!isMember) return json({ error: "forbidden" }, 403);

    // ---- RESET ----
    // Always-safe reset: clears demo-tagged rows. We tag on insert via meta/notes/tags markers
    // and also clear known demo guest names / known caller numbers.
    const wipe = async () => {
      const demoCallerPrefixes = ["+447700900", "+1555"];
      await sb.from("brain_events").delete().eq("venue_id", venue_id).contains("meta", { isDemoGenerated: true });
      await sb.from("bookings").delete().eq("venue_id", venue_id).eq("source", "demo");
      await sb.from("calls").delete().eq("venue_id", venue_id).in("caller", [
        ...GUEST_NAMES,
        ...Array.from({ length: 30 }, (_, i) => `+44 7700 900 ${100 + i}`),
        ...Array.from({ length: 30 }, (_, i) => `+44 7700 900 ${String(100 + i).slice(-3)}`),
      ]);
      // Fallback: also nuke calls by caller LIKE
      for (const p of demoCallerPrefixes) {
        await sb.from("calls").delete().eq("venue_id", venue_id).like("caller", `${p}%`);
      }
      await sb.from("messages").delete().eq("venue_id", venue_id).in("contact", MESSAGES.map((m) => m.contact));
      await sb.from("guests").delete().eq("venue_id", venue_id).in("name", GUEST_NAMES);
      await sb.from("menu_items").delete().eq("venue_id", venue_id).contains("tags", ["demo"]);
      await sb.from("knowledge_base").delete().eq("venue_id", venue_id).contains("tags", ["demo"]);
      await sb.from("insights").delete().eq("venue_id", venue_id).in("title", INSIGHTS.map((i) => i.title));
      await sb.from("integration_events").delete().eq("venue_id", venue_id).contains("payload", { demo: true });
      await sb.from("sync_logs").delete().eq("venue_id", venue_id).like("message", "demo:%");
    };

    if (mode === "reset") {
      await wipe();
      return json({ ok: true, reset: true });
    }

    // ---- SEED ----
    await wipe(); // idempotent re-seed

    // Zones + tables
    const { data: zoneRows } = await sb
      .from("zones")
      .upsert(
        ZONES.map((z) => ({ ...z, venue_id })),
        { onConflict: "venue_id,name", ignoreDuplicates: true } as any,
      )
      .select("id,name");

    // If upsert with onConflict unsupported (no unique), fall back to fetch existing
    let zones = zoneRows || [];
    if (!zones.length) {
      const { data: existing } = await sb.from("zones").select("id,name").eq("venue_id", venue_id);
      zones = existing || [];
      if (!zones.length) {
        const { data: created } = await sb.from("zones").insert(ZONES.map((z) => ({ ...z, venue_id }))).select("id,name");
        zones = created || [];
      }
    }

    // Tables — only seed if venue has none yet (preserve user's plan)
    const { count: tableCount } = await sb.from("tables").select("*", { count: "exact", head: true }).eq("venue_id", venue_id);
    if (!tableCount) {
      const tableInserts: any[] = [];
      let idx = 1;
      for (const z of zones) {
        const perZone = z.name === "Private" ? 2 : 4;
        for (let i = 0; i < perZone; i++) {
          tableInserts.push({
            venue_id,
            zone_id: z.id,
            label: `T${idx++}`,
            capacity: z.name === "Private" ? 8 : pick([2, 2, 4, 4, 6], i),
            shape: i % 3 === 0 ? "square" : "round",
            x: 80 + (i % 4) * 130,
            y: 80 + (zones.indexOf(z)) * 140,
            width: 80, height: 80, combinable: true,
          });
        }
      }
      await sb.from("tables").insert(tableInserts);
    }

    // Guests
    const guestRows = GUEST_NAMES.map((name, i) => ({
      venue_id,
      name,
      phone: PHONES(i),
      email: `${name.toLowerCase().replace(/[^a-z]/g, ".")}@example.com`,
      vip: i < 3,
      tags: i < 3 ? ["vip", "demo"] : i < 6 ? ["regular", "demo"] : ["demo"],
      visit_count: i < 3 ? rand(4, 9) : i < 6 ? rand(2, 4) : rand(0, 1),
      last_visit: new Date(Date.now() - rand(2, 60) * 86400_000).toISOString(),
      notes: i === 0 ? "Window table preferred. Champagne on arrival." : null,
    }));
    const { data: guests } = await sb.from("guests").insert(guestRows).select("id,name");

    // Bookings — distributed across past 5 days → next 7 days
    const now = Date.now();
    const bookings: any[] = [];
    for (let i = 0; i < 36; i++) {
      const dayOffset = rand(-5, 7);
      const hour = pick([12, 13, 18, 19, 19, 19, 20, 20, 21], i);
      const minute = pick([0, 15, 30, 45], i);
      const d = new Date(now + dayOffset * 86400_000);
      d.setHours(hour, minute, 0, 0);
      const isPast = d.getTime() < now;
      const guest = pick(guests || [], i);
      bookings.push({
        venue_id,
        guest_id: guest?.id ?? null,
        guest_name: guest?.name ?? pick(GUEST_NAMES, i),
        guest_phone: PHONES(i),
        guest_email: `guest${i}@example.com`,
        party_size: pick([2, 2, 2, 4, 4, 6, 8], i),
        booking_time: d.toISOString(),
        status: isPast ? (i % 5 === 0 ? "completed" : "completed") : pick(STATUSES, i),
        source: "demo",
        notes: i % 5 === 0 ? "Anniversary" : i % 7 === 0 ? "Window seat preferred" : null,
      });
    }
    await sb.from("bookings").insert(bookings);

    // Calls
    const calls = CALL_SUMMARIES.map((c, i) => ({
      venue_id,
      caller: c.caller,
      duration_seconds: rand(35, 280),
      outcome: c.outcome,
      summary: c.summary,
      transcript: c.transcript,
      started_at: new Date(now - rand(1, 96) * 3600_000).toISOString(),
      ended_at: new Date(now - rand(0, 95) * 3600_000).toISOString(),
    }));
    await sb.from("calls").insert(calls);

    // Brain events
    await sb.from("brain_events").insert(
      BRAIN_EVENTS.map((e, i) => ({
        venue_id,
        title: e.title,
        reason: e.reason,
        severity: e.severity,
        meta: { isDemoGenerated: true, confidence: 0.82 + (i % 18) * 0.01 },
      })),
    );

    // Menu
    await sb.from("menu_items").insert(
      MENU.map((m, i) => ({
        venue_id,
        section: m.section,
        name: m.name,
        price: m.price,
        description: m.description ?? null,
        position: i,
        tags: ["demo"],
      })),
    );

    // Knowledge base
    await sb.from("knowledge_base").insert(
      KNOWLEDGE.map((k) => ({ venue_id, ...k, tags: ["demo", k.category] })),
    );

    // Insights
    await sb.from("insights").insert(INSIGHTS.map((i) => ({ venue_id, ...i })));

    // Messages
    await sb.from("messages").insert(
      MESSAGES.map((m) => ({
        venue_id,
        channel: m.channel,
        direction: m.direction,
        contact: m.contact,
        body: m.body,
        status: "delivered",
      })),
    );

    // Integrations (illustrative)
    const integrations = [
      { provider: "twilio", status: "connected", connected: true, sync_health: "healthy", last_sync_at: new Date().toISOString() },
      { provider: "stripe", status: "connected", connected: true, sync_health: "healthy", last_sync_at: new Date(now - 300_000).toISOString() },
      { provider: "whatsapp", status: "connected", connected: true, sync_health: "healthy", last_sync_at: new Date(now - 900_000).toISOString() },
      { provider: "resy", status: "syncing", connected: true, sync_health: "syncing", last_sync_at: new Date(now - 60_000).toISOString() },
      { provider: "opentable", status: "disconnected", connected: false, sync_health: "unknown" },
      { provider: "mailchimp", status: "error", connected: true, sync_health: "error", error_message: "Token expired — reconnect required." },
    ].map((x) => ({ ...x, venue_id, enabled_modules: [] }));
    await sb.from("integrations").insert(integrations);

    // Integration events
    const ievents: any[] = [];
    for (let i = 0; i < 20; i++) {
      ievents.push({
        venue_id,
        provider: pick(["twilio", "stripe", "whatsapp", "resy"], i),
        type: pick(["webhook", "sync", "auth_refresh", "delivery"], i),
        status: pick(["ok", "ok", "ok", "warn"], i),
        message: pick(
          [
            "Inbound voice webhook processed",
            "Payment intent succeeded",
            "WhatsApp delivery confirmed",
            "Resy availability synced",
            "Auth token refreshed",
            "Rate limit warning — backing off",
          ],
          i,
        ),
        payload: { demo: true, idx: i },
      });
    }
    await sb.from("integration_events").insert(ievents);

    // Sync logs
    const slogs: any[] = [];
    for (let i = 0; i < 12; i++) {
      slogs.push({
        venue_id,
        provider: pick(["resy", "opentable", "stripe", "mailchimp"], i),
        direction: pick(["inbound", "outbound"], i),
        status: i === 10 ? "error" : "ok",
        records_count: rand(1, 40),
        message: i === 10 ? "demo: mailchimp token expired" : "demo: sync complete",
      });
    }
    await sb.from("sync_logs").insert(slogs);

    return json({
      ok: true,
      seeded: {
        guests: guestRows.length,
        bookings: bookings.length,
        calls: calls.length,
        brain_events: BRAIN_EVENTS.length,
        menu_items: MENU.length,
        knowledge: KNOWLEDGE.length,
        insights: INSIGHTS.length,
        messages: MESSAGES.length,
        integrations: integrations.length,
        integration_events: ievents.length,
        sync_logs: slogs.length,
      },
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
