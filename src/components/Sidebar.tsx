import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Phone, CalendarDays, BookOpen, Bot, BarChart3,
  Settings, Sparkles, MessagesSquare, LogOut, Plug, Brain, Mic, Map, Workflow,
  ChevronDown, Radio, PanelLeftClose, PanelLeft, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: any; hero?: boolean; live?: boolean };

const SECTIONS: { id: string; title: string; items: Item[] }[] = [
  {
    id: "primary",
    title: "Primary AI Operating Layer",
    items: [
      { to: "/app", label: "Overview", icon: LayoutDashboard },
      { to: "/app/live", label: "Venue Live", icon: Radio, hero: true, live: true },
      { to: "/app/voice", label: "Live Voice", icon: Mic, hero: true },
      { to: "/app/brain", label: "Live Brain", icon: Brain, hero: true },
      { to: "/app/flow", label: "Flow Studio", icon: Workflow },
    ],
  },
  {
    id: "ops",
    title: "Operations",
    items: [
      { to: "/app/diary", label: "Diary", icon: CalendarDays },
      { to: "/app/floor", label: "Floor Plan", icon: Map },
      { to: "/app/calls", label: "Calls", icon: Phone },
      { to: "/app/messages", label: "Messages", icon: MessagesSquare },
    ],
  },
  {
    id: "ai",
    title: "AI Workforce",
    items: [
      { to: "/app/agents", label: "Agents", icon: Bot },
      { to: "/app/knowledge", label: "Knowledge", icon: BookOpen },
      { to: "/app/insights", label: "Insights", icon: Sparkles },
    ],
  },
  {
    id: "biz",
    title: "Business + Systems",
    items: [
      { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/app/integrations", label: "Integrations", icon: Plug },
      { to: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
];

const COLLAPSE_KEY = "aijentik:sidebarCollapsed";

export function Sidebar() {
  const loc = useLocation();
  const nav2 = useNavigate();
  const { user, venue, venues, setActiveVenue, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);

  const isActive = (to: string) =>
    loc.pathname === to || (to !== "/app" && loc.pathname.startsWith(to));

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 76 : 260 }}
      transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
      className="shrink-0 h-screen sticky top-0 z-20 flex flex-col relative
        bg-[hsl(28_22%_3.5%/0.88)] backdrop-blur-2xl
        border-r border-white/[0.04]
        shadow-[1px_0_0_0_hsl(36_100%_80%_/_0.03)_inset,_8px_0_40px_-12px_hsl(0_0%_0%_/_0.6)]"
    >
      {/* Ambient lighting layers */}
      <div
        className="absolute top-0 left-0 right-0 h-56 pointer-events-none opacity-60"
        style={{ background: "radial-gradient(circle at 30% 0%, hsl(32 96% 58% / 0.18), transparent 70%)" }}
      />
      <motion.div
        aria-hidden
        className="absolute -bottom-20 -left-10 right-0 h-72 pointer-events-none opacity-40 blur-3xl"
        animate={{ opacity: [0.25, 0.45, 0.25] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: "radial-gradient(60% 60% at 50% 50%, hsl(22 88% 52% / 0.22), transparent 70%)" }}
      />
      <div className="absolute inset-y-0 right-0 w-px pointer-events-none
        bg-gradient-to-b from-transparent via-primary/15 to-transparent" />

      {/* Brand + collapse */}
      <div className="relative px-4 pt-5 pb-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <Link to="/app" className="flex items-center gap-3 group min-w-0">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-xl bg-primary/40 blur-lg group-hover:blur-xl transition-all" />
              <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-primary via-primary to-primary-deep grid place-items-center
                shadow-[0_8px_24px_-4px_hsl(var(--primary)/0.6),0_1px_0_hsl(36_100%_90%_/_0.3)_inset]
                border border-primary/40">
                <Brain className="h-5 w-5 text-primary-foreground" strokeWidth={2.4} />
              </div>
            </div>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.2 }}
                  className="min-w-0"
                >
                  <div className="font-semibold tracking-tight text-[15px] truncate">Aijentik</div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80 truncate">
                    Hospitality OS
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Link>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="ml-auto h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Venue selector */}
      {venue && !collapsed && (
        <div className="relative px-4 py-3.5 border-b border-white/[0.04]">
          <div className="label-micro mb-2 flex items-center gap-2">
            <span className="pulse-amber !h-1.5 !w-1.5" /> Active Venue
          </div>
          <div className="relative group">
            <div className="absolute -inset-px rounded-xl bg-gradient-to-b from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none blur-sm" />
            <select
              value={venue.id}
              onChange={(e) => setActiveVenue(e.target.value)}
              className="relative w-full appearance-none cursor-pointer
                bg-gradient-to-b from-secondary/70 to-secondary/30
                border border-white/[0.06] rounded-xl px-3 py-2.5 pr-8 text-sm font-medium
                shadow-[0_4px_12px_-4px_hsl(0_0%_0%_/_0.45),0_1px_0_hsl(36_100%_90%_/_0.05)_inset]
                hover:border-primary/30 transition-colors
                focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none transition-transform group-hover:translate-y-[-40%]" />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="relative flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin">
        {SECTIONS.map((section) => (
          <div key={section.id}>
            {!collapsed && (
              <div className="px-3 mb-1.5 text-[9.5px] uppercase tracking-[0.24em] text-muted-foreground/55 font-medium">
                {section.title}
              </div>
            )}
            {collapsed && (
              <div className="mx-3 mb-1.5 h-px bg-white/[0.05]" />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.to);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-xl text-[13.5px] font-medium transition-all duration-300 group",
                      collapsed ? "px-2.5 py-2.5 justify-center" : "px-3",
                      item.hero ? "py-[11px]" : "py-2.5",
                      active
                        ? "text-primary"
                        : "text-muted-foreground/85 hover:text-foreground hover:bg-white/[0.025]"
                    )}
                  >
                    {/* Hero ambient glow */}
                    {item.hero && !active && (
                      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                        style={{ background: "linear-gradient(90deg, hsl(32 96% 58% / 0.06), transparent 60%)" }} />
                    )}

                    {/* Active capsule */}
                    {active && (
                      <motion.div
                        layoutId="active-pill"
                        className="absolute inset-0 rounded-xl"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        style={{
                          background:
                            "linear-gradient(180deg, hsl(32 96% 58% / 0.16), hsl(22 88% 52% / 0.08))",
                          boxShadow:
                            "inset 0 1px 0 hsl(36 100% 90% / 0.08), 0 8px 24px -10px hsl(var(--primary)/0.55)",
                          border: "1px solid hsl(var(--primary)/0.28)",
                        }}
                      />
                    )}
                    {active && (
                      <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full bg-gradient-to-b from-primary-glow to-primary shadow-[0_0_10px_hsl(var(--primary)/0.8)]" />
                    )}

                    <span className="relative shrink-0">
                      <Icon
                        className={cn(
                          "transition-all duration-300",
                          item.hero ? "h-[18px] w-[18px]" : "h-[16.5px] w-[16.5px]",
                          active
                            ? "drop-shadow-[0_0_10px_hsl(var(--primary)/0.7)]"
                            : "opacity-80 group-hover:opacity-100 group-hover:scale-105"
                        )}
                        strokeWidth={active ? 2.2 : 1.8}
                      />
                      {/* Live pulse for Venue Live */}
                      {item.live && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                        </span>
                      )}
                    </span>

                    {!collapsed && (
                      <>
                        <span className="relative truncate">{item.label}</span>
                        {item.live && (
                          <span className="relative ml-auto px-1.5 py-[1px] rounded-full text-[8.5px] uppercase tracking-[0.18em] font-semibold
                            text-primary bg-primary/10 border border-primary/25">
                            Live
                          </span>
                        )}
                        {active && !item.live && (
                          <span className="relative ml-auto h-1 w-1 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* System status — only when expanded */}
        {!collapsed && (
          <div className="pt-2">
            <div className="px-3 mb-1.5 text-[9.5px] uppercase tracking-[0.24em] text-muted-foreground/55 font-medium">
              System Status
            </div>
            <div className="relative mx-1 rounded-xl p-3 overflow-hidden
              bg-gradient-to-b from-white/[0.03] to-transparent
              border border-white/[0.05]
              shadow-[inset_0_1px_0_hsl(36_100%_90%_/_0.04)]">
              <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-3xl opacity-40 pointer-events-none"
                style={{ background: "hsl(142 70% 45% / 0.4)" }} />
              <div className="relative flex items-center gap-2 mb-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400 shadow-[0_0_8px_hsl(142_70%_45%)]" />
                </span>
                <span className="text-[11.5px] font-medium text-foreground/90">AI Workforce Healthy</span>
              </div>
              <div className="relative space-y-1 text-[10.5px] text-muted-foreground/80">
                <div className="flex items-center justify-between">
                  <span>Agents active</span>
                  <span className="tabular-nums text-foreground/85">4</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Escalations</span>
                  <span className="tabular-nums text-foreground/85">0</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Profile */}
      <div className="relative p-3 border-t border-white/[0.04]">
        <div className={cn(
          "flex items-center gap-2.5 rounded-xl transition-colors",
          collapsed ? "p-1 justify-center" : "px-2.5 py-2 hover:bg-white/[0.03]"
        )}>
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-full bg-primary/30 blur-md" />
            <div className="relative h-9 w-9 rounded-full bg-gradient-to-br from-accent via-primary to-primary-deep grid place-items-center text-xs font-semibold text-primary-foreground border border-white/10
              shadow-[0_6px_18px_-6px_hsl(var(--primary)/0.6)]">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-background shadow-[0_0_8px_hsl(142_70%_45%)]" />
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium truncate flex items-center gap-1.5">
                  {user?.email}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="h-2.5 w-2.5" /> Owner · Live
                </div>
              </div>
              <button
                onClick={async () => { await signOut(); nav2("/auth"); }}
                className="p-1.5 rounded-md hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
