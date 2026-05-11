import { AnimatePresence, motion } from "framer-motion";
import { useDemoTour } from "@/lib/demo/DemoTourProvider";
import { Button } from "@/components/ui/button";
import { Pause, Play, SkipForward, X, RotateCcw, Sparkles, ChevronLeft } from "lucide-react";

export function DemoController() {
  const { isRunning, isPaused, currentStepIndex, steps, pause, resume, next, prev, exit, restart, resetDemoData } =
    useDemoTour();

  const step = steps[currentStepIndex];
  const progress = ((currentStepIndex + 1) / steps.length) * 100;
  const isFinal = currentStepIndex === steps.length - 1;

  return (
    <AnimatePresence>
      {isRunning && (
        <>
          {/* Spotlight backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 0%, transparent 35%, hsl(var(--background) / 0.55) 100%)",
            }}
          />

          {/* Step popup — top right */}
          <motion.div
            key={step?.id}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
            className="fixed top-24 right-6 z-[70] w-[380px] max-w-[calc(100vw-2rem)]"
          >
            <div className="relative rounded-2xl overflow-hidden border border-primary/30 bg-background/85 backdrop-blur-xl
              shadow-[0_30px_80px_-20px_hsl(var(--primary)/0.45),0_1px_0_hsl(36_100%_90%_/_0.15)_inset]">
              {/* Amber edge glow */}
              <div className="absolute -inset-px rounded-2xl pointer-events-none"
                style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.35), transparent 40%, hsl(var(--accent)/0.25))" }} />
              <div className="relative p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.18em] bg-primary/15 text-primary border border-primary/30">
                    <Sparkles className="h-3 w-3" /> Demo simulation
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums ml-auto">
                    {currentStepIndex + 1} / {steps.length}
                  </div>
                </div>

                <h3 className="text-base font-semibold leading-snug mb-1.5">{step?.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step?.description}</p>

                {/* progress */}
                <div className="mt-4 h-[3px] rounded-full bg-foreground/5 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-primary to-accent"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
                  />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={prev} disabled={currentStepIndex === 0} className="h-8 px-2">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={isPaused ? resume : pause}
                    className="h-8 px-2"
                    title={isPaused ? "Resume" : "Pause"}
                  >
                    {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>

                  {isFinal ? (
                    <>
                      <Button size="sm" variant="outline" onClick={restart} className="h-8 ml-auto">
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Replay
                      </Button>
                      <Button size="sm" variant="ghost" onClick={resetDemoData} className="h-8" title="Reset demo data">
                        Clear
                      </Button>
                      <Button size="sm" onClick={exit} className="h-8">
                        Done
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={next} className="h-8 ml-auto" title="Skip step">
                        <SkipForward className="h-3.5 w-3.5 mr-1.5" /> Skip
                      </Button>
                      <Button
                        size="sm"
                        onClick={next}
                        className="h-8 bg-gradient-to-r from-primary to-accent text-primary-foreground border-0
                          shadow-[0_8px_30px_-10px_hsl(var(--primary)/0.6)]"
                      >
                        Next
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={exit} className="h-8 px-2 -mr-1" title="Exit demo">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
