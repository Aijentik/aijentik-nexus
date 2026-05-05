import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Brain, Mic, Sparkles, ArrowRight, Phone, Calendar, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />

      {/* nav */}
      <nav className="relative z-10 flex items-center justify-between p-6 md:px-10 max-w-7xl mx-auto">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_0_20px_hsl(var(--primary)/0.6)]">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-semibold tracking-tight">Aijentik</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Hospitality OS</div>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
          <Link to="/auth"><Button className="bg-primary text-primary-foreground hover:opacity-90">Get started</Button></Link>
        </div>
      </nav>

      {/* hero */}
      <section className="relative max-w-7xl mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-32">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-muted-foreground mb-8">
            <span className="pulse-dot" /> Live voice agents · Real-time diary · Live Brain
          </div>
          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
            The voice operating layer<br />that <span className="gradient-text">runs your venue</span>.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mt-6 max-w-2xl">
            Forward your phone. Watch AI build your entire operation in 60 seconds. Every call answered. Every booking captured. Every decision narrated in real time.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-10">
            <Link to="/auth"><Button size="lg" className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-[0_0_30px_hsl(var(--primary)/0.5)] hover:opacity-90">
              Build my venue <ArrowRight className="ml-2 h-4 w-4" />
            </Button></Link>
            <Link to="/auth"><Button size="lg" variant="outline" className="border-white/10 hover:bg-secondary/60">Try the demo</Button></Link>
          </div>
        </motion.div>

        {/* preview card */}
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="mt-20 glass-strong rounded-3xl p-6 md:p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 pointer-events-none" />
          <div className="relative grid md:grid-cols-3 gap-6">
            {[
              { icon: Mic, title: "Live Voice", desc: "Sub-second voice agent answers calls 24/7 with your brand voice." },
              { icon: Brain, title: "Live Brain", desc: "Watch every decision narrated in real time as your operation runs." },
              { icon: Calendar, title: "Auto Diary", desc: "Bookings land instantly. Conflicts resolved. VIPs recognized." },
            ].map(({ icon: I, title, desc }) => (
              <div key={title} className="glass rounded-2xl p-5">
                <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center mb-3"><I className="h-5 w-5 text-primary" /></div>
                <div className="font-medium">{title}</div>
                <div className="text-sm text-muted-foreground mt-1">{desc}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* features */}
      <section className="relative max-w-7xl mx-auto px-6 md:px-10 py-20">
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight max-w-2xl">Built for venues that move fast.</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
          {[
            { icon: Phone, t: "Forward your number", d: "We answer calls in your voice within 800ms." },
            { icon: Sparkles, t: "Self-building", d: "Scrapes your menu, hours, FAQs, and policies." },
            { icon: Zap, t: "Diary that thinks", d: "Detects conflicts, suggests slots, flags VIPs." },
            { icon: Shield, t: "Owner-grade RBAC", d: "Owner, manager, staff, viewer — RLS enforced." },
          ].map(({ icon: I, t, d }) => (
            <div key={t} className="glass rounded-2xl p-5 hover:border-primary/30 transition-colors">
              <I className="h-5 w-5 text-primary mb-3" />
              <div className="font-medium">{t}</div>
              <div className="text-sm text-muted-foreground mt-1">{d}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/5 py-10 text-center text-xs text-muted-foreground">
        © Aijentik Hospitality · The operating layer that runs your venue.
      </footer>
    </div>
  );
}
