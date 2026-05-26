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

function MessagesList({
  msgs, loading, query, setQuery, dirFilter, setDirFilter, onPickContact,
}: {
  msgs: any[]; loading: boolean; query: string; setQuery: (v: string) => void;
  dirFilter: "all" | "inbound" | "outbound"; setDirFilter: (v: "all" | "inbound" | "outbound") => void;
  onPickContact: (c: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return msgs.filter((m) => {
      if (dirFilter !== "all" && m.direction !== dirFilter) return false;
      if (!q) return true;
      return `${m.contact || ""} ${m.body || ""}`.toLowerCase().includes(q);
    });
  }, [msgs, query, dirFilter]);

  const counts = useMemo(() => ({
    all: msgs.length,
    inbound: msgs.filter(m => m.direction === "inbound").length,
    outbound: msgs.filter(m => m.direction === "outbound").length,
  }), [msgs]);

  const hasFilters = query.trim() !== "" || dirFilter !== "all";

  return (
    <div className="card-cine flex flex-col max-h-[70vh]">
      <div className="p-4 border-b border-white/[0.05] space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="label-micro">Conversations</div>
            <div className="font-medium text-[15px] truncate">
              {hasFilters ? `${filtered.length} of ${msgs.length}` : `Recent · ${msgs.length}`}
            </div>
          </div>
          <span className="pulse-dot shrink-0" />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contact or message…"
              className="pl-9 h-9 bg-white/[0.02] border-white/[0.06] focus-visible:ring-primary/40"
            />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            {(["all", "inbound", "outbound"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirFilter(d)}
                className={`px-2.5 h-7 rounded-md text-[11px] font-medium capitalize transition-colors flex items-center gap-1.5 ${
                  dirFilter === d
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                {d} <span className="tabular-nums opacity-70 text-[10px]">{counts[d]}</span>
              </button>
            ))}
          </div>
          {hasFilters && (
            <button
              onClick={() => { setQuery(""); setDirFilter("all"); }}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 shrink-0"
            >
              <X className="h-3.5 w-3.5" /> Reset
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
        {loading && msgs.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-12 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <div className="text-sm font-medium mb-1">
              {msgs.length === 0 ? "No messages yet." : "No messages match these filters."}
            </div>
            <div className="text-xs text-muted-foreground">
              {msgs.length === 0
                ? "Confirmations, reminders and replies will appear here in real time."
                : "Try a different direction or clear your search."}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {filtered.map((m, i) => (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: Math.min(i * 0.015, 0.2) }}
              className="p-4 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center justify-between text-[11px] mb-1.5 flex-wrap gap-1">
                <div className="flex items-center gap-2 min-w-0">
                  {m.direction === "outbound"
                    ? <ArrowUpRight className="h-3 w-3 text-primary shrink-0" />
                    : <ArrowDownLeft className="h-3 w-3 text-[hsl(var(--success))] shrink-0" />}
                  <button
                    onClick={() => onPickContact(m.contact)}
                    className="font-mono text-foreground/80 hover:text-primary transition-colors truncate"
                    title="Reply to this contact"
                  >
                    {m.contact}
                  </button>
                  <span className="px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground uppercase tracking-wider text-[9px] shrink-0">{m.channel}</span>
                  {m.status === "failed" && (
                    <span className="px-1.5 py-0.5 rounded-md bg-[hsl(0_80%_50%_/_0.15)] text-[hsl(0_80%_75%)] uppercase tracking-wider text-[9px] border border-[hsl(0_80%_50%_/_0.3)] shrink-0">
                      failed
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground shrink-0">{format(new Date(m.created_at), "d MMM HH:mm")}</span>
              </div>
              <div className="text-sm leading-relaxed">{m.body}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

