import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Phone, CalendarDays, BookOpen, Bot, BarChart3,
  Settings, Sparkles, MessagesSquare, LogOut, Plug, Brain, Mic, Map, Workflow, ChevronDown, Radio
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/app", label: "Overview", icon: LayoutDashboard },
  { to: "/app/live", label: "Venue Live", icon: Radio },
  { to: "/app/voice", label: "Live Voice", icon: Mic },
  { to: "/app/brain", label: "Live Brain", icon: Brain },
  { to: "/app/flow", label: "Flow Studio", icon: Workflow },
  { to: "/app/diary", label: "Diary", icon: CalendarDays },
  { to: "/app/floor", label: "Floor Plan", icon: Map },
  { to: "/app/calls", label: "Calls", icon: Phone },
  { to: "/app/agents", label: "Agents", icon: Bot },
  { to: "/app/knowledge", label: "Knowledge", icon: BookOpen },
  { to: "/app/messages", label: "Messages", icon: MessagesSquare },
  { to: "/app/insights", label: "Insights", icon: Sparkles },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/app/integrations", label: "Integrations", icon: Plug },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const loc = useLocation();
  const nav2 = useNavigate();
  const { user, venue, venues, setActiveVenue, signOut } = useAuth();

  return (
    <aside className="w-[260px] shrink-0 h-screen sticky top-0 z-20 flex flex-col
      bg-[hsl(28_22%_3.5%/0.85)] backdrop-blur-2xl
      border-r border-white/[0.04]
      shadow-[1px_0_0_0_hsl(36_100%_80%_/_0.03)_inset,_8px_0_40px_-12px_hsl(0_0%_0%_/_0.6)]">
      {/* Soft amber bloom at top */}
      <div className="absolute top-0 left-0 right-0 h-48 pointer-events-none opacity-50"
        style={{ background: "radial-gradient(circle at 30% 0%, hsl(32 96% 58% / 0.18), transparent 70%)" }} />

      <div className="relative p-5 border-b border-white/[0.04]">
        <Link to="/app" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-primary/40 blur-lg group-hover:blur-xl transition-all" />
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-primary via-primary to-primary-deep grid place-items-center
              shadow-[0_8px_24px_-4px_hsl(var(--primary)/0.6),0_1px_0_hsl(36_100%_90%_/_0.3)_inset]
              border border-primary/40">
              <Brain className="h-5 w-5 text-primary-foreground" strokeWidth={2.4} />
            </div>
          </div>
          <div>
            <div className="font-semibold tracking-tight text-[15px]">Aijentik</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">Hospitality OS</div>
          </div>
        </Link>
      </div>

      {venue && (
        <div className="relative px-4 py-3.5 border-b border-white/[0.04]">
          <div className="label-micro mb-2 flex items-center gap-2">
            <span className="pulse-amber !h-1.5 !w-1.5" /> Active Venue
          </div>
          <div className="relative">
            <select
              value={venue.id}
              onChange={(e) => setActiveVenue(e.target.value)}
              className="w-full appearance-none cursor-pointer
                bg-gradient-to-b from-secondary/60 to-secondary/30
                border border-white/[0.06] rounded-xl px-3 py-2.5 pr-8 text-sm font-medium
                shadow-[0_4px_12px_-4px_hsl(0_0%_0%_/_0.4),0_1px_0_hsl(36_100%_90%_/_0.04)_inset]
                hover:border-primary/30 transition-colors
                focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          </div>
          <div className="flex items-center gap-1.5 mt-2.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="pulse-dot !h-1.5 !w-1.5" /> All agents online
          </div>
        </div>
      )}

      <nav className="relative flex-1 overflow-y-auto p-3 space-y-0.5">
        {nav.map(({ to, label, icon: Icon }) => {
          const active = loc.pathname === to || (to !== "/app" && loc.pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-200 group",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.025]"
              )}
            >
              {active && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute inset-0 rounded-xl liquid-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-r-full bg-gradient-to-b from-primary-glow to-primary shadow-[0_0_12px_hsl(var(--primary)/0.8)]" />
              )}
              <Icon className={cn(
                "relative h-[17px] w-[17px] transition-transform duration-300",
                active ? "drop-shadow-[0_0_8px_hsl(var(--primary)/0.7)]" : "group-hover:scale-110"
              )} strokeWidth={active ? 2.2 : 1.8} />
              <span className="relative">{label}</span>
              {active && (
                <span className="relative ml-auto h-1 w-1 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="relative p-3 border-t border-white/[0.04]">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/[0.025] transition-colors">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/30 blur-md" />
            <div className="relative h-9 w-9 rounded-full bg-gradient-to-br from-accent via-primary to-primary-deep grid place-items-center text-xs font-semibold text-primary-foreground border border-white/10">
              {user?.email?.[0]?.toUpperCase()}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium truncate">{user?.email}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Owner</div>
          </div>
          <button
            onClick={async () => { await signOut(); nav2("/auth"); }}
            className="p-1.5 rounded-md hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
