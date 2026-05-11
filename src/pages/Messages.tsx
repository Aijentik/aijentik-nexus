import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function Messages() {
  const { venue } = useAuth();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");

  const load = async () => {
    if (!venue) return;
    const { data } = await supabase.from("messages").select("*").eq("venue_id", venue.id).order("created_at", { ascending: false }).limit(50);
    setMsgs(data || []);
  };
  useEffect(() => { load(); }, [venue]);

  const send = async () => {
    if (!venue || !body || !contact) return;
    await supabase.from("messages").insert({ venue_id: venue.id, contact, body, channel: "sms", direction: "outbound", status: "sent" });
    await supabase.from("brain_events").insert({ venue_id: venue.id, title: "SMS sent", reason: `To ${contact}`, severity: "info" });
    toast.success("Message sent");
    setBody("");
    load();
  };

  return (
    <>
      <PageHeader title="Messages" subtitle="Two-way SMS and WhatsApp conversations with your guests." />

      <div className="grid lg:grid-cols-[400px_1fr] gap-5">
        <div className="card-cine p-6 h-fit">
          <div className="label-micro mb-3">Compose</div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1.5 block">Recipient</label>
              <Input placeholder="+1 415 555 1212" value={contact} onChange={e => setContact(e.target.value)} className="font-mono text-sm bg-black/30 border-white/[0.06]" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1.5 block">Message</label>
              <Input placeholder="Hi Jane, your table is confirmed…" value={body} onChange={e => setBody(e.target.value)} className="bg-black/30 border-white/[0.06]" />
            </div>
            <Button
              onClick={send}
              disabled={!body || !contact}
              className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40
                shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)] h-10"
            >
              <Send className="h-4 w-4 mr-2" /> Send via SMS
            </Button>
          </div>
        </div>

        <div className="card-cine flex flex-col max-h-[70vh]">
          <div className="p-5 border-b border-white/[0.05] flex items-center justify-between">
            <div>
              <div className="label-micro">Conversations</div>
              <div className="font-medium text-[15px]">Recent · {msgs.length}</div>
            </div>
            <span className="pulse-dot" />
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
            {msgs.length === 0 && (
              <div className="p-12 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <div className="text-sm font-medium mb-1">No messages yet.</div>
                <div className="text-xs text-muted-foreground">Confirmations, reminders and replies will appear here in real time.</div>
              </div>
            )}
            {msgs.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                className="p-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <div className="flex items-center gap-2">
                    {m.direction === 'outbound'
                      ? <ArrowUpRight className="h-3 w-3 text-primary" />
                      : <ArrowDownLeft className="h-3 w-3 text-[hsl(var(--success))]" />}
                    <span className="font-mono text-foreground/80">{m.contact}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground uppercase tracking-wider text-[9px]">{m.channel}</span>
                  </div>
                  <span className="text-muted-foreground">{format(new Date(m.created_at), "d MMM HH:mm")}</span>
                </div>
                <div className="text-sm leading-relaxed">{m.body}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
