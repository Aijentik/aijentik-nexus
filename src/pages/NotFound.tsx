import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Brain, ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.warn("404:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-6">
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full bg-primary/10 blur-[140px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
        className="relative z-10 max-w-xl w-full text-center"
      >
        <div className="mx-auto mb-8 relative h-20 w-20">
          <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-2xl animate-aura" />
          <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_0_40px_hsl(var(--primary)/0.6)]">
            <Brain className="h-9 w-9 text-primary-foreground" />
          </div>
        </div>

        <div className="label-micro mb-3">Error · 404</div>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
          This room isn't <span className="gradient-text">on the floor plan</span>.
        </h1>
        <p className="text-muted-foreground mt-5 text-[15px] max-w-md mx-auto">
          The page you tried to open doesn't exist — or has been moved. Your operation is still running in the background.
        </p>

        <div className="flex items-center justify-center gap-3 mt-9">
          <Link to="/">
            <Button variant="outline" className="border-white/10 hover:bg-secondary/60 press-tactile">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back home
            </Button>
          </Link>
          <Link to="/app">
            <Button className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 shadow-[0_0_24px_hsl(var(--primary)/0.45)] press-tactile">
              <Compass className="h-4 w-4 mr-2" /> Open dashboard
            </Button>
          </Link>
        </div>

        <div className="mt-10 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          {location.pathname}
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
