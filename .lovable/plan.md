## Finish the Aijentik platform walkthrough video

Pick up the Remotion project at `/tmp/remotion` where the render failed on a `TransitionSeries.Transition` `timing` prop and ship the final MP4.

### Fixes
1. Replace plain object `timing={{ durationInFrames: 20 }}` with `linearTiming({ durationInFrames: 20 })` (and `springTiming` where a softer feel suits the scene) in `MainVideo.tsx`.
2. Audit each `<TransitionSeries.Sequence>` duration so total frames still match the `<Composition durationInFrames>` after transition overlap.
3. Verify font loading (`@remotion/google-fonts`) runs at module scope so text isn't invisible.

### Render
4. Run the programmatic render script (`scripts/render-remotion.mjs`) with `chromeMode: "chrome-for-testing"`, `muted: true`, concurrency 1, output → `/mnt/documents/aijentik-walkthrough.mp4`.
5. If it crashes, drop any `backdropFilter`, reduce blurs, and retry.

### QA
6. Spot-check 3–4 key frames with `bunx remotion still` to confirm scenes render cleanly (no missing fonts, no clipped text, screenshots visible).
7. Confirm MP4 exists and report size.

### Deliver
8. Drop the file in chat as a `<lov-artifact>` with `mime_type="video/mp4"`.

No changes to the actual Aijentik app — Remotion project lives in `/tmp/remotion` only.