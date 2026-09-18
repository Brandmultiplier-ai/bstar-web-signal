"use client";

import { cn } from "../lib/utils";
import { CardInfoButton } from "./CardInfoButton";

interface DashboardCardProps {
  title?: string;
  subtitle?: string;
  info?: string;
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  /** Gradient tile beside the title, as Vision UI does on titled panels. */
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Extra classes on the body wrapper, for centering chart-style content. */
  bodyClassName?: string;
}

/**
 * The card is a flex column with a `flex-1` body, so a card given `h-full` in a
 * bento row stretches to the row height and its content fills the space rather
 * than leaving a gap under short content.
 */
export function DashboardCard({
  title,
  subtitle,
  info,
  children,
  className,
  glow = false,
  icon: Icon,
  bodyClassName,
}: DashboardCardProps) {
  return (
    <div className={cn("nos-card relative flex flex-col", glow && "glow-accent", className)}>
      {(title || subtitle) && (
        <div className={cn("mb-4 flex shrink-0 items-start gap-3", info && "pr-8")}>
          {Icon && (
            <span
              className="vui-tile"
              style={{ background: "var(--vui-gradient-brand)", width: 38, height: 38 }}
            >
              <Icon size={16} strokeWidth={2} />
            </span>
          )}
          <div className="min-w-0">
            {title && <p className="text-base font-bold text-[var(--nos-text-primary)]">{title}</p>}
            {subtitle && (
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--nos-text-secondary)]">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      )}

      <div className={cn("flex-1", bodyClassName)}>{children}</div>

      {info && (
        <div className="absolute right-4 top-4 z-30 pointer-events-auto">
          <CardInfoButton description={info} />
        </div>
      )}
    </div>
  );
}
