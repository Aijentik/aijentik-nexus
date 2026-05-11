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
  currentStepIndex: number;
  steps: DemoStep[];
  start: () => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  exit: () => void;
  restart: () => void;
  resetDemoData: () => Promise<void>;
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

export function DemoTourProvider({ children }: { children: ReactNode }) {
  const { venue, user } = useAuth();
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const insertedIds = useRef<string[]>([]);
  const timers = useRef<number[]>([]);

  const isEligible = useMemo(() => isDemoEligible({ venue, user }), [venue, user]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const runStep = useCallback(
    async (idx: number) => {
      const step = DEMO_STEPS[idx];
      if (!step || !venue) return;
      clearTimers();
      try {
        navigate(step.route);
      } catch {}

      // Fire simulated brain events tagged as demo
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

  const start = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
    setCurrentStepIndex(0);
    runStep(0);
    toast.success("Demo simulation started", { description: "Guided product tour" });
  }, [runStep]);

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

  const resetDemoData = useCallback(async () => {
    if (!venue) return;
    // Delete all demo-tagged brain_events for this venue
    const { error } = await supabase
      .from("brain_events")
      .delete()
      .eq("venue_id", venue.id)
      .contains("meta", { isDemoGenerated: true });
    insertedIds.current = [];
    if (error) toast.error("Reset failed", { description: error.message });
    else toast.success("Demo data cleared");
  }, [venue]);

  useEffect(() => () => clearTimers(), []);

  return (
    <Ctx.Provider
      value={{
        isEligible,
        isRunning,
        isPaused,
        currentStepIndex,
        steps: DEMO_STEPS,
        start,
        pause,
        resume,
        next,
        prev,
        exit,
        restart,
        resetDemoData,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
