# Aijentik Hospitality OS — Cinematic Brand Film (v2)

A 60-second Super Bowl-grade brand film. Goosebump-raising. Cinematic. Sexy. Premium. Built in Remotion, voiced by ElevenLabs, with real captured footage of the live app — not screenshots, actual recorded interaction.

No changes to the app. Everything lives in `/tmp/remotion-v2/` and renders to `/mnt/documents/aijentik-cinematic.mp4`.

---

## Creative Direction

**Tone**: Apple "Think Different" meets Rolex meets a quiet luxury hotel. Restraint. Confidence. Inevitability.

**Palette**:
- Obsidian black `#08070A`
- Warm ember `#D4A05D` (Aijentik signature amber)
- Champagne cream `#F5EBD8`
- Smoke `#1A1815`

**Typography**: `Instrument Serif` (display, italic for emotional beats) + `Inter Tight` (body/UI).

**Motion system**: Slow cinematic dollies. 24fps feel via long ease-out curves. No bouncy springs. Letter-by-letter reveals on hero copy. Heavy use of negative space, then deliberate density. Light leaks and film grain overlay throughout.

**Audio**: ElevenLabs voiceover (voice: George — gravitas, British, cinematic). Ambient cinematic pad as bed music (sourced royalty-free or generated via ElevenLabs Music). Subtle UI ticks and whoosh transitions.

---

## The Script (60s, ~150 words)

> **[0–6s]** *Black. Warm ember pulse.*  
> "Every night, in every venue, a moment is missed."

> **[6–14s]** *Cuts: phone ringing unanswered, an empty table, a guest walking away.*  
> "A call unanswered. A booking lost. A guest forgotten."

> **[14–22s]** *Amber light blooms. Aijentik logo forms.*  
> "Not anymore."

> **[22–35s]** *Live screen recording — Voice AI answering a call, booking appearing in diary, table assigned on floor plan.*  
> "Aijentik answers. Aijentik books. Aijentik remembers."

> **[35–48s]** *Live feed of Brain timeline streaming, agents working in parallel, analytics climbing.*  
> "An intelligent layer for hospitality. Voice. Bookings. Payments. Insight. One nervous system. Always awake."

> **[48–58s]** *Slow push on the wordmark over a candlelit dining scene.*  
> "Aijentik. The operating system of modern hospitality."

> **[58–60s]** *Logo. Silence.*

---

## Production Pipeline

### 1. Live screen capture (real footage, not stills)
- Use Playwright with video recording (`recordVideo`) to capture 5–8 second clips of:
  - Voice AI orb pulsing on `/app/voice`
  - A booking appearing in `/app/diary`
  - Brain events streaming in `/app/brain`
  - Floor plan with table assignment on `/app/floor`
  - Analytics dashboard on `/app/analytics`
- Convert WebM → MP4 with ffmpeg, store in `remotion-v2/public/footage/`.

### 2. Voiceover (ElevenLabs TTS)
- Generate 6 narration segments via `https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb` (George) with `eleven_multilingual_v2`, stability 0.55, style 0.35.
- Save MP3s to `remotion-v2/public/audio/vo-1.mp3` … `vo-6.mp3`.
- Get duration with ffprobe → drives scene lengths.

### 3. Music bed
- Generate a 60s cinematic ambient pad via ElevenLabs Music API (`prompt: "cinematic ambient swell, warm strings, deep sub bass, slow build, minimal piano, luxury film score, no drums until 35s, climax at 50s"`).
- Save to `remotion-v2/public/audio/bed.mp3`. Mix at -18dB under VO.

### 4. Hero imagery (generated)
- Cinematic stills via imagegen (premium): candlelit restaurant, ringing phone in soft focus, empty doorway with warm light, hands on a tablet showing the Aijentik UI. Stored in `remotion-v2/public/images/`.

### 5. Remotion composition
- 1920×1080, 30fps, 1800 frames (60s).
- Persistent layers: film grain SVG, vignette, subtle ember light leaks drifting.
- Scenes via `<TransitionSeries>` with slow `fade` + `slide` (40-frame `linearTiming`).
- Per-scene: real captured video as background (with `<Video>` + scale/pan), overlay cinematic typography (Instrument Serif italic, kerned, letter-stagger reveals).
- VO tracks layered with `<Audio>`; music bed runs full duration.
- Lower-third captions appear as subtitles (small Inter Tight).

### 6. Render
- Programmatic render via `scripts/render-remotion.mjs`, `chromeMode: "chrome-for-testing"`, `concurrency: 1`, **`muted: false`** (we need audio this time — verify ffmpeg AAC encoder works; if `libfdk_aac` missing, use `audioCodec: "aac"` with default encoder).
- If audio mux fails in Remotion, render video silent then mux VO+bed via ffmpeg as a final pass.
- Output: `/mnt/documents/aijentik-cinematic.mp4`.

### 7. QA
- Extract 6 stills across the timeline with `bunx remotion still`, inspect each.
- Probe final MP4 with ffprobe to confirm audio stream, duration ~60s, 1080p.

---

## Risks / Mitigations

- **App auth gate**: Playwright needs to log in first. Use existing demo credentials or a magic-link bypass; if blocked, fall back to recording the public landing flow + generated UI mockups.
- **Audio encoding in sandbox**: If Remotion can't mux AAC, render silent and post-mux with ffmpeg (already in PATH).
- **Render time**: 60s @ 30fps with video layers = heavier render. Budget 4–6 min, well under the 10-min cap. If it overruns, split render into two halves and concat.
- **ElevenLabs key**: Confirm `ELEVENLABS_API_KEY` is set; if missing, request it before starting.

---

## Deliverable

Single MP4: `/mnt/documents/aijentik-cinematic.mp4` (~60s, 1080p, with voiceover and music), dropped in chat as a `<lov-artifact>`. **Zero changes to the Aijentik app codebase.**
