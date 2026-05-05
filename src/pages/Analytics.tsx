import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/Layout";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { format, subDays } from "date-fns";

export default function Analytics() {
  const { venue } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);

  useEffect(() => {
    if (!venue) return;
    supabase.from("bookings").select("*").eq("venue_id", venue.id).then(({data}) => setBookings(data || []));
    supabase.from("calls").select("*").eq("venue_id", venue.id).then(({data}) => setCalls(data || []));
  }, [venue]);

  const days = Array.from({length: 14}, (_, i) => {
    const d = subDays(new Date(), 13 - i);
    const k = format(d, "MMM d");
    return {
      day: k,
      bookings: bookings.filter(b => format(new Date(b.created_at), "MMM d") === k).length,
      calls: calls.filter(c => format(new Date(c.started_at), "MMM d") === k).length,
    };
  });

  const sources = Object.entries(bookings.reduce((a: any, b) => { a[b.source || 'unknown'] = (a[b.source||'unknown']||0)+1; return a; }, {})).map(([source, count]) => ({ source, count }));

  return (
    <>
      <PageHeader title="Analytics" subtitle="Trends across calls, bookings, sources." />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5">
          <div className="font-medium mb-4">Bookings vs Calls (14d)</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={days}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Line type="monotone" dataKey="bookings" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="calls" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="font-medium mb-4">Booking sources</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sources}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="source" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
