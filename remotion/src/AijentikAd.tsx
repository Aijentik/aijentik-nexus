import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  Video,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadInterTight } from "@remotion/google-fonts/InterTight";

const display = loadFraunces("normal", { weights: ["700", "900"], subsets: ["latin"] }).fontFamily;
const body = loadInterTight("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] }).fontFamily;

const C = {
  bg: "#070503",
  ink: "#0D0A06",
  copper: "#E88B35",
  amber: "#FFC36B",
  cream: "#F8EAD3",
  muted: "#B69E80",
  green: "#43D18B",
  red: "#FF5A4F",
  blue: "#68B8FF",
};

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeInOut = Easing.bezier(0.76, 0, 0.24, 1);

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

function useIn(start = 0, dur = 18) {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, start + dur], [0, 1], { ...clamp, easing: easeOut });
}

function Grain() {
  return <AbsoluteFill style={{
    opacity: 0.08,
    mixBlendMode: "overlay",
    backgroundImage: "url('data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"220\" height=\"220\"%3E%3Cfilter id=\"n\"%3E%3CfeTurbulence type=\"fractalNoise\" baseFrequency=\"0.85\" numOctaves=\"3\" stitchTiles=\"stitch\"/%3E%3C/filter%3E%3Crect width=\"100%25\" height=\"100%25\" filter=\"url(%23n)\" opacity=\"0.65\"/%3E%3C/svg%3E')",
  }} />;
}

function CinematicBase() {
  const frame = useCurrentFrame();
  const x = Math.sin(frame / 55) * 34;
  const y = Math.cos(frame / 67) * 22;
  return <AbsoluteFill style={{ background: `radial-gradient(1100px 700px at ${20 + x / 24}% ${12 + y / 24}%, rgba(232,139,53,0.24), transparent 58%), radial-gradient(1000px 720px at ${78 - x / 30}% ${84 - y / 25}%, rgba(255,195,107,0.13), transparent 58%), linear-gradient(135deg, #080503 0%, #130C06 46%, #050403 100%)` }}>
    <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)", backgroundSize: "64px 64px", maskImage: "radial-gradient(ellipse at center, black 25%, transparent 80%)" }} />
    <Grain />
  </AbsoluteFill>;
}

function KineticWord({ children, delay = 0, size = 118, accent = false }: { children: React.ReactNode; delay?: number; size?: number; accent?: boolean }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 14], [0, 1], { ...clamp, easing: easeOut });
  return <span style={{
    display: "inline-block",
    opacity: p,
    transform: `translateY(${(1 - p) * 72}px) scale(${0.9 + p * 0.1})`,
    color: accent ? C.amber : C.cream,
    fontFamily: display,
    fontSize: size,
    lineHeight: 0.9,
    fontWeight: 900,
    letterSpacing: 0,
    textShadow: accent ? "0 0 44px rgba(255,195,107,0.32)" : "0 20px 80px rgba(0,0,0,0.65)",
    marginRight: 22,
  }}>{children}</span>;
}

function Footage({ src, start = 0, zoom = 1.08, opacity = 1 }: { src: string; start?: number; zoom?: number; opacity?: number }) {
  const frame = useCurrentFrame();
  const z = interpolate(frame, [0, 150], [zoom, zoom + 0.07], clamp);
  return <AbsoluteFill style={{ overflow: "hidden", background: C.bg }}>
    <Video
      src={staticFile(src)}
      muted
      startFrom={start}
      style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z})`, opacity }}
      playbackRate={1.0}
    />
    <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(7,5,3,0.86), rgba(7,5,3,0.24) 47%, rgba(7,5,3,0.70)), linear-gradient(0deg, rgba(7,5,3,0.70), transparent 38%, rgba(7,5,3,0.28))" }} />
    <Grain />
  </AbsoluteFill>;
}

function LogoLockup({ small = false }: { small?: boolean }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
    <div style={{ width: small ? 48 : 66, height: small ? 48 : 66, borderRadius: 18, background: `linear-gradient(135deg, ${C.amber}, ${C.copper})`, display: "grid", placeItems: "center", boxShadow: "0 0 52px rgba(232,139,53,.48)" }}>
      <div style={{ fontFamily: display, fontWeight: 900, fontSize: small ? 26 : 36, color: C.ink }}>A</div>
    </div>
    <div>
      <div style={{ fontFamily: display, fontSize: small ? 34 : 52, fontWeight: 900, color: C.cream, lineHeight: 0.86 }}>Aijentik</div>
      <div style={{ fontFamily: body, color: C.amber, fontSize: small ? 14 : 18, fontWeight: 700, textTransform: "uppercase", letterSpacing: 3 }}>Hospitality OS</div>
    </div>
  </div>;
}

function PhoneCallUI() {
  const frame = useCurrentFrame();
  const p = useIn(8, 18);
  const ring = Math.sin(frame * 0.8) * 4;
  const transcript = [
    { t: 42, who: "Guest", text: "Hi — table for four this Friday, 7:30?" },
    { t: 76, who: "AI Host", text: "I can do 7:30 on the terrace. Any occasion?" },
    { t: 112, who: "Guest", text: "Anniversary. If possible, a quiet table." },
    { t: 146, who: "AI Host", text: "Booked. Confirmation and deposit link sent." },
  ];
  return <div style={{
    position: "absolute", right: 132, top: 138, width: 560, height: 806,
    borderRadius: 48, background: "linear-gradient(180deg, rgba(19,13,8,.96), rgba(7,5,3,.96))",
    border: "1px solid rgba(255,234,211,.16)", boxShadow: "0 54px 150px rgba(0,0,0,.76), 0 0 90px rgba(232,139,53,.22)",
    transform: `translateX(${(1 - p) * 190}px) rotate(${(1 - p) * 5}deg)`, opacity: p, padding: 32,
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
      <div style={{ fontFamily: body, color: C.muted, fontSize: 18, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>Incoming call</div>
      <div style={{ width: 14, height: 14, borderRadius: 20, background: C.green, boxShadow: "0 0 26px rgba(67,209,139,.82)", transform: `scale(${1 + Math.max(0, ring) / 18})` }} />
    </div>
    <div style={{ padding: 26, borderRadius: 34, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)" }}>
      <div style={{ fontFamily: display, fontSize: 56, color: C.cream, fontWeight: 900, lineHeight: 1 }}>Sarah Mitchell</div>
      <div style={{ fontFamily: body, color: C.amber, fontSize: 22, marginTop: 8, fontWeight: 700 }}>Anniversary dinner · Party of 4</div>
      <div style={{ marginTop: 24, height: 12, borderRadius: 20, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${interpolate(frame, [30, 170], [8, 98], clamp)}%`, background: `linear-gradient(90deg, ${C.copper}, ${C.amber})`, borderRadius: 20 }} />
      </div>
      <div style={{ marginTop: 10, color: C.muted, fontFamily: body, fontSize: 16 }}>Intent confidence {Math.round(interpolate(frame, [30, 90], [76, 98], clamp))}%</div>
    </div>
    <div style={{ marginTop: 22, display: "grid", gap: 12 }}>
      {transcript.map((m, i) => {
        const q = interpolate(frame, [m.t, m.t + 13], [0, 1], { ...clamp, easing: easeOut });
        return <div key={i} style={{ opacity: q, transform: `translateY(${(1 - q) * 18}px)`, marginLeft: m.who === "Guest" ? 52 : 0, padding: "16px 18px", borderRadius: 22, background: m.who === "Guest" ? "rgba(232,139,53,.12)" : "rgba(255,255,255,.055)", border: `1px solid ${m.who === "Guest" ? "rgba(232,139,53,.22)" : "rgba(255,255,255,.09)"}` }}>
          <div style={{ fontFamily: body, color: m.who === "Guest" ? C.amber : C.muted, fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.6, marginBottom: 5 }}>{m.who}</div>
          <div style={{ fontFamily: body, color: C.cream, fontSize: 20, lineHeight: 1.18 }}>{m.text}</div>
        </div>;
      })}
    </div>
  </div>;
}

function CalendarUI() {
  const frame = useCurrentFrame();
  const p = useIn(10, 18);
  const cursor = interpolate(frame, [26, 58, 100, 144], [0, 1, 2, 3], clamp);
  const cx = [1150, 965, 1090, 1335][Math.floor(cursor)] ?? 1335;
  const cy = [375, 510, 638, 728][Math.floor(cursor)] ?? 728;
  const cards = [
    { x: 720, y: 230, w: 220, h: 96, label: "7:00 · Table 12", c: C.blue },
    { x: 968, y: 230, w: 246, h: 96, label: "7:30 · Terrace", c: C.amber },
    { x: 1240, y: 230, w: 236, h: 96, label: "8:00 · Booth 6", c: C.green },
    { x: 850, y: 388, w: 252, h: 104, label: "Sarah M. · 4 guests", c: C.amber, hot: true },
    { x: 1134, y: 388, w: 214, h: 104, label: "VIP note added", c: C.green },
  ];
  return <div style={{ position: "absolute", left: 122, top: 124, width: 1490, height: 830, borderRadius: 44, background: "rgba(10,7,4,.94)", border: "1px solid rgba(248,234,211,.14)", boxShadow: "0 50px 140px rgba(0,0,0,.72)", opacity: p, transform: `translateY(${(1-p)*90}px) scale(${0.96 + p * 0.04})`, overflow: "hidden" }}>
    <div style={{ height: 92, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 36px", borderBottom: "1px solid rgba(255,255,255,.08)", background: "linear-gradient(90deg, rgba(232,139,53,.12), rgba(255,255,255,.02))" }}>
      <LogoLockup small />
      <div style={{ display: "flex", gap: 14, fontFamily: body, fontSize: 18, fontWeight: 700, color: C.cream }}>
        {['Voice', 'Bookings', 'Messages', 'Payments', 'Live Ops'].map((x, i) => <div key={x} style={{ padding: "12px 18px", borderRadius: 999, background: i === 1 ? "rgba(232,139,53,.24)" : "rgba(255,255,255,.05)", color: i === 1 ? C.amber : C.muted }}>{x}</div>)}
      </div>
    </div>
    <div style={{ position: "absolute", left: 42, top: 130, width: 265, bottom: 40, borderRight: "1px solid rgba(255,255,255,.08)", paddingRight: 32 }}>
      <div style={{ fontFamily: body, color: C.muted, fontSize: 16, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2 }}>Guest profile</div>
      <div style={{ fontFamily: display, color: C.cream, fontSize: 54, fontWeight: 900, marginTop: 18 }}>Sarah M.</div>
      {['Anniversary', 'Quiet table', 'Prefers terrace', 'Deposit required'].map((x, i) => {
        const q = interpolate(frame, [44 + i * 13, 56 + i * 13], [0, 1], { ...clamp, easing: easeOut });
        return <div key={x} style={{ opacity: q, transform: `translateX(${(1-q)*-20}px)`, marginTop: 15, padding: "13px 15px", borderRadius: 16, background: "rgba(255,255,255,.055)", color: i === 0 ? C.amber : C.cream, fontFamily: body, fontSize: 19, fontWeight: 650, border: "1px solid rgba(255,255,255,.08)" }}>{x}</div>
      })}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 32, padding: 18, borderRadius: 22, background: "rgba(67,209,139,.12)", border: "1px solid rgba(67,209,139,.28)", color: C.green, fontFamily: body, fontSize: 21, fontWeight: 800 }}>Booking confirmed</div>
    </div>
    <div style={{ position: "absolute", left: 365, right: 40, top: 132, bottom: 40 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginBottom: 20 }}>
        {['Fri 17', 'Sat 18', 'Sun 19', 'Mon 20'].map((d, i) => <div key={d} style={{ height: 76, borderRadius: 20, background: i === 0 ? "rgba(232,139,53,.20)" : "rgba(255,255,255,.045)", border: `1px solid ${i === 0 ? "rgba(232,139,53,.34)" : "rgba(255,255,255,.08)"}`, color: i === 0 ? C.amber : C.muted, fontFamily: body, fontSize: 24, fontWeight: 800, display: "grid", placeItems: "center" }}>{d}</div>)}
      </div>
      <div style={{ position: "absolute", inset: "100px 0 0 0", backgroundImage: "linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px)", backgroundSize: "100% 112px, 248px 100%" }} />
      {cards.map((card, i) => {
        const q = interpolate(frame, [30 + i * 14, 46 + i * 14], [0, 1], { ...clamp, easing: easeOut });
        const glow = card.hot ? Math.sin(frame / 6) * 0.5 + 0.5 : 0;
        return <div key={i} style={{ position: "absolute", left: card.x - 365, top: card.y - 132, width: card.w, height: card.h, borderRadius: 22, background: `linear-gradient(135deg, ${card.c}33, rgba(255,255,255,.045))`, border: `1px solid ${card.c}66`, opacity: q, transform: `scale(${0.9 + q * 0.1})`, boxShadow: card.hot ? `0 0 ${30 + glow * 30}px ${card.c}44` : undefined, padding: 18, fontFamily: body, color: C.cream, fontSize: 21, fontWeight: 800 }}>{card.label}</div>
      })}
    </div>
    <div style={{ position: "absolute", left: cx, top: cy, width: 38, height: 38, transform: `translate(-5px, -5px) scale(${1 + Math.max(0, Math.sin(frame/3))*0.08})`, filter: "drop-shadow(0 12px 20px rgba(0,0,0,.6))" }}>
      <svg viewBox="0 0 36 36"><path d="M4 3l25 16-12 3-5 11z" fill={C.cream}/><path d="M15 21l7 10" stroke={C.ink} strokeWidth="4" strokeLinecap="round"/></svg>
    </div>
  </div>;
}

function OpsUI() {
  const frame = useCurrentFrame();
  const p = useIn(5, 18);
  const events = [
    ["SMS confirmation sent", "0.8 sec", C.green],
    ["Deposit link paid", "$80", C.amber],
    ["Floor note delivered", "Booth 6", C.blue],
    ["Waitlist optimized", "+$2.1k", C.green],
  ];
  return <div style={{ position: "absolute", inset: 112, opacity: p, transform: `scale(${0.95 + p*0.05})` }}>
    <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 32, height: "100%" }}>
      <div style={{ borderRadius: 44, background: "rgba(7,5,3,.91)", border: "1px solid rgba(255,255,255,.12)", padding: 42, boxShadow: "0 44px 120px rgba(0,0,0,.65)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontFamily: body, color: C.amber, fontSize: 17, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>Live operational stream</div><div style={{ fontFamily: display, color: C.cream, fontSize: 62, fontWeight: 900, marginTop: 8 }}>One system moving</div></div>
          <div style={{ fontFamily: body, color: C.green, fontSize: 22, fontWeight: 800, padding: "14px 18px", borderRadius: 999, background: "rgba(67,209,139,.13)", border: "1px solid rgba(67,209,139,.32)" }}>LIVE</div>
        </div>
        <div style={{ marginTop: 38, display: "grid", gap: 18 }}>
          {events.map((e, i) => {
            const q = interpolate(frame, [35 + i*22, 51 + i*22], [0, 1], { ...clamp, easing: easeOut });
            return <div key={e[0]} style={{ opacity: q, transform: `translateX(${(1-q)*-44}px)`, display: "grid", gridTemplateColumns: "42px 1fr auto", gap: 18, alignItems: "center", padding: 22, borderRadius: 26, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ width: 42, height: 42, borderRadius: 18, background: `${e[2]}26`, border: `1px solid ${e[2]}66`, display: "grid", placeItems: "center" }}><div style={{ width: 13, height: 13, borderRadius: 999, background: e[2], boxShadow: `0 0 22px ${e[2]}` }} /></div>
              <div style={{ fontFamily: body, color: C.cream, fontSize: 26, fontWeight: 750 }}>{e[0]}</div>
              <div style={{ fontFamily: body, color: e[2], fontSize: 24, fontWeight: 850 }}>{e[1]}</div>
            </div>
          })}
        </div>
      </div>
      <div style={{ borderRadius: 44, background: "linear-gradient(180deg, rgba(232,139,53,.15), rgba(255,255,255,.04))", border: "1px solid rgba(255,195,107,.20)", padding: 42, boxShadow: "0 44px 120px rgba(0,0,0,.65)" }}>
        <div style={{ fontFamily: body, color: C.muted, fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>Tonight's lift</div>
        <div style={{ fontFamily: display, color: C.amber, fontSize: 118, fontWeight: 900, lineHeight: 0.88, marginTop: 20 }}>${Math.round(interpolate(frame, [38, 138], [430, 2140], clamp)).toLocaleString()}</div>
        <div style={{ fontFamily: body, color: C.cream, fontSize: 27, fontWeight: 750, marginTop: 12 }}>Revenue influenced by Aijentik</div>
        <div style={{ marginTop: 44, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {Array.from({ length: 56 }).map((_, i) => {
            const q = interpolate(frame, [20 + i * 1.4, 42 + i * 1.4], [0, 1], clamp);
            const hot = (i * 17 + 5) % 9;
            const col = hot > 5 ? C.green : hot > 2 ? C.amber : "rgba(255,255,255,.14)";
            return <div key={i} style={{ height: 42, borderRadius: 9, background: col, opacity: 0.18 + q * 0.62, transform: `scale(${0.72 + q*0.28})` }} />
          })}
        </div>
      </div>
    </div>
  </div>;
}

function HookScene() {
  const frame = useCurrentFrame();
  const flash = interpolate(frame, [0, 5, 11, 17], [1, 0, 0.42, 0], clamp);
  return <AbsoluteFill>
    <Footage src="footage/restaurant-energy.mp4" zoom={1.12} />
    <AbsoluteFill style={{ background: `rgba(255,195,107,${flash})`, mixBlendMode: "screen" }} />
    <div style={{ position: "absolute", left: 96, top: 70 }}><LogoLockup small /></div>
    <div style={{ position: "absolute", left: 112, bottom: 110, width: 1180 }}>
      <div style={{ fontFamily: body, color: C.amber, fontSize: 24, fontWeight: 900, letterSpacing: 4, textTransform: "uppercase", marginBottom: 18, opacity: useIn(0, 8) }}>Your venue is moving. Your AI should be faster.</div>
      <div><KineticWord delay={2} size={132}>Never</KineticWord><KineticWord delay={8} size={132} accent>miss</KineticWord><KineticWord delay={14} size={132}>the moment.</KineticWord></div>
    </div>
    <div style={{ position: "absolute", right: 92, bottom: 94, display: "grid", gap: 12 }}>
      {["missed call", "empty table", "slow reply"].map((x, i) => {
        const p = interpolate(frame, [18 + i * 8, 32 + i * 8], [0, 1], { ...clamp, easing: easeOut });
        return <div key={x} style={{ opacity: p, transform: `translateX(${(1-p)*70}px)`, fontFamily: body, color: C.red, fontSize: 24, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, padding: "13px 18px", borderRadius: 999, background: "rgba(255,90,79,.14)", border: "1px solid rgba(255,90,79,.3)" }}>{x}</div>
      })}
    </div>
  </AbsoluteFill>;
}

function VoiceScene() {
  return <AbsoluteFill>
    <Footage src="footage/phone-reservation-action.mp4" zoom={1.08} />
    <div style={{ position: "absolute", left: 108, top: 142, width: 720 }}>
      <div style={{ fontFamily: body, color: C.amber, fontSize: 22, fontWeight: 900, letterSpacing: 4, textTransform: "uppercase", opacity: useIn(4, 12) }}>Live voice agent</div>
      <div style={{ fontFamily: display, color: C.cream, fontSize: 105, fontWeight: 900, lineHeight: 0.92, marginTop: 16, opacity: useIn(10, 16), transform: `translateY(${(1-useIn(10,16))*48}px)` }}>Answers instantly. Acts instantly.</div>
    </div>
    <PhoneCallUI />
  </AbsoluteFill>;
}

function BookingScene() {
  return <AbsoluteFill>
    <Footage src="footage/manager-tablet-action.mp4" zoom={1.06} opacity={0.62} />
    <CalendarUI />
    <div style={{ position: "absolute", left: 112, bottom: 72, fontFamily: body, color: C.cream, fontSize: 28, fontWeight: 800, padding: "18px 22px", borderRadius: 999, background: "rgba(7,5,3,.72)", border: "1px solid rgba(255,195,107,.24)", opacity: useIn(104, 18) }}>Real action: call → booking → guest profile → deposit link.</div>
  </AbsoluteFill>;
}

function ConnectedScene() {
  const frame = useCurrentFrame();
  const lines = [
    { a: "Voice", b: "understands intent", x: 220, y: 220 },
    { a: "Bookings", b: "finds the table", x: 1220, y: 210 },
    { a: "Messages", b: "confirms instantly", x: 250, y: 730 },
    { a: "Payments", b: "collects deposits", x: 1230, y: 742 },
    { a: "Ops Brain", b: "updates the floor", x: 740, y: 475 },
  ];
  return <AbsoluteFill>
    <CinematicBase />
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      {lines.slice(0, 4).map((n, i) => {
        const p = interpolate(frame, [35 + i*10, 75 + i*10], [0, 1], clamp);
        return <line key={i} x1={960} y1={540} x2={n.x + 125} y2={n.y + 46} stroke={C.amber} strokeWidth="3" strokeOpacity={0.25 * p} strokeDasharray="12 18" />
      })}
    </svg>
    <div style={{ position: "absolute", left: 690, top: 312, width: 540, height: 460, borderRadius: 999, background: "radial-gradient(circle, rgba(255,195,107,.25), rgba(232,139,53,.08) 48%, transparent 70%)", display: "grid", placeItems: "center", transform: `scale(${0.92 + Math.sin(frame/24)*0.025})`, boxShadow: "0 0 110px rgba(232,139,53,.18)" }}>
      <LogoLockup />
    </div>
    {lines.map((n, i) => {
      const p = interpolate(frame, [18 + i * 12, 36 + i * 12], [0, 1], { ...clamp, easing: easeOut });
      return <div key={n.a} style={{ position: "absolute", left: n.x, top: n.y, width: 318, padding: 22, borderRadius: 28, background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.12)", opacity: p, transform: `translateY(${(1-p)*34}px) scale(${0.92+p*0.08})`, boxShadow: "0 24px 80px rgba(0,0,0,.42)" }}>
        <div style={{ fontFamily: display, color: C.cream, fontSize: 38, fontWeight: 900 }}>{n.a}</div>
        <div style={{ fontFamily: body, color: C.amber, fontSize: 20, fontWeight: 750, marginTop: 4 }}>{n.b}</div>
      </div>
    })}
    <div style={{ position: "absolute", left: 128, top: 72, width: 1000, fontFamily: display, color: C.cream, fontSize: 88, fontWeight: 900, lineHeight: .92, opacity: useIn(0, 16) }}>Not five tools. One living operating system.</div>
  </AbsoluteFill>;
}

function OpsScene() {
  return <AbsoluteFill>
    <Footage src="footage/chef-service-action.mp4" zoom={1.08} opacity={0.55} />
    <OpsUI />
  </AbsoluteFill>;
}

function EndScene() {
  const frame = useCurrentFrame();
  const s = spring({ frame: frame - 12, fps: 30, config: { damping: 100, stiffness: 120 } });
  return <AbsoluteFill>
    <CinematicBase />
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
      <div style={{ transform: `scale(${0.82 + s * 0.18})`, opacity: s }}>
        <LogoLockup />
        <div style={{ fontFamily: display, color: C.cream, fontSize: 118, fontWeight: 900, lineHeight: .88, marginTop: 54, width: 1300 }}>For venues that refuse to miss a moment.</div>
        <div style={{ fontFamily: body, color: C.amber, fontSize: 34, fontWeight: 800, marginTop: 30, letterSpacing: 2, textTransform: "uppercase" }}>Voice · Bookings · Payments · Messaging · Live Ops</div>
      </div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, background: `linear-gradient(90deg, ${C.copper}, ${C.amber}, ${C.green})`, transform: `scaleX(${interpolate(frame, [0, 120], [0, 1], clamp)})`, transformOrigin: "left" }} />
  </AbsoluteFill>;
}

function SceneWrap({ from, duration, children }: { from: number; duration: number; children: React.ReactNode }) {
  return <Sequence from={from} durationInFrames={duration}>{children}</Sequence>;
}

export const AijentikAd: React.FC = () => {
  return <AbsoluteFill style={{ backgroundColor: C.bg }}>
    <Audio src={staticFile("audio/music.mp3")} volume={(f) => {
      if (f < 28) return interpolate(f, [0, 28], [0.18, 0.38], clamp);
      if (f > 1190) return interpolate(f, [1190, 1288], [0.36, 0.12], clamp);
      return 0.30;
    }} />
    <Audio src={staticFile("audio/narration.mp3")} volume={1.0} />
    <SceneWrap from={0} duration={162}><HookScene /></SceneWrap>
    <SceneWrap from={132} duration={252}><VoiceScene /></SceneWrap>
    <SceneWrap from={354} duration={294}><BookingScene /></SceneWrap>
    <SceneWrap from={620} duration={216}><ConnectedScene /></SceneWrap>
    <SceneWrap from={806} duration={276}><OpsScene /></SceneWrap>
    <SceneWrap from={1054} duration={236}><EndScene /></SceneWrap>
  </AbsoluteFill>;
};
