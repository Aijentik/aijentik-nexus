import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, RefreshCw, Trash2, X, Play } from "lucide-react";
import { useDemoTour } from "@/lib/demo/DemoTourProvider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function DemoModeBanner() {
  const { isEligible, isRunning, start, reseed, resetAllDemoData, disableDemoMode, seeding } = useDemoTour();
  const [dismissed, setDismissed] = useState(false);

  if (!isEligible || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -40, opacity: 0 }}
        transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
        className="sticky top-0 z-40 w-full"
      >
        <div className="relative overflow-hidden border-b border-primary/25 bg-background/70 backdrop-blur-xl">
          <div
            aria-hidden
            className="absolute inset-0 opacity-60 pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, hsl(var(--primary)/0.18), transparent 35%, transparent 65%, hsl(var(--accent)/0.18))",
            }}
          />
          <div className="relative flex items-center gap-3 px-5 h-10 text-[12px]">
            <div className="flex items-center gap-2 text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
                <span className="relative h-2 w-2 rounded-full bg-primary" />
              </span>
              <Sparkles className="h-3.5 w-3.5" />
              <span className="uppercase tracking-[0.18em] font-medium">Demo Venue Mode</span>
            </div>
            <span className="text-muted-foreground hidden md:inline">
              Cinematic sample data · bookings, calls, AI decisions, insights — all simulated.
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              {!isRunning && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={start}
                  className="h-7 px-2.5 text-[11px] hover:bg-primary/10 hover:text-primary"
                >
                  <Play className="h-3 w-3 mr-1.5" /> Guided tour
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={seeding}
                onClick={async () => {
                  const ok = await reseed();
                  if (ok) toast.success("Demo data refreshed");
                }}
                className="h-7 px-2.5 text-[11px] hover:bg-primary/10 hover:text-primary"
              >
                <RefreshCw className={`h-3 w-3 mr-1.5 ${seeding ? "animate-spin" : ""}`} />
                Reseed
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const ok = await resetAllDemoData();
                  if (ok) toast.success("Demo data cleared");
                }}
                className="h-7 px-2.5 text-[11px] hover:bg-destructive/15 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1.5" /> Clear
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  disableDemoMode();
                  setDismissed(true);
                  toast("Demo mode off", { description: "You can re-enable from the dashboard." });
                }}
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                title="Exit demo mode"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
