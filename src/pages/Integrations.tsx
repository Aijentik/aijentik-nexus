import { PageHeader } from "@/components/Layout";
import { Phone, MessageSquare, CreditCard, Calendar, Database, Mail, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const list = [
  { icon: Phone, name: "Twilio", desc: "Phone numbers, inbound calls, SMS routing." },
  { icon: MessageSquare, name: "WhatsApp Business", desc: "Two-way messaging with guests." },
  { icon: Calendar, name: "OpenTable", desc: "Sync inbound reservations." },
  { icon: Calendar, name: "Resy", desc: "Diary mirror & availability sync." },
  { icon: CreditCard, name: "Stripe", desc: "Deposits & no-show protection." },
  { icon: Database, name: "Square POS", desc: "Cover counts & ticket data." },
  { icon: Mail, name: "Mailchimp", desc: "Marketing list sync." },
  { icon: Plug, name: "Zapier", desc: "Custom workflows." },
];

export default function Integrations() {
  return (
    <>
      <PageHeader title="Integrations" subtitle="Connect your stack. (Demo placeholders — connect in production.)" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map(i => (
          <div key={i.name} className="glass rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center"><i.icon className="h-5 w-5 text-primary" /></div>
              <div>
                <div className="font-medium">{i.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Not connected</div>
              </div>
            </div>
            <div className="text-sm text-muted-foreground mb-4 min-h-[2.5rem]">{i.desc}</div>
            <Button variant="outline" className="w-full border-white/10" onClick={() => toast.message(`${i.name} integration is a demo placeholder.`)}>Connect</Button>
          </div>
        ))}
      </div>
    </>
  );
}
