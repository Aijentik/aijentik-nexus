import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const { venue_id } = await req.json();

    const { data: calls } = await sb.from("calls").select("transcript,summary").eq("venue_id", venue_id).order("started_at", { ascending: false }).limit(40);
    const { data: existing } = await sb.from("knowledge_base").select("title").eq("venue_id", venue_id);
    const known = new Set((existing || []).map((k: any) => k.title.toLowerCase()));

    const blob = (calls || []).map(c =>
      (c.summary ? c.summary + "\n" : "") +
      (Array.isArray(c.transcript) ? c.transcript.map((t: any) => `${t.role}: ${t.text}`).join("\n") : "")
    ).join("\n---\n").slice(0, 12000);

    if (!blob.trim()) return new Response(JSON.stringify({ added: 0, reason: "no transcripts yet" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Identify recurring guest questions the AI struggled with. Output ONLY via the propose_faqs tool. Skip anything already in the known list. Be concise." },
          { role: "user", content: `Known FAQ titles: ${[...known].join(", ") || "(none)"}\n\nTranscripts:\n${blob}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "propose_faqs",
            description: "Propose new FAQs the venue should add to its knowledge base",
            parameters: {
              type: "object",
              required: ["faqs"],
              properties: {
                faqs: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["title", "answer"],
                    properties: { title: { type: "string" }, answer: { type: "string" } },
                  },
                },
              },
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "propose_faqs" } },
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return new Response(JSON.stringify({ error: "AI: " + aiRes.status, details: t.slice(0, 200) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await aiRes.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { faqs: [] };
    const faqs = (parsed.faqs || []).filter((f: any) => f.title && !known.has(f.title.toLowerCase())).slice(0, 8);

    if (faqs.length) {
      await sb.from("knowledge_base").insert(faqs.map((f: any) => ({
        venue_id, title: f.title, category: "faq", content: f.answer, tags: ["self-heal"],
      })));
      await sb.from("brain_events").insert({
        venue_id,
        title: `Self-healed: added ${faqs.length} FAQ${faqs.length > 1 ? "s" : ""}`,
        reason: faqs.map((f: any) => `• ${f.title}`).join("\n"),
        severity: "success",
      });
    }

    return new Response(JSON.stringify({ added: faqs.length, faqs }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
