import { PageHeader } from "@/components/Layout";
import { Phone, MessageSquare, CreditCard, Calendar, Database, Mail, Plug, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion } from "framer-motion";

const list = [
  { icon: Phone,         name: "Twilio",            desc: "Phone numbers, inbound calls, SMS routing.", color: "hsl(0 78% 60%)",    connected: true },
  { icon: MessageSquare, name: "WhatsApp Business", desc: "Two-way messaging with guests.",             color: "hsl(142 70% 48%)" },
  { icon: Calendar,      name: "OpenTable",         desc: "Sync inbound reservations.",                 color: "hsl(0 78% 50%)" },
  { icon: Calendar,      name: "Resy",              desc: "Diary mirror & availability sync.",          color: "hsl(38 100% 60%)" },
  { icon: CreditCard,    name: "Stripe",            desc: "Deposits & no-show protection.",             color: "hsl(252 80% 60%)" },
  { icon: Database,      name: "Square POS",        desc: "Cover counts & ticket data.",                color: "hsl(220 60% 55%)" },
  { icon: Mail,          name: "Mailchimp",         desc: "Marketing list sync.",                       color: "hsl(48 95% 55%)" },
  { icon: Plug,          name: "Zapier",            desc: "Custom workflows.",                          color: "hsl(20 90% 55%)" },
];

export default function Integrations() {
  return (
    <>
      <PageHeader title="Integrations" subtitle="Connect your stack. Aijentik becomes the operating layer that orchestrates everything." />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {list.map((i, idx) => (
          <motion.div
            key={i.name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.4 }}
            className="card-cine p-5 flex flex-col"
          >
            <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-25 pointer-events-none" style={{ background: i.color }} />

            <div className="flex items-start justify-between mb-4">
              <div className="relative">
                {i.connected && <div className="absolute inset-0 rounded-xl blur-md opacity-60" style={{ background: i.color }} />}
                <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 grid place-items-center"
                  style={i.connected ? { boxShadow: `0 0 20px ${i.color}40, 0 1px 0 hsl(36 100% 90% / 0.1) inset` } : {}}>
                  <i.icon className="h-5 w-5" style={{ color: i.color }} strokeWidth={2} />
                </div>
              </div>
              <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                i.connected
                  ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30'
                  : 'bg-secondary/60 text-muted-foreground border-white/5'
              }`}>
                {i.connected ? "Connected" : "Not connected"}
              </span>
            </div>

            <div className="font-medium text-[15px]">{i.name}</div>
            <div className="text-[13px] text-muted-foreground mt-1.5 mb-5 min-h-[2.5rem] leading-relaxed">{i.desc}</div>

            <Button
              variant="outline"
              className="w-full border-white/10 mt-auto h-9"
              onClick={() => toast.message(i.connected ? `${i.name} is already connected.` : `${i.name} integration coming soon.`)}
            >
              {i.connected ? <><Check className="h-3.5 w-3.5 mr-1.5 text-[hsl(var(--success))]" /> Manage</> : "Connect"}
            </Button>
          </motion.div>
        ))}
      </div>
    </>
  );
}
