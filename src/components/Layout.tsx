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

export function ProtectedLayout() {
  const { user, loading, venue } = useAuth();
  if (loading) return <div className="h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
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
