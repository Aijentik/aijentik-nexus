import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Phone, CalendarDays, BookOpen, Bot, BarChart3,
  Settings, Sparkles, MessagesSquare, LogOut, Plug, Brain, Mic, Map, Workflow
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/app", label: "Overview", icon: LayoutDashboard },
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
    <aside className="w-64 shrink-0 h-screen sticky top-0 glass-strong border-r border-white/5 flex flex-col">
      <div className="p-5 border-b border-white/5">
        <Link to="/app" className="flex items-center gap-2.5">
          <div className="relative">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_0_20px_hsl(var(--primary)/0.6)]">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <div>
            <div className="font-semibold tracking-tight">Aijentik</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Hospitality OS</div>
          </div>
        </Link>
      </div>

      {venue && (
        <div className="px-4 py-3 border-b border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Venue</div>
          <select
            value={venue.id}
            onChange={(e) => setActiveVenue(e.target.value)}
            className="w-full bg-secondary/60 border border-white/5 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/60"
          >
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
            <span className="pulse-dot" /> Live · agents online
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {nav.map(({ to, label, icon: Icon }) => {
          const active = loc.pathname === to || (to !== "/app" && loc.pathname.startsWith(to));
          return (
            <Link key={to} to={to} className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative group",
              active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}>
              {active && <motion.div layoutId="active-pill" className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-r-full" />}
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/5">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent to-primary grid place-items-center text-xs font-semibold text-primary-foreground">
            {user?.email?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{user?.email}</div>
            <div className="text-[10px] text-muted-foreground">Owner</div>
          </div>
          <button onClick={async () => { await signOut(); nav2("/auth"); }} className="p-1.5 rounded-md hover:bg-secondary/50 text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
