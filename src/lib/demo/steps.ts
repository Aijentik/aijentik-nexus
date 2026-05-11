export type DemoStep = {
  id: string;
  title: string;
  description: string;
  route: string;
  targetSelector?: string;
  duration?: number; // ms suggested before auto-advance (controller still needs Next click)
  events?: Array<{
    title: string;
    reason?: string;
    severity?: "info" | "success" | "warning" | "critical";
    delay?: number;
  }>;
  toast?: string;
};

export const DEMO_STEPS: DemoStep[] = [
  {
    id: "overview",
    title: "Welcome to Aijentik Hospitality OS",
    description:
      "This is the AI operating layer for modern venues — voice, bookings, messaging, payments and analytics in one cinematic surface.",
    route: "/app",
    targetSelector: "[data-demo='overview-hero']",
    events: [
      { title: "Demo simulation engaged", reason: "Guided product tour started", severity: "info" },
    ],
  },
  {
    id: "voice",
    title: "Live Voice — your AI Voice Host",
    description:
      "Aijentik answers calls in real time, understands guest intent, and acts instantly. Watch a live booking call unfold.",
    route: "/app/voice",
    targetSelector: "[data-demo='voice-orb']",
    events: [
      { title: "Incoming call routed to Voice Host", reason: "+44 7700 900 ▢▢▢", severity: "info" },
      { title: "Guest intent detected: booking", reason: "Party of 4 · Friday 7:00pm", severity: "success", delay: 1200 },
    ],
  },
  {
    id: "flow",
    title: "Flow Studio — visual AI logic",
    description:
      "Every guest journey is powered by visual flows. See exactly what the AI is doing and tune the logic anytime.",
    route: "/app/flow",
    events: [
      { title: "Flow: availability checked", reason: "Friday 19:00 — 3 tables open", severity: "info" },
      { title: "Flow: booking action created", reason: "Sarah Mitchell · 4 guests", severity: "success", delay: 900 },
    ],
  },
  {
    id: "diary",
    title: "Diary — the live booking ledger",
    description: "The booking is now live in the venue diary, attributed to the AI Voice Host.",
    route: "/app/diary",
    events: [
      { title: "Booking confirmed", reason: "Sarah Mitchell · Fri 19:00 · Party 4", severity: "success" },
    ],
  },
  {
    id: "floor",
    title: "Floor Plan — intelligent seating",
    description:
      "The AI recommends the best table based on party size, preferences, VIP status and live floor availability.",
    route: "/app/floor",
    events: [{ title: "Table T7 assigned", reason: "Window · capacity 4", severity: "success" }],
  },
  {
    id: "messages",
    title: "Messages — multichannel guest comms",
    description: "Aijentik confirms via SMS, schedules WhatsApp reminders, and handles email — all on brand.",
    route: "/app/messages",
    events: [
      { title: "SMS confirmation sent to Sarah", reason: "Friday 19:00 confirmed", severity: "success" },
      { title: "WhatsApp reminder scheduled", reason: "T-24h", severity: "info", delay: 800 },
    ],
  },
  {
    id: "payments",
    title: "Payments — deposits, automated",
    description: "For deposits or large bookings, Aijentik issues secure payment links and tracks status end-to-end.",
    route: "/app/integrations",
    targetSelector: "[data-demo='integration-stripe']",
    events: [
      { title: "Deposit link issued", reason: "£40 · Stripe (simulated)", severity: "info" },
      { title: "Deposit received", reason: "Payment captured", severity: "success", delay: 1100 },
    ],
  },
  {
    id: "brain",
    title: "Live Brain — full transparency",
    description: "Live Brain narrates every decision your AI makes, with confidence scores and outcomes.",
    route: "/app/brain",
    events: [
      { title: "Voice Host answered call", reason: "confidence 0.97", severity: "success" },
      { title: "Booking Agent checked availability", reason: "confidence 0.94", severity: "info", delay: 600 },
      { title: "Ops Brain assigned table T7", reason: "confidence 0.92", severity: "info", delay: 1200 },
    ],
  },
  {
    id: "live",
    title: "Venue Live — the digital twin",
    description: "Live operations, guest flow, agent activity and revenue impact, in one cinematic surface.",
    route: "/app/live",
    events: [
      { title: "Guest arriving in 12 minutes", reason: "Sarah Mitchell · party of 4", severity: "info" },
      { title: "Revenue influenced by AI", reason: "+£280 today", severity: "success", delay: 800 },
    ],
  },
  {
    id: "knowledge",
    title: "Knowledge — your venue brain",
    description: "The AI learns your menu, hours, FAQs, booking rules, tone of voice and policies.",
    route: "/app/knowledge",
    events: [{ title: "Knowledge synced", reason: "Menu · hours · policies", severity: "info" }],
  },
  {
    id: "agents",
    title: "Agents — your AI workforce",
    description: "Voice Host, Booking Concierge, Ops Brain, Guest Concierge and Marketing Studio — all coordinated.",
    route: "/app/agents",
    events: [{ title: "Workforce online", reason: "5 agents active", severity: "success" }],
  },
  {
    id: "integrations",
    title: "Integrations — your venue stack",
    description: "Twilio, WhatsApp, OpenTable, Resy, Stripe, POS, marketing and CRM — connected as one nervous system.",
    route: "/app/integrations",
    events: [{ title: "Stack health: nominal", reason: "All connected systems healthy", severity: "info" }],
  },
  {
    id: "analytics",
    title: "Analytics — operational truth",
    description: "Every action rolls into operational analytics: revenue saved, bookings captured, missed calls recovered.",
    route: "/app/analytics",
    events: [{ title: "Daily snapshot ready", reason: "37 calls · 22 bookings · £4,180 influenced", severity: "success" }],
  },
  {
    id: "insights",
    title: "Insights — intelligent recommendations",
    description: "At end of service, Aijentik proposes operational moves to lift revenue and guest experience.",
    route: "/app/insights",
    events: [
      {
        title: "Insight generated",
        reason: "Friday demand exceeded capacity by 18% — open outdoor seating earlier and require deposits for 6+",
        severity: "warning",
      },
    ],
  },
  {
    id: "finale",
    title: "That is Aijentik Hospitality OS",
    description:
      "Voice, bookings, messaging, payments, workflows, integrations, analytics and AI operations — in one intelligent layer.",
    route: "/app",
    events: [{ title: "Demo complete", reason: "Replay anytime from the Overview", severity: "success" }],
  },
];
