import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Unified AI Command Centre — single floating pill that consolidates the
 * previously-separate "Ask Copilot" and "Brain" floating buttons.
 *
 * - Clicking the Brain icon opens the Live Brain side panel.
 * - Clicking the text area opens the Ask Copilot chat panel.
 * - Cmd/Ctrl+K opens Copilot (preserved from old behaviour).
 *
 * Both target components (FloatingBrain, StaffCopilot) listen for the
 * window CustomEvents dispatched here, so all logic, hooks, realtime
 * subscriptions and panel UIs remain unchanged.
 */
export function AICommandCenter() {
  const { venue } = useAuth();
  const [count, setCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const onCount = (e: Event) => {
      const c = (e as CustomEvent<{ count: number }>).detail?.count ?? 0;
      setCount(c);
    };
    const onPulse = () => {
      setPulse(true);
      window.setTimeout(() => setPulse(false), 1800);
    };
    window.addEventListener("aijentik:brain-count", onCount);
    window.addEventListener("aijentik:brain-pulse", onPulse);
    return () => {
      window.removeEventListener("aijentik:brain-count", onCount);
      window.removeEventListener("aijentik:brain-pulse", onPulse);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("aijentik:open-copilot"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!venue) return null;

  const openBrain = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("aijentik:open-brain"));
  };
  const openCopilot = () => {
    window.dispatchEvent(new CustomEvent("aijentik:open-copilot"));
  };

  return (
    <motion.div
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      animate={{ scale: hovered ? 1.02 : 1, y: hovered ? -1 : 0 }}
      transition={{ type: "spring", damping: 22, stiffness: 260 }}
      className="fixed bottom-6 right-6 z-50 group"
      role="toolbar"
      aria-label="AI Command Centre"
    >
      {/* Ambient outer aura — single source of glow */}
      <span
        className="pointer-events-none absolute -inset-4 rounded-full blur-2xl opacity-40 -z-10"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--primary) / 0.45), transparent 70%)",
        }}
      />

      <div
        className="relative flex items-center gap-2 sm:gap-2.5 h-12 sm:h-[52px] pl-1.5 pr-3 sm:pr-5 rounded-full
          bg-[hsl(28_18%_5%_/_0.94)]
          border border-primary/30
          shadow-[0_18px_50px_-12px_hsl(0_0%_0%_/_0.65),0_0_28px_-6px_hsl(var(--primary)/0.45),0_1px_0_hsl(36_100%_90%_/_0.08)_inset]
          transition-[border-color,box-shadow] duration-300
          group-hover:border-primary/55 group-hover:shadow-[0_22px_60px_-12px_hsl(0_0%_0%_/_0.7),0_0_46px_-6px_hsl(var(--primary)/0.6),0_1px_0_hsl(36_100%_90%_/_0.1)_inset]"
      >
        {/* Inner shimmer sweep on hover */}
        <span
          className="pointer-events-none absolute inset-0 rounded-full overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          aria-hidden
        >
          <span
            className="absolute -inset-y-2 -left-1/3 w-1/3 rotate-12 blur-md"
            style={{
              background:
                "linear-gradient(90deg, transparent, hsl(36 100% 85% / 0.18), transparent)",
              animation: "shimmer-sweep 2.4s ease-in-out infinite",
            }}
          />
        </span>

        {/* Brain — opens Live Brain */}
        <button
          onClick={openBrain}
          aria-label="Open Live Brain"
          title="Live Brain"
          className="relative h-10 w-10 sm:h-[42px] sm:w-[42px] rounded-full grid place-items-center
            shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60
            transition-transform duration-200 hover:scale-[1.06] active:scale-[0.96]"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, hsl(38 100% 78%), hsl(32 96% 58%) 50%, hsl(22 88% 42%))",
            boxShadow:
              "0 0 24px hsl(var(--primary) / 0.5), 0 1px 0 hsl(36 100% 95% / 0.35) inset, 0 6px 18px -6px hsl(0 0% 0% / 0.6)",
          }}
        >
          {/* Static neural ring */}
          <span
            className="absolute inset-0 rounded-full opacity-35"
            style={{
              background:
                "conic-gradient(from 32deg, transparent 0deg, hsl(36 100% 90% / 0.22) 90deg, transparent 180deg, hsl(36 100% 90% / 0.16) 270deg, transparent 360deg)",
              maskImage:
                "radial-gradient(circle, transparent 55%, black 60%, black 75%, transparent 80%)",
              WebkitMaskImage:
                "radial-gradient(circle, transparent 55%, black 60%, black 75%, transparent 80%)",
            }}
            aria-hidden
          />
          {/* Glossy highlight */}
          <span
            className="absolute top-1 left-2 right-3 h-2 rounded-full opacity-70 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse, hsl(0 0% 100% / 0.55), transparent 70%)",
            }}
            aria-hidden
          />
          {/* Pulse ring on new brain event */}
          {pulse && (
            <span className="absolute -inset-1 rounded-full border border-primary/70 animate-ring-out" />
          )}
          <span className="relative grid place-items-center">
            <Brain
              className="h-[18px] w-[18px] sm:h-5 sm:w-5 text-primary-foreground drop-shadow"
              strokeWidth={2.4}
            />
          </span>
          {count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-background text-[10px] font-bold text-primary border border-primary/50 grid place-items-center shadow-md">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>

        {/* Copilot label — opens chat */}
        <button
          onClick={openCopilot}
          aria-label="Open Ask Copilot"
          title="Ask Copilot"
          className="relative flex items-center gap-2 pl-1 pr-1 sm:pr-2 py-1 rounded-full
            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <span className="hidden xs:inline-flex items-center gap-1.5">
            <Sparkles
              className="h-3 w-3 text-primary/80 opacity-0 group-hover:opacity-100 transition-opacity"
              strokeWidth={2.4}
              aria-hidden
            />
          </span>
          <span className="text-[13px] sm:text-sm font-medium tracking-tight text-foreground">
            Ask Copilot
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:inline border-l border-white/10 pl-2.5 ml-1">
            ⌘K
          </span>
        </button>

        {/* Hover tooltip — AI Command Centre */}
        <motion.span
          initial={false}
          animate={{
            opacity: hovered ? 1 : 0,
            y: hovered ? -8 : -2,
          }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="pointer-events-none absolute -top-8 right-2 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.14em]
            bg-[hsl(28_18%_5%_/_0.9)] border border-white/10 text-muted-foreground
            shadow-[0_6px_18px_-6px_hsl(0_0%_0%_/_0.6)]"
        >
          AI Command Centre
        </motion.span>
      </div>

      {/* Local keyframes for the shimmer sweep */}
      <style>{`
        @keyframes shimmer-sweep {
          0% { transform: translateX(0) rotate(12deg); }
          60% { transform: translateX(420%) rotate(12deg); }
          100% { transform: translateX(420%) rotate(12deg); }
        }
      `}</style>
    </motion.div>
  );
}
