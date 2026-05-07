# Venue Mixer (Fly.io)

A tiny Deno server that bridges Twilio Media Streams ⇄ ElevenLabs ConvAI and
mixes a looping low-volume "busy venue" ambience under the agent's voice on
real phone calls.

This lives outside Supabase because Supabase Edge Functions sit behind
Cloudflare, which 502s Twilio's WebSocket upgrade. Fly.io accepts raw WSS
upgrades, so Twilio can connect.

## One-time deploy

You'll need the Fly CLI: <https://fly.io/docs/hands-on/install-flyctl/>

```bash
cd fly-mixer
fly auth login                          # opens browser
fly launch --no-deploy --copy-config    # accept defaults; keeps fly.toml
fly secrets set ELEVENLABS_API_KEY=sk_...   # same key as Supabase
fly deploy
```

Note the hostname Fly prints (e.g. `venue-mixer.fly.dev`).

## Wire it to Twilio

In Supabase, set a project secret so the webhook knows where to send Twilio:

```
MIXER_HOST = venue-mixer.fly.dev
```

(Or whatever Fly assigned.) The `twilio-voice-webhook` function picks it up
automatically and returns TwiML pointing at the Fly mixer instead of
ElevenLabs' default bridge. If `MIXER_HOST` is unset, the webhook falls back
to ElevenLabs' direct bridge (no ambience).

## Updating

```bash
cd fly-mixer
fly deploy
```

## Tuning ambience volume

Edit `AMBIENT_GAIN` in `server.ts` (default `0.10` = 10%).
