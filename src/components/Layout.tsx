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
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="p-6 md:p-8 max-w-[1400px]">
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
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
