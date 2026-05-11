import {
  Phone, MessageSquare, CreditCard, Calendar, Database, Mail, Plug, Bot,
  Building2, Briefcase, Users, ShoppingBag, Star, MessageCircle, Send, Sparkles
} from "lucide-react";

export type AuthMethod = "oauth" | "api_key" | "webhook" | "connector";

export type Integration = {
  id: string;
  name: string;
  category: "Voice & SMS" | "Messaging" | "Reservations" | "Payments" | "POS" | "Marketing" | "CRM" | "Workflow" | "Productivity" | "Reviews";
  desc: string;
  longDesc: string;
  icon: any;
  color: string;
  authMethods: AuthMethod[];
  modules: string[];          // sync modules user can toggle
  insights?: string[];        // AI insight bullets
  connectorId?: string;       // if powered by Lovable connector gateway
  envSecret?: string;         // env var name once linked
  comingSoon?: boolean;
  highlight?: boolean;
};

export const INTEGRATIONS: Integration[] = [
  {
    id: "twilio", name: "Twilio", category: "Voice & SMS",
    desc: "Phone numbers, inbound calls, SMS routing.",
    longDesc: "Route inbound calls into the AI Voice Host, send SMS confirmations, store transcripts and recordings.",
    icon: Phone, color: "hsl(0 78% 60%)",
    authMethods: ["connector", "api_key"],
    modules: ["Inbound voice → AI Host", "SMS confirmations", "Outbound AI SMS", "Recordings + transcripts"],
    insights: ["Missed calls auto-recovered by AI", "Avg handle time falling 12% week over week"],
    connectorId: "twilio", envSecret: "TWILIO_API_KEY", highlight: true,
  },
  {
    id: "whatsapp", name: "WhatsApp Business", category: "Messaging",
    desc: "Two-way guest messaging, confirmations & follow-ups.",
    longDesc: "Send confirmations, reminders, AI follow-ups and surveys. AI replies intelligently and escalates when needed.",
    icon: MessageSquare, color: "hsl(142 70% 48%)",
    authMethods: ["oauth", "api_key"],
    modules: ["Booking confirmations", "Payment reminders", "Two-way concierge", "Post-visit surveys"],
    insights: ["Guests with WhatsApp reminders show 18% lower no-shows."],
  },
  {
    id: "opentable", name: "OpenTable", category: "Reservations",
    desc: "Sync inbound reservations & availability.",
    longDesc: "Mirror your OpenTable diary, import reservations, sync availability and guest notes.",
    icon: Calendar, color: "hsl(0 78% 50%)",
    authMethods: ["oauth", "api_key"],
    modules: ["Reservations", "Availability", "Guest notes", "Cancellations"],
    insights: ["OpenTable demand exceeds Friday capacity by 16%."],
  },
  {
    id: "resy", name: "Resy", category: "Reservations",
    desc: "Diary mirror & live availability sync.",
    longDesc: "Mirror Resy diary, propose times, manage waitlists with AI.",
    icon: Calendar, color: "hsl(38 100% 60%)",
    authMethods: ["oauth", "api_key"],
    modules: ["Diary sync", "Availability", "Waitlist", "Guest data"],
  },
  {
    id: "sevenrooms", name: "SevenRooms", category: "Reservations",
    desc: "Guest CRM and reservation orchestration.",
    longDesc: "Sync SevenRooms reservations, profiles, tags and visit history.",
    icon: Briefcase, color: "hsl(282 60% 60%)",
    authMethods: ["api_key"],
    modules: ["Reservations", "Guest profiles", "Tags & VIPs", "Visit history"],
  },
  {
    id: "stripe", name: "Stripe", category: "Payments",
    desc: "Deposits, no-show fees & refunds.",
    longDesc: "Collect deposits, send payment links, hold pre-auths, issue refunds — all triggered by AI flows.",
    icon: CreditCard, color: "hsl(252 80% 60%)",
    authMethods: ["oauth", "api_key"],
    modules: ["Deposits", "Payment links", "No-show fees", "Refunds", "Pre-authorisations"],
    insights: ["Stripe deposits reduced cancellations by 23%."],
    highlight: true,
  },
  {
    id: "square_pos", name: "Square POS", category: "POS",
    desc: "Cover counts, ticket data, guest spend.",
    longDesc: "Sync transactions, item data, peak times — power upsell recommendations and guest value scoring.",
    icon: Database, color: "hsl(220 60% 55%)",
    authMethods: ["oauth", "api_key"],
    modules: ["Transactions", "Guest spend", "Item popularity", "Covers & peaks"],
    insights: ["Top 10% of guests drive 38% of revenue."],
  },
  {
    id: "toast_pos", name: "Toast POS", category: "POS",
    desc: "Restaurant POS sync & menu intelligence.",
    longDesc: "Pull tickets, menu items and shift data into Aijentik.",
    icon: ShoppingBag, color: "hsl(20 90% 55%)",
    authMethods: ["api_key"],
    modules: ["Tickets", "Menu items", "Shifts", "Discounts"],
  },
  {
    id: "lightspeed", name: "Lightspeed", category: "POS",
    desc: "Multi-location POS & inventory.",
    longDesc: "Connect Lightspeed Restaurant for live ticket and inventory sync.",
    icon: Database, color: "hsl(195 80% 55%)",
    authMethods: ["oauth", "api_key"],
    modules: ["Tickets", "Inventory", "Locations"],
  },
  {
    id: "mailchimp", name: "Mailchimp", category: "Marketing",
    desc: "Guest list sync & AI campaigns.",
    longDesc: "Sync guests, build AI segments (VIPs, lapsed, high-spend) and trigger campaigns.",
    icon: Mail, color: "hsl(48 95% 55%)",
    authMethods: ["oauth", "api_key"],
    modules: ["Guest list sync", "Auto segments", "Campaign triggers"],
  },
  {
    id: "klaviyo", name: "Klaviyo", category: "Marketing",
    desc: "Guest segments, flows and triggers.",
    longDesc: "Push guest profiles and events into Klaviyo flows.",
    icon: Send, color: "hsl(322 70% 55%)",
    authMethods: ["api_key"],
    modules: ["Profiles", "Events", "Flows"],
  },
  {
    id: "zapier", name: "Zapier", category: "Workflow",
    desc: "Universal automation layer (webhooks).",
    longDesc: "Trigger any Zap from Aijentik events — VIP arrivals, missed calls, negative reviews.",
    icon: Plug, color: "hsl(20 90% 55%)",
    authMethods: ["webhook"],
    modules: ["Outbound triggers", "Inbound actions", "Custom payloads"],
  },
  {
    id: "google_calendar", name: "Google Calendar", category: "Productivity",
    desc: "Sync events for staff & private dining.",
    longDesc: "Two-way sync of staff and private-dining calendars.",
    icon: Calendar, color: "hsl(220 80% 60%)",
    authMethods: ["oauth", "connector"],
    modules: ["Events", "Reminders"],
    connectorId: "google_calendar",
  },
  {
    id: "gmail", name: "Gmail", category: "Productivity",
    desc: "Send confirmations & read inbound enquiries.",
    longDesc: "Send AI-drafted emails and triage inbound enquiries.",
    icon: Mail, color: "hsl(0 78% 56%)",
    authMethods: ["oauth", "connector"],
    modules: ["Inbound triage", "Outbound drafts", "Reservation enquiries"],
    connectorId: "google_mail",
  },
  {
    id: "slack", name: "Slack", category: "Productivity",
    desc: "Operational alerts to your team.",
    longDesc: "Push live operational alerts — VIPs, escalations, payment issues.",
    icon: MessageCircle, color: "hsl(282 60% 55%)",
    authMethods: ["oauth", "connector"],
    modules: ["VIP alerts", "Escalations", "Daily briefings"],
    connectorId: "slack",
  },
  {
    id: "salesforce", name: "Salesforce", category: "CRM",
    desc: "Sync guests as enterprise CRM contacts.",
    longDesc: "Bidirectional contact and account sync for hospitality groups.",
    icon: Building2, color: "hsl(202 80% 50%)",
    authMethods: ["oauth"],
    modules: ["Contacts", "Accounts", "Activity"],
  },
  {
    id: "hubspot", name: "HubSpot", category: "CRM",
    desc: "Marketing CRM & guest journey tracking.",
    longDesc: "Push guests as contacts, track lifecycle and send campaigns.",
    icon: Users, color: "hsl(14 90% 58%)",
    authMethods: ["oauth", "connector"],
    modules: ["Contacts", "Lifecycle stages", "Campaigns"],
    connectorId: "hubspot",
  },
  {
    id: "xero", name: "Xero", category: "Productivity",
    desc: "Accounting sync for revenue intelligence.",
    longDesc: "Push deposits, refunds and payments into Xero.",
    icon: Briefcase, color: "hsl(195 80% 50%)",
    authMethods: ["oauth"],
    modules: ["Invoices", "Payments", "Refunds"],
  },
  {
    id: "deputy", name: "Deputy", category: "Productivity",
    desc: "Staff scheduling & shift sync.",
    longDesc: "Pull rosters and overlay AI-predicted demand.",
    icon: Users, color: "hsl(160 70% 45%)",
    authMethods: ["oauth", "api_key"],
    modules: ["Rosters", "Shifts", "Demand overlay"],
  },
  {
    id: "google_reviews", name: "Google Reviews", category: "Reviews",
    desc: "Monitor reviews & AI replies.",
    longDesc: "Monitor reviews, sentiment analysis, AI-drafted owner replies.",
    icon: Star, color: "hsl(48 95% 55%)",
    authMethods: ["oauth"],
    modules: ["Review monitoring", "Sentiment", "AI replies"],
  },
];
