// Placeholder ambience: 1 second of low-amplitude μ-law noise, looped at runtime.
// Replace with a real venue ambience clip (μ-law 8kHz mono, base64) when desired.
function makePlaceholder(): string {
  const len = 8000; // 1s @ 8kHz
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    // very low-amplitude pseudo-random sample around μ-law silence (0xFF)
    const noise = Math.floor((Math.random() - 0.5) * 8);
    bytes[i] = (0xff + noise) & 0xff;
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export const AMBIENCE_ULAW_BASE64 = makePlaceholder();
