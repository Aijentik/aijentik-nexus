import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { global: { headers: { Authorization: auth } } });

    const { venue_id } = await req.json();
    if (!venue_id) return new Response(JSON.stringify({ error: "venue_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const since10 = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    const sincePrev7d = new Date(Date.now() - 14 * 86400_000).toISOString();

    const [{ data: missed }, { data: weekBookings }, { data: prevBookings }] = await Promise.all([
      sb.from("calls").select("id").eq("venue_id", venue_id).eq("outcome", "missed").gte("started_at", since10),
      sb.from("bookings").select("id").eq("venue_id", venue_id).gte("created_at", since7d),
      sb.from("bookings").select("id").eq("venue_id", venue_id).gte("created_at", sincePrev7d).lt("created_at", since7d),
    ]);

    const alerts: { title: string; reason: string; severity: string }[] = [];

    if ((missed?.length || 0) >= 3) {
      alerts.push({ title: `You missed ${missed!.length} calls in 10 minutes`, reason: "Consider activating the AI voice host now.", severity: "warn" });
    }

    const wk = weekBookings?.length || 0;
    const pwk = prevBookings?.length || 0;
    if (pwk > 5 && wk < pwk * 0.8) {
      const pct = Math.round((1 - wk / pwk) * 100);
      alerts.push({ title: `Bookings down ${pct}% week-on-week`, reason: `Last 7d: ${wk} bookings vs ${pwk} previously. Consider a marketing push.`, severity: "warn" });
    }
    if (wk > pwk * 1.3 && pwk > 3) {
      const pct = Math.round((wk / pwk - 1) * 100);
      alerts.push({ title: `Bookings up ${pct}% week-on-week`, reason: `Demand is climbing — consider extra staff.`, severity: "success" });
    }

    if (alerts.length) {
      await sb.from("brain_events").insert(alerts.map(a => ({ ...a, venue_id })));
    }

    return new Response(JSON.stringify({ generated: alerts.length, alerts }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
