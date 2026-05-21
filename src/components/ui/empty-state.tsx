import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Premium dark-luxury empty state used across the app.
 * Renders with a glowing amber orb, cinematic copy, and an optional CTA.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div className={cn("empty-cine", className)}>
      <div className="empty-orb">
        <Icon className="h-6 w-6 text-primary-foreground drop-shadow-[0_0_8px_hsl(var(--primary)/0.7)]" />
      </div>
      <div className="text-[15px] font-medium tracking-tight">{title}</div>
      {description && (
        <div className="text-[13px] text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">
          {description}
        </div>
      )}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Quick skeleton block matching the cinematic theme. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("skeleton-cine", className)} />;
}
