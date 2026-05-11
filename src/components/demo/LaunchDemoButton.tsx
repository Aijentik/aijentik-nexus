import { Button } from "@/components/ui/button";
import { useDemoTour } from "@/lib/demo/DemoTourProvider";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function LaunchDemoButton() {
  const { isEligible, isRunning, start } = useDemoTour();
  if (!isEligible || isRunning) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
      data-demo="launch-demo"
      className="relative"
    >
      <motion.div
        aria-hidden
        className="absolute -inset-2 rounded-2xl pointer-events-none"
        animate={{ opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(60% 60% at 50% 50%, hsl(var(--primary) / 0.35), transparent 70%)",
          filter: "blur(14px)",
        }}
      />
      <Button
        onClick={start}
        size="lg"
        variant="outline"
        className="relative h-11 px-5 border-primary/40 bg-background/60 backdrop-blur-md
          text-foreground hover:text-foreground hover:bg-background/80
          shadow-[0_10px_30px_-12px_hsl(var(--primary)/0.55),0_1px_0_hsl(36_100%_90%_/_0.18)_inset]
          transition-all duration-300 group"
      >
        <Sparkles className="h-4 w-4 mr-2 text-primary group-hover:rotate-12 transition-transform" />
        <span className="font-medium">Launch Full Demo</span>
        <span className="ml-2 hidden sm:inline text-[11px] tracking-wide text-muted-foreground">
          Guided product tour
        </span>
      </Button>
    </motion.div>
  );
}
