import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sun, Sunrise, Sunset, Moon } from "lucide-react";

function phaseFor(h: number) {
  if (h < 5)  return { label: "Late Night",   Icon: Moon,    tone: "from-indigo-500/20 to-amber-500/10", dot: "hsl(232 70% 70%)" };
  if (h < 11) return { label: "Morning",      Icon: Sunrise, tone: "from-amber-300/20 to-rose-400/10",   dot: "hsl(36 96% 70%)"  };
  if (h < 16) return { label: "Afternoon",    Icon: Sun,     tone: "from-amber-400/25 to-yellow-300/10", dot: "hsl(42 96% 62%)"  };
  if (h < 20) return { label: "Golden Hour",  Icon: Sunset,  tone: "from-orange-500/25 to-fuchsia-500/10",dot: "hsl(20 90% 60%)"  };
  return         { label: "Service Night", Icon: Moon,    tone: "from-violet-500/20 to-amber-500/15",   dot: "hsl(282 60% 70%)" };
}

export function VenueClock({ venueName }: { venueName?: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const h = now.getHours();
  const m = now.getMinutes();
  const phase = phaseFor(h);
  const Icon = phase.Icon;
  const dayProgress = ((h * 60 + m) / (24 * 60)) * 100;
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="relative inline-flex items-center gap-3 pl-3 pr-4 py-2 rounded-full
      bg-[hsl(28_18%_6%/0.7)] backdrop-blur-xl border border-white/[0.05]
      shadow-[0_8px_32px_-8px_hsl(0_0%_0%/0.6),0_1px_0_hsl(36_100%_85%/0.05)_inset]
      overflow-hidden">
      <div className={`absolute inset-0 -z-10 bg-gradient-to-r ${phase.tone} opacity-60`} />
      <motion.div
        animate={{ rotate: [0, 8, -6, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="relative h-7 w-7 rounded-full grid place-items-center"
        style={{ background: `radial-gradient(circle at 30% 30%, ${phase.dot}, transparent 70%)` }}
      >
        <Icon className="h-4 w-4 text-foreground/90" strokeWidth={1.8} />
      </motion.div>
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold tracking-tight tabular-nums">{time}</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{phase.label}</span>
      </div>
      {venueName && (
        <span className="text-[11px] text-muted-foreground/70 border-l border-white/10 pl-3">{venueName}</span>
      )}
      {/* day progress hairline */}
      <div className="absolute left-0 right-0 bottom-0 h-[1.5px] bg-white/[0.04]">
        <div className="h-full bg-gradient-to-r from-primary/0 via-primary to-primary-glow"
          style={{ width: `${dayProgress}%`, boxShadow: "0 0 10px hsl(var(--primary)/0.6)" }} />
      </div>
    </div>
  );
}
