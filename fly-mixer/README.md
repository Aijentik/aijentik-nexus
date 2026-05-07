# venue-mixer (Fly.io)

Twilio `<Stream>` ↔ ElevenLabs bridge that mixes looped venue ambience under the AI agent's voice on real phone calls.

## Deploy

```bash
cd fly-mixer
fly auth login
fly launch --no-deploy --copy-config --name venue-mixer
fly secrets set ELEVENLABS_API_KEY=<your-key>
fly deploy
```

After deploy, set `MIXER_HOST` in the Supabase project (e.g. `venue-mixer.fly.dev`) so the Twilio webhook routes calls through this mixer instead of ElevenLabs' default bridge.
