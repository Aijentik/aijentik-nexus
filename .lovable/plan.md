# Fix: Live Voice closes immediately after greeting

## Root cause

The shared ElevenLabs agent is configured for **Twilio phone calls** (`asr.user_input_audio_format: "ulaw_8000"`, `tts.agent_output_audio_format: "ulaw_8000"`, `turn.turn_timeout: 1`). The Fly mixer bridges Twilio's μ-law audio to that agent fine. But the in-app Live Voice page (`src/pages/VoiceLive.tsx`) connects the **browser** directly to ElevenLabs via the signed WebSocket URL returned by `voice-token`. Browsers can't produce or play μ-law 8 kHz frames through the SDK, so:

1. The agent plays its first message (TTS works one-way).
2. Mic audio from the browser is unintelligible to the agent's ASR.
3. The aggressive `turn_timeout: 1` plus malformed audio causes ElevenLabs to terminate the session right after the greeting.

This regressed when `supabase/functions/agents-set-ulaw/index.ts` was run to force μ-law on every linked agent for the Twilio mixer.

## Fix strategy

Provision **two distinct ElevenLabs agents per venue**, using the same prompt and tools:

- `kind = "voice"` — Twilio/phone, keeps `ulaw_8000` for both ASR and TTS (used by `twilio-voice-webhook` + Fly mixer).
- `kind = "voice_browser"` — In-app Live Voice, uses browser-friendly formats (`pcm_16000` ASR input, `pcm_16000` TTS output) and a sane `turn_timeout`.

The split keeps the existing phone path 100% unchanged and gives the browser its own correctly-configured agent.

## Changes

### 1. `supabase/functions/_shared/agent-config.ts`
- Add an optional `mode: "phone" | "browser"` parameter to `buildAgentBody`.
- When `mode === "browser"`:
  - `asr.user_input_audio_format = "pcm_16000"`
  - `tts.agent_output_audio_format = "pcm_16000"`
  - `turn.turn_timeout = 7` (default-ish, not 1)
  - Drop `optimize_streaming_latency` override or keep mild.
- Phone mode keeps existing μ-law config exactly as today.

### 2. `supabase/functions/voice-token/index.ts`
- Look up / upsert the agent row with `kind = "voice_browser"` (separate from the existing `kind = "voice"` row).
- Call `buildAgentBody(venue, prompt, cfg, "browser")` and `createElAgent` / `syncElAgent` against that agent's `elevenlabs_agent_id`.
- Return the signed URL for the browser agent.
- Twilio webhook stays on the existing `kind = "voice"` row — no change.

### 3. `supabase/functions/agent-configure/index.ts` (only if it touches one agent today)
- When the owner edits config in the UI, propagate the same prompt/tools/voice to BOTH the phone agent and the browser agent if both exist, so behavior stays in sync. (Read file first to confirm exact scope.)

### 4. No client changes required
`VoiceLive.tsx` already handles both `signed_url` (WebSocket) and `token` (WebRTC). The fix is entirely server-side; the browser will just receive a working signed URL pointing at the pcm-configured agent.

## Verification

1. Deploy `voice-token` and confirm a new `voice_browser` agent row is created on first call.
2. Open `/app/voice`, click **Start call** — agent should greet AND continue the conversation, mic activity should reach the agent (visible in transcript), call should not drop until the user ends it.
3. Place a real Twilio call to the linked number — phone path still works through the Fly mixer (unchanged agent).
4. Check edge logs for `voice-token` to confirm no signed-url 4xx and no audio-format errors.

## Out of scope

- No UI changes.
- No change to the Fly mixer, Twilio webhook, or tool webhooks.
- No prompt/personality changes.
