const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
Deno.serve(async (req) => {
  const u = new URL(req.url);
  const id = u.searchParams.get("id");
  if (!id) return new Response("missing id", { status: 400 });
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${id}`, {
    headers: { "xi-api-key": ELEVENLABS_API_KEY },
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { "Content-Type": "application/json" } });
});
