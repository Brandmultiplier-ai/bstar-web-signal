"use client";

import { cn } from "../lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** Lightweight badge — no shadcn/base-ui dependency. */
export function Badge({ children, className, style }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className
      )}
      style={style}
    >
      {children}
    </span>
  );
}
