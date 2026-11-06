import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusBadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "neutral"
  | "purple";

export type StatusBadgeSize = "sm" | "md" | "lg";

export interface StatusBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /**
   * Contenido del badge. Obligatorio por contrato estricto de UI / A11y.
   */
  children: React.ReactNode;
  variant?: StatusBadgeVariant;
  size?: StatusBadgeSize;
  dot?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<StatusBadgeVariant, string> = {
  default:
    "border-border/70 bg-secondary/70 text-secondary-foreground font-medium",
  neutral:
    "border-border/60 bg-muted/60 text-muted-foreground font-medium",
  success:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-950/40 font-semibold",
  warning:
    "border-amber-500/35 bg-amber-500/15 text-amber-800 dark:text-amber-300 dark:bg-amber-950/40 font-semibold",
  destructive:
    "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 dark:bg-rose-950/40 font-semibold",
  info:
    "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 dark:bg-sky-950/40 font-semibold",
  purple:
    "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 dark:bg-purple-950/40 font-semibold",
};

const dotClasses: Record<StatusBadgeVariant, string> = {
  default: "bg-primary",
  neutral: "bg-muted-foreground",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  destructive: "bg-rose-500",
  info: "bg-sky-500",
  purple: "bg-purple-500",
};

const sizeClasses: Record<StatusBadgeSize, string> = {
  sm: "text-[11px] px-2 py-0.5 gap-1",
  md: "text-xs px-2.5 py-0.5 gap-1.5",
  lg: "text-sm px-3 py-1 gap-2",
};

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  (
    {
      children,
      variant = "default",
      size = "md",
      dot = false,
      icon,
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full border leading-tight select-none tracking-normal transition-colors",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {dot && (
          <span
            className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClasses[variant])}
            aria-hidden="true"
          />
        )}
        {icon && <span className="shrink-0">{icon}</span>}
        <span>{children}</span>
      </span>
    );
  },
);

StatusBadge.displayName = "StatusBadge";
