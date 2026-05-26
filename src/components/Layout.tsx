import { ReactNode } from "react";
import { Navigate, Outlet, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "./Sidebar";
import { FloatingBrain } from "./FloatingBrain";
import { StaffCopilot } from "./StaffCopilot";
import { AICommandCenter } from "./AICommandCenter";
import { DemoModeBanner } from "./demo/DemoModeBanner";
import { VenueClock } from "./VenueClock";
import { motion } from "framer-motion";
import { Menu, Brain } from "lucide-react";

function SignInLoader({ label = "Signing you in" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-20" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[520px] w-[520px] rounded-full bg-primary/20 blur-[120px] animate-pulse" />
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
        className="relative text-center"
      >
        <div className="relative mx-auto mb-6 h-20 w-20">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary to-accent shadow-[0_0_60px_hsl(var(--primary)/0.6)]" />
          <div className="absolute inset-0 rounded-3xl border border-primary/40 animate-ping" />
          <div className="absolute inset-0 grid place-items-center">
            <Brain className="h-10 w-10 text-primary-foreground" />
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-[0.32em] text-primary mb-2">Aijentik</div>
        <div className="text-xl font-semibold tracking-tight">{label}</div>
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export function ProtectedLayout() {
  const { user, loading, venue, venuesLoaded } = useAuth();
  if (loading) return <SignInLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!venuesLoaded) return <SignInLoader label="Waking up your venue" />;
  if (!venue) return <Navigate to="/onboarding" replace />;
  return (
    <div className="flex min-h-screen relative">
      {/* Cinematic ambient room — soft drifting amber light behind everything */}
      <div className="ambient-room" aria-hidden />
      <Sidebar />
      <main className="flex-1 min-w-0 relative z-10">
        {/* Mobile top bar — only visible <lg */}
        <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14
          bg-[hsl(28_22%_3.5%/0.92)] backdrop-blur-xl border-b border-white/[0.05]">
          <button
            onClick={() => window.dispatchEvent(new Event("aijentik:sidebar-toggle"))}
            className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/app" className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-primary-deep grid place-items-center shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.6)]">
              <Brain className="h-4 w-4 text-primary-foreground" strokeWidth={2.4} />
            </div>
            <span className="font-semibold tracking-tight text-[14px] truncate">Aijentik</span>
          </Link>
          <div className="ml-auto"><VenueClock venueName={venue?.name} /></div>
        </div>

        <DemoModeBanner />
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
          className="px-4 py-6 sm:px-6 md:px-8 md:py-8 lg:p-10 max-w-[1440px] mx-auto"
        >
          <Outlet />
        </motion.div>
      </main>
      <FloatingBrain />
      <StaffCopilot />
      <AICommandCenter />
    </div>

  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const { venue } = useAuth();
  return (
    <div className="mb-7 md:mb-8 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="pulse-amber shrink-0" />
          <span className="label-micro truncate">Aijentik · Live</span>
        </div>
        {/* Clock hidden on mobile (shown in top bar instead) */}
        <div className="hidden lg:block">
          <VenueClock venueName={venue?.name} />
        </div>
      </div>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <h1 className="text-[28px] sm:text-3xl md:text-[42px] font-semibold tracking-tight leading-[1.05]">{title}</h1>
          {subtitle && <p className="text-[14px] md:text-[15px] text-muted-foreground max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
