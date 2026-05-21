import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DEMO_STEPS, type DemoStep } from "./steps";
import { toast } from "sonner";

type DemoCtx = {
  isEligible: boolean;
  isRunning: boolean;
  isPaused: boolean;
  seeding: boolean;
  currentStepIndex: number;
  steps: DemoStep[];
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  exit: () => void;
  restart: () => void;
  reseed: () => Promise<boolean>;
  resetDemoData: () => Promise<void>;
  resetAllDemoData: () => Promise<boolean>;
  enableDemoMode: () => void;
  disableDemoMode: () => void;
};

const Ctx = createContext<DemoCtx | null>(null);
export const useDemoTour = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDemoTour must be used inside DemoTourProvider");
  return v;
};

const DEMO_FLAG_KEY = "aijentik:demoModeEnabled";

export function isDemoEligible(opts: { venue?: any; user?: any }) {
  try {
    if (typeof window !== "undefined" && localStorage.getItem(DEMO_FLAG_KEY) === "1") return true;
  } catch {}
  const v = opts.venue;
  if (v?.status === "demo") return true;
  if (typeof v?.name === "string" && /demo/i.test(v.name)) return true;
  const email = opts.user?.email || "";
  if (/demo@|@demo\./i.test(email) || email === "demo@aijentik.com") return true;
  return false;
}

// Ambient brain-event lines used by the heartbeat — make the platform feel alive.
const AMBIENT_LINES: Array<{ title: string; reason: string; severity: "info" | "success" | "warn" }> = [
  { title: "Concierge: birthday detected", reason: "Guest tagged. Candles ready, cake fee waived.", severity: "info" },
  { title: "Voice host answered call", reason: "Booking captured · party of 2 · confidence 0.96", severity: "success" },
  { title: "Floor plan rebalanced", reason: "T3+T4 combined for party of 8 at 20:00", severity: "info" },
  { title: "No-show risk flagged", reason: "1 booking without confirmation 18h out — reminder dispatched", severity: "warn" },
  { title: "Wine pairing suggested", reason: "Halibut → Chablis 1er Cru. Pushed to runner tablet.", severity: "info" },
  { title: "Cover forecast", reason: "Tonight tracking +9% vs 4-week average", severity: "info" },
  { title: "Self-heal: FAQ added", reason: "Learned 'do you serve oat milk' from 2 calls today", severity: "info" },
  { title: "SMS confirmation delivered", reason: "Sarah Mitchell · Fri 19:00 · party of 4", severity: "success" },
  { title: "Repeat guest recognized", reason: "Olivia Park — VIP service note flagged", severity: "info" },
  { title: "Allergen alert", reason: "Shellfish allergy on T9 — kitchen notified", severity: "warn" },
];

export function DemoTourProvider({ children }: { children: ReactNode }) {
  const { venue, user } = useAuth();
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const insertedIds = useRef<string[]>([]);
  const timers = useRef<number[]>([]);
  const heartbeat = useRef<number | null>(null);

  const isEligible = useMemo(() => isDemoEligible({ venue, user }), [venue, user]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const enableDemoMode = useCallback(() => {
    try {
      localStorage.setItem(DEMO_FLAG_KEY, "1");
    } catch {}
  }, []);

  const disableDemoMode = useCallback(() => {
    try {
      localStorage.removeItem(DEMO_FLAG_KEY);
    } catch {}
    if (heartbeat.current) {
      window.clearInterval(heartbeat.current);
      heartbeat.current = null;
    }
  }, []);

  const runStep = useCallback(
    async (idx: number) => {
      const step = DEMO_STEPS[idx];
      if (!step || !venue) return;
      clearTimers();
      try {
        navigate(step.route);
      } catch {}
      for (const ev of step.events || []) {
        const t = window.setTimeout(async () => {
          if (!venue) return;
          const { data, error } = await supabase
            .from("brain_events")
            .insert({
              venue_id: venue.id,
              title: ev.title,
              reason: ev.reason || null,
              severity: (ev.severity || "info") as any,
              meta: { isDemoGenerated: true, stepId: step.id },
            })
            .select("id")
            .maybeSingle();
          if (!error && data?.id) insertedIds.current.push(data.id);
        }, ev.delay || 250);
        timers.current.push(t);
      }
    },
    [navigate, venue],
  );

  const callSeed = useCallback(
    async (mode: "seed" | "reset") => {
      if (!venue) return false;
      const { error } = await supabase.functions.invoke("seed-demo", { body: { venue_id: venue.id, mode } });
      if (error) {
        toast.error(mode === "reset" ? "Reset failed" : "Seed failed", { description: error.message });
        return false;
      }
      return true;
    },
    [venue],
  );

  const reseed = useCallback(async () => {
    if (!venue) return false;
    setSeeding(true);
    const ok = await callSeed("seed");
    setSeeding(false);
    return ok;
  }, [venue, callSeed]);

  const resetAllDemoData = useCallback(async () => {
    if (!venue) return false;
    setSeeding(true);
    const ok = await callSeed("reset");
    setSeeding(false);
    return ok;
  }, [venue, callSeed]);

  const start = useCallback(async () => {
    enableDemoMode();
    setSeeding(true);
    const seeded = await callSeed("seed");
    setSeeding(false);
    setIsRunning(true);
    setIsPaused(false);
    setCurrentStepIndex(0);
    runStep(0);
    if (seeded) {
      toast.success("Demo Venue is live", { description: "Guided tour started — cinematic sample data loaded." });
    } else {
      toast("Demo tour started", { description: "Seeding skipped or failed — tour will still play." });
    }
  }, [enableDemoMode, callSeed, runStep]);

  const next = useCallback(() => {
    setCurrentStepIndex((i) => {
      const n = Math.min(i + 1, DEMO_STEPS.length - 1);
      runStep(n);
      return n;
    });
  }, [runStep]);

  const prev = useCallback(() => {
    setCurrentStepIndex((i) => {
      const n = Math.max(i - 1, 0);
      runStep(n);
      return n;
    });
  }, [runStep]);

  const pause = useCallback(() => {
    setIsPaused(true);
    clearTimers();
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
    runStep(currentStepIndex);
  }, [currentStepIndex, runStep]);

  const exit = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    clearTimers();
  }, []);

  const restart = useCallback(() => {
    setCurrentStepIndex(0);
    setIsPaused(false);
    setIsRunning(true);
    runStep(0);
  }, [runStep]);

  // Legacy alias — only clears brain_events
  const resetDemoData = useCallback(async () => {
    if (!venue) return;
    const { error } = await supabase
      .from("brain_events")
      .delete()
      .eq("venue_id", venue.id)
      .contains("meta", { isDemoGenerated: true });
    insertedIds.current = [];
    if (error) toast.error("Reset failed", { description: error.message });
    else toast.success("Demo brain events cleared");
  }, [venue]);

  // Ambient heartbeat — while demo flag is on and tour is not running,
  // periodically insert a fresh brain event so the platform feels alive.
  useEffect(() => {
    if (heartbeat.current) {
      window.clearInterval(heartbeat.current);
      heartbeat.current = null;
    }
    if (!isEligible || !venue || isRunning) return;
    heartbeat.current = window.setInterval(async () => {
      const line = AMBIENT_LINES[Math.floor(Math.random() * AMBIENT_LINES.length)];
      await supabase.from("brain_events").insert({
        venue_id: venue.id,
        title: line.title,
        reason: line.reason,
        severity: line.severity as any,
        meta: { isDemoGenerated: true, ambient: true },
      });
    }, 35_000);
    return () => {
      if (heartbeat.current) window.clearInterval(heartbeat.current);
      heartbeat.current = null;
    };
  }, [isEligible, venue, isRunning]);

  useEffect(() => () => clearTimers(), []);

  return (
    <Ctx.Provider
      value={{
        isEligible,
        isRunning,
        isPaused,
        seeding,
        currentStepIndex,
        steps: DEMO_STEPS,
        start,
        pause,
        resume,
        next,
        prev,
        exit,
        restart,
        reseed,
        resetDemoData,
        resetAllDemoData,
        enableDemoMode,
        disableDemoMode,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
