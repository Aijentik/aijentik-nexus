import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, ShoppingBag, Clock, ChefHat, CheckCircle2, Truck, XCircle, MessageCircle,
  Instagram, Phone, Send, Home, ChevronRight, Trash2, CreditCard, Search, X,
} from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

type Order = {
  id: string;
  venue_id: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  status: "new" | "confirmed" | "in_kitchen" | "ready" | "out_for_delivery" | "completed" | "cancelled";
  channel: "web" | "whatsapp" | "instagram" | "messenger" | "sms" | "phone" | "in_house";
  fulfillment: "dine_in" | "takeaway" | "delivery";
  payment_status: "unpaid" | "authorized" | "paid" | "refunded" | "failed";
  total_cents: number;
  subtotal_cents: number;
  currency: string;
  notes: string | null;
  pickup_time: string | null;
  delivery_address: string | null;
  ai_confidence: number;
  created_at: string;
};

type OrderItem = {
  id: string;
  order_id: string;
  name: string;
  qty: number;
  unit_price_cents: number;
  notes: string | null;
};

const COLUMNS: { id: Order["status"]; label: string; icon: any; color: string }[] = [
  { id: "new",               label: "New",        icon: ShoppingBag, color: "hsl(32 96% 58%)" },
  { id: "confirmed",         label: "Confirmed",  icon: CheckCircle2, color: "hsl(200 96% 60%)" },
  { id: "in_kitchen",        label: "In kitchen", icon: ChefHat,     color: "hsl(280 70% 65%)" },
  { id: "ready",             label: "Ready",      icon: Clock,       color: "hsl(142 70% 50%)" },
  { id: "out_for_delivery",  label: "Out",        icon: Truck,       color: "hsl(36 96% 60%)" },
  { id: "completed",         label: "Completed",  icon: CheckCircle2, color: "hsl(142 40% 55%)" },
];

const CHANNEL_ICON: Record<Order["channel"], any> = {
  whatsapp: MessageCircle, instagram: Instagram, messenger: MessageCircle,
  sms: Send, phone: Phone, web: ShoppingBag, in_house: Home,
};

const CHANNEL_LABEL: Record<Order["channel"], string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger",
  sms: "SMS", phone: "Phone", web: "Web", in_house: "In-house",
};

const NEXT: Record<Order["status"], Order["status"] | null> = {
  new: "confirmed", confirmed: "in_kitchen", in_kitchen: "ready",
  ready: "completed", out_for_delivery: "completed", completed: null, cancelled: null,
};

const money = (cents: number, currency = "GBP") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents || 0) / 100);

export default function Orders() {
  const { venue } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | Order["channel"]>("all");

  const load = async () => {
    if (!venue) return;
    setLoading(true);
    const { data: ords } = await supabase
      .from("orders").select("*").eq("venue_id", venue.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false }).limit(200);
    setOrders((ords || []) as Order[]);
    if (ords?.length) {
      const ids = ords.map(o => o.id);
      const { data: its } = await supabase.from("order_items").select("*").in("order_id", ids);
      const byOrder: Record<string, OrderItem[]> = {};
      (its || []).forEach((it: any) => {
        byOrder[it.order_id] = byOrder[it.order_id] || [];
        byOrder[it.order_id].push(it);
      });
      setItems(byOrder);
    } else {
      setItems({});
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!venue) return;
    const ch = supabase
      .channel(`orders:${venue.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `venue_id=eq.${venue.id}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: `venue_id=eq.${venue.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue?.id]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(o => {
      if (channelFilter !== "all" && o.channel !== channelFilter) return false;
      if (!q) return true;
      const itemNames = (items[o.id] || []).map(i => i.name).join(" ").toLowerCase();
      return `${o.guest_name} ${o.guest_phone || ""} ${o.guest_email || ""} ${o.notes || ""} ${itemNames}`.toLowerCase().includes(q);
    });
  }, [orders, query, channelFilter, items]);

  const byStatus = useMemo(() => {
    const m: Record<string, Order[]> = {};
    COLUMNS.forEach(c => { m[c.id] = []; });
    filteredOrders.forEach(o => { if (m[o.status]) m[o.status].push(o); });
    return m;
  }, [filteredOrders]);

  const channelCounts = useMemo(() => {
    const m: Record<string, number> = {};
    orders.forEach(o => { m[o.channel] = (m[o.channel] || 0) + 1; });
    return m;
  }, [orders]);

  const hasFilters = !!query || channelFilter !== "all";


  const advance = async (o: Order) => {
    const next = NEXT[o.status];
    if (!next) return;
    setOrders(prev => prev.map(p => p.id === o.id ? { ...p, status: next } : p));
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", o.id);
    if (error) { toast.error(error.message); load(); return; }
    if (venue) await supabase.from("brain_events").insert({
      venue_id: venue.id, title: `Order ${o.guest_name} → ${next.replace(/_/g, " ")}`,
      severity: next === "ready" ? "warn" : "info", reason: "Status updated",
    });
  };

  const cancelOrder = async (o: Order) => {
    setOrders(prev => prev.filter(p => p.id !== o.id));
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", o.id);
    if (error) { toast.error(error.message); load(); }
    else toast.success("Order cancelled");
    setSelected(null);
  };

  const markPaid = async (o: Order) => {
    const { error } = await supabase.from("orders").update({ payment_status: "paid" }).eq("id", o.id);
    if (error) toast.error(error.message);
    else { toast.success("Marked paid"); load(); }
  };

  const stats = useMemo(() => {
    const today = orders.filter(o =>
      new Date(o.created_at).toDateString() === new Date().toDateString()
    );
    const revenue = today.filter(o => o.payment_status === "paid")
      .reduce((s, o) => s + (o.total_cents || 0), 0);
    return {
      today: today.length,
      active: orders.filter(o => !["completed", "cancelled"].includes(o.status)).length,
      revenue,
      currency: orders[0]?.currency || "GBP",
    };
  }, [orders]);

  return (
    <>
      <PageHeader
        title="Ordering"
        subtitle="Live kanban for every order across every channel — WhatsApp, Instagram, web, phone, in-house."
        actions={
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button
                size="lg"
                className="h-11 bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40
                  shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.7),0_1px_0_hsl(36_100%_90%_/_0.25)_inset]"
              >
                <Plus className="h-4 w-4 mr-2" /> New order
              </Button>
            </DialogTrigger>
            <NewOrderDialog venueId={venue?.id} onCreated={() => { setNewOpen(false); load(); }} />
          </Dialog>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Kpi label="Today" value={stats.today.toString()} hint="orders received" />
        <Kpi label="Active" value={stats.active.toString()} hint="in-flight" accent />
        <Kpi label="Revenue today" value={money(stats.revenue, stats.currency)} hint="paid orders" />
        <Kpi label="Avg confidence" value={
          orders.length
            ? `${Math.round((orders.reduce((s,o)=>s+(Number(o.ai_confidence)||0),0)/orders.length)*100)}%`
            : "—"
        } hint="AI capture" />
      </div>

      {/* Filter bar */}
      {orders.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search guest, phone, item…" className="pl-9 h-9 bg-white/[0.02] border-white/[0.06]" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setChannelFilter("all")}
              className={`text-[11.5px] px-3 py-1.5 rounded-full border transition-all ${
                channelFilter === "all" ? "border-primary/50 bg-primary/[0.08] text-primary" : "border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:text-foreground"
              }`}>All <span className="opacity-60 ml-0.5">{orders.length}</span></button>
            {(Object.keys(CHANNEL_LABEL) as Order["channel"][]).filter(c => channelCounts[c]).map(c => (
              <button key={c} onClick={() => setChannelFilter(c)}
                className={`text-[11.5px] px-3 py-1.5 rounded-full border transition-all ${
                  channelFilter === c ? "border-primary/50 bg-primary/[0.08] text-primary" : "border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:text-foreground"
                }`}>{CHANNEL_LABEL[c]} <span className="opacity-60 ml-0.5">{channelCounts[c]}</span></button>
            ))}
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setChannelFilter("all"); }} className="h-9 text-xs text-muted-foreground">
              <X className="h-3 w-3 mr-1" /> Reset
            </Button>
          )}
        </div>
      )}



      {loading && orders.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {COLUMNS.map(c => (
            <div key={c.id} className="card-cine p-3 h-72 animate-pulse opacity-50" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState onCreate={() => setNewOpen(true)} />
      ) : (
        <LayoutGroup>
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {COLUMNS.map(col => {
              const list = byStatus[col.id] || [];
              const Icon = col.icon;
              return (
                <div key={col.id} className="card-cine p-3 flex flex-col min-h-[300px]">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md grid place-items-center border"
                        style={{ background: `${col.color}18`, borderColor: `${col.color}40` }}>
                        <Icon className="h-3 w-3" style={{ color: col.color }} />
                      </div>
                      <span className="text-[11px] uppercase tracking-wider font-medium">{col.label}</span>
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{list.length}</span>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
                    <AnimatePresence initial={false}>
                      {list.map(o => (
                        <OrderCard
                          key={o.id} o={o} items={items[o.id] || []}
                          onClick={() => setSelected(o)}
                          onAdvance={() => advance(o)}
                        />
                      ))}
                    </AnimatePresence>
                    {list.length === 0 && (
                      <div className="text-[11px] text-muted-foreground/50 text-center py-6 italic">empty</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </LayoutGroup>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <OrderDetail
            o={selected}
            items={items[selected.id] || []}
            onAdvance={() => { advance(selected); }}
            onCancel={() => cancelOrder(selected)}
            onMarkPaid={() => markPaid(selected)}
          />
        )}
      </Dialog>
    </>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`card-cine p-4 ${accent ? "border-primary/30" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight mt-1 ${accent ? "text-primary" : ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</div>
    </div>
  );
}

function OrderCard({ o, items, onClick, onAdvance }: {
  o: Order; items: OrderItem[]; onClick: () => void; onAdvance: () => void;
}) {
  const ChannelIcon = CHANNEL_ICON[o.channel];
  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  const age = formatDistanceToNowStrict(new Date(o.created_at), { addSuffix: false });
  const next = NEXT[o.status];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-white/[0.06] bg-black/30 p-3 hover:border-primary/30 hover:bg-black/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-[13px] font-medium truncate">{o.guest_name}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ChannelIcon className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{CHANNEL_LABEL[o.channel]}</span>
            <span className="text-[10px] text-muted-foreground/50">· {age}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[13px] font-semibold tabular-nums">{money(o.total_cents, o.currency)}</div>
          <div className={`text-[9.5px] uppercase tracking-wider mt-0.5 ${
            o.payment_status === "paid" ? "text-[hsl(142_70%_55%)]"
              : o.payment_status === "failed" ? "text-[hsl(0_80%_70%)]" : "text-muted-foreground"
          }`}>{o.payment_status}</div>
        </div>
      </div>
      <div className="text-[11.5px] text-muted-foreground line-clamp-2 mb-2">
        {itemCount} item{itemCount === 1 ? "" : "s"}
        {items[0] ? ` · ${items.slice(0, 2).map(i => `${i.qty}× ${i.name}`).join(", ")}` : ""}
        {items.length > 2 ? "…" : ""}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-white/[0.06] text-muted-foreground">
          {o.fulfillment.replace("_", " ")}
        </span>
        {next && (
          <button
            onClick={(e) => { e.stopPropagation(); onAdvance(); }}
            className="text-[10px] uppercase tracking-wider text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 hover:gap-1.5"
          >
            {next.replace(/_/g, " ")} <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function OrderDetail({ o, items, onAdvance, onCancel, onMarkPaid }: {
  o: Order; items: OrderItem[]; onAdvance: () => void; onCancel: () => void; onMarkPaid: () => void;
}) {
  const next = NEXT[o.status];
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between">
          <span>{o.guest_name}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {CHANNEL_LABEL[o.channel]} · {format(new Date(o.created_at), "d MMM HH:mm")}
          </span>
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Status" value={o.status.replace(/_/g, " ")} />
          <Stat label="Fulfillment" value={o.fulfillment.replace("_", " ")} />
          <Stat label="Payment" value={o.payment_status} accent={o.payment_status === "paid"} />
        </div>
        {(o.guest_phone || o.guest_email) && (
          <div className="text-[12px] text-muted-foreground space-y-0.5">
            {o.guest_phone && <div>📞 {o.guest_phone}</div>}
            {o.guest_email && <div>✉ {o.guest_email}</div>}
          </div>
        )}
        {o.delivery_address && (
          <div className="text-[12px]"><span className="text-muted-foreground">Address:</span> {o.delivery_address}</div>
        )}
        <div className="rounded-xl border border-white/[0.06] divide-y divide-white/[0.04]">
          {items.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No items</div>}
          {items.map(i => (
            <div key={i.id} className="p-3 flex items-center justify-between text-sm">
              <div className="min-w-0">
                <div className="font-medium">{i.qty}× {i.name}</div>
                {i.notes && <div className="text-[11px] text-muted-foreground">{i.notes}</div>}
              </div>
              <div className="tabular-nums text-muted-foreground">
                {money(i.unit_price_cents * i.qty, o.currency)}
              </div>
            </div>
          ))}
          <div className="p-3 flex items-center justify-between text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(o.total_cents, o.currency)}</span>
          </div>
        </div>
        {o.notes && (
          <div className="rounded-lg bg-black/30 border border-white/[0.05] p-3 text-[12.5px] italic text-muted-foreground">
            "{o.notes}"
          </div>
        )}
      </div>
      <DialogFooter className="flex-wrap gap-2">
        <Button variant="ghost" onClick={onCancel} className="text-[hsl(0_80%_70%)]">
          <XCircle className="h-4 w-4 mr-1.5" /> Cancel order
        </Button>
        {o.payment_status !== "paid" && (
          <Button variant="outline" onClick={onMarkPaid}>
            <CreditCard className="h-4 w-4 mr-1.5" /> Mark paid
          </Button>
        )}
        {next && (
          <Button onClick={onAdvance} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
            Move to {next.replace(/_/g, " ")} <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-black/30 border border-white/[0.05] p-2">
      <div className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-[12px] mt-0.5 font-medium ${accent ? "text-[hsl(142_70%_55%)]" : ""}`}>{value}</div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card-cine p-16 text-center">
      <div className="relative inline-block mb-4">
        <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl" />
        <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center mx-auto border border-primary/40 shadow-[0_0_30px_hsl(var(--primary)/0.5)]">
          <ShoppingBag className="h-7 w-7 text-primary-foreground" strokeWidth={2} />
        </div>
      </div>
      <div className="text-lg font-medium mb-1">No orders yet.</div>
      <div className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
        Orders captured by your AI across WhatsApp, Instagram, SMS, phone and the web will land here in real time.
      </div>
      <Button onClick={onCreate} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
        <Plus className="h-4 w-4 mr-2" /> Create a test order
      </Button>
    </div>
  );
}

type Draft = {
  guest_name: string; guest_phone: string; channel: Order["channel"];
  fulfillment: Order["fulfillment"]; notes: string;
  items: { name: string; qty: number; price_cents: number }[];
};

function NewOrderDialog({ venueId, onCreated }: { venueId?: string; onCreated: () => void }) {
  const [d, setD] = useState<Draft>({
    guest_name: "", guest_phone: "", channel: "in_house", fulfillment: "takeaway", notes: "",
    items: [{ name: "", qty: 1, price_cents: 0 }],
  });
  const [saving, setSaving] = useState(false);

  const subtotal = d.items.reduce((s, i) => s + (i.price_cents * i.qty), 0);
  const canSave = d.guest_name.trim().length > 0 && d.items.some(i => i.name.trim().length > 0);

  const create = async () => {
    if (!venueId || !canSave) return;
    setSaving(true);
    const validItems = d.items.filter(i => i.name.trim());
    const { data, error } = await supabase.from("orders").insert({
      venue_id: venueId,
      guest_name: d.guest_name.trim(),
      guest_phone: d.guest_phone.trim() || null,
      channel: d.channel,
      fulfillment: d.fulfillment,
      notes: d.notes.trim() || null,
      subtotal_cents: subtotal,
      total_cents: subtotal,
      ai_confidence: 1,
    }).select("id").single();
    if (error) { setSaving(false); return toast.error(error.message); }

    if (validItems.length) {
      const { error: iErr } = await supabase.from("order_items").insert(
        validItems.map(i => ({
          order_id: data!.id, venue_id: venueId,
          name: i.name.trim(), qty: i.qty, unit_price_cents: i.price_cents,
        }))
      );
      if (iErr) toast.error(iErr.message);
    }
    setSaving(false);
    toast.success("Order created");
    onCreated();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>New order</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Guest name</Label>
            <Input className="mt-1" value={d.guest_name} onChange={e => setD({ ...d, guest_name: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Phone</Label>
            <Input className="mt-1 font-mono" placeholder="+44…" value={d.guest_phone} onChange={e => setD({ ...d, guest_phone: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Channel</Label>
            <Select value={d.channel} onValueChange={(v) => setD({ ...d, channel: v as any })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(CHANNEL_LABEL).map(k => (
                  <SelectItem key={k} value={k}>{CHANNEL_LABEL[k as Order["channel"]]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Fulfillment</Label>
            <Select value={d.fulfillment} onValueChange={(v) => setD({ ...d, fulfillment: v as any })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="takeaway">Takeaway</SelectItem>
                <SelectItem value="dine_in">Dine in</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Items</Label>
            <Button size="sm" variant="ghost"
              onClick={() => setD({ ...d, items: [...d.items, { name: "", qty: 1, price_cents: 0 }] })}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          <div className="space-y-2">
            {d.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_60px_90px_auto] gap-2">
                <Input placeholder="Item name" value={it.name}
                  onChange={e => {
                    const items = [...d.items]; items[idx] = { ...it, name: e.target.value };
                    setD({ ...d, items });
                  }} />
                <Input type="number" min={1} value={it.qty}
                  onChange={e => {
                    const items = [...d.items]; items[idx] = { ...it, qty: Math.max(1, +e.target.value || 1) };
                    setD({ ...d, items });
                  }} />
                <Input type="number" step="0.01" min={0} placeholder="0.00"
                  value={it.price_cents ? (it.price_cents / 100).toString() : ""}
                  onChange={e => {
                    const v = parseFloat(e.target.value) || 0;
                    const items = [...d.items]; items[idx] = { ...it, price_cents: Math.round(v * 100) };
                    setD({ ...d, items });
                  }} />
                <Button size="icon" variant="ghost"
                  onClick={() => {
                    const items = d.items.filter((_, i) => i !== idx);
                    setD({ ...d, items: items.length ? items : [{ name: "", qty: 1, price_cents: 0 }] });
                  }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes</Label>
          <Textarea rows={2} className="mt-1" value={d.notes} onChange={e => setD({ ...d, notes: e.target.value })}
            placeholder="Allergies, prep notes…" />
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-white/[0.05]">
          <span className="text-[12px] text-muted-foreground">Subtotal</span>
          <span className="text-base font-semibold tabular-nums">{money(subtotal)}</span>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={create} disabled={!canSave || saving}
          className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Create order
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
