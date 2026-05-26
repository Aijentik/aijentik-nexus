import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare, ArrowDownLeft, ArrowUpRight, Loader2, AlertCircle, Search, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";


const E164 = /^\+[1-9]\d{6,14}$/;

export default function Messages() {
  const { venue } = useAuth();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dirFilter, setDirFilter] = useState<"all" | "inbound" | "outbound">("all");


  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("venue_id", venue.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setMsgs(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!venue) return;
    const ch = supabase
      .channel(`messages:${venue.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `venue_id=eq.${venue.id}` },
        (payload) => setMsgs((m) => [payload.new, ...m].slice(0, 100)),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [venue?.id]);

  const validTo = E164.test(contact);
  const canSend = validTo && body.trim().length > 0 && body.length <= 1600 && !sending;

  const send = async () => {
    if (!venue || !canSend) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: { venue_id: venue.id, to: contact.trim(), message: body.trim() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("SMS sent");
      setBody("");
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader title="Messages" subtitle="Two-way SMS conversations with your guests — sent live over Twilio." />

      <div className="grid lg:grid-cols-[400px_1fr] gap-5">
        <div className="card-cine p-6 h-fit">
          <div className="label-micro mb-3">Compose</div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1.5 block">Recipient</label>
              <Input
                placeholder="+14155551212"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="font-mono text-sm bg-black/30 border-white/[0.06]"
              />
              {contact && !validTo && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[hsl(0_80%_70%)]">
                  <AlertCircle className="h-3 w-3" /> Must be E.164 (e.g. +14155551212)
                </div>
              )}
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1.5 block flex justify-between">
                <span>Message</span>
                <span className={body.length > 1600 ? "text-[hsl(0_80%_70%)]" : "text-muted-foreground/60"}>
                  {body.length}/1600
                </span>
              </label>
              <Input
                placeholder="Hi Jane, your table is confirmed…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSend) send(); }}
                className="bg-black/30 border-white/[0.06]"
              />
            </div>
            <Button
              onClick={send}
              disabled={!canSend}
              className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40
                shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)] h-10"
            >
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {sending ? "Sending…" : "Send via SMS"}
            </Button>
            <div className="text-[10.5px] text-muted-foreground/80 leading-relaxed">
              Sent from this venue's public phone. Configure it in Settings → Call routing.
            </div>
          </div>
        </div>

        <MessagesList
          msgs={msgs}
          loading={loading}
          query={query}
          setQuery={setQuery}
          dirFilter={dirFilter}
          setDirFilter={setDirFilter}
          onPickContact={(c) => setContact(c)}
        />

      </div>
    </>
  );
}
