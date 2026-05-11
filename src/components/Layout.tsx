import { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "./Sidebar";
import { FloatingBrain } from "./FloatingBrain";
import { StaffCopilot } from "./StaffCopilot";
import { motion } from "framer-motion";

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
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
          className="p-6 md:p-10 max-w-[1440px]"
        >
          <Outlet />
        </motion.div>
      </main>
      <FloatingBrain />
      <StaffCopilot />
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="pulse-amber" />
          <span className="label-micro">Aijentik · Live</span>
        </div>
        <h1 className="text-3xl md:text-[42px] font-semibold tracking-tight leading-[1.05]">{title}</h1>
        {subtitle && <p className="text-[15px] text-muted-foreground max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
