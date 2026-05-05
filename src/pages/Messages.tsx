import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

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
    toast.success("Message sent (demo)");
    setBody("");
    load();
  };

  return (
    <>
      <PageHeader title="Messages" subtitle="SMS conversations with guests. (SMS gateway is a demo placeholder.)" />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="font-medium">Send message</div>
          <Input placeholder="Recipient phone" value={contact} onChange={e => setContact(e.target.value)} />
          <Input placeholder="Message" value={body} onChange={e => setBody(e.target.value)} />
          <Button onClick={send} className="bg-primary text-primary-foreground w-full"><Send className="h-4 w-4 mr-2" /> Send</Button>
        </div>
        <div className="glass rounded-2xl divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
          {msgs.length === 0 && <div className="p-8 text-sm text-muted-foreground text-center">No messages yet.</div>}
          {msgs.map(m => (
            <div key={m.id} className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{m.contact}</span><span>{format(new Date(m.created_at), "d MMM HH:mm")}</span></div>
              <div className="text-sm mt-1">{m.body}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
