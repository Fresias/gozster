import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusBadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "danger"
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
    "border-neutral-soft-border bg-neutral-soft text-neutral-soft-foreground font-medium",
  neutral:
    "border-neutral-soft-border bg-neutral-soft text-neutral-soft-foreground font-medium",
  success:
    "border-success-soft-border bg-success-soft text-success-soft-foreground font-medium",
  warning:
    "border-warning-soft-border bg-warning-soft text-warning-soft-foreground font-medium",
  destructive:
    "border-danger-soft-border bg-danger-soft text-danger-soft-foreground font-medium",
  danger:
    "border-danger-soft-border bg-danger-soft text-danger-soft-foreground font-medium",
  info:
    "border-neutral-soft-border bg-neutral-soft text-neutral-soft-foreground font-medium",
  purple:
    "border-neutral-soft-border bg-neutral-soft text-neutral-soft-foreground font-medium",
};

const sizeClasses: Record<StatusBadgeSize, string> = {
  sm: "text-xs px-2 py-0.5 gap-1",
  md: "text-xs px-2 py-0.5 gap-1",
  lg: "text-xs px-2.5 py-0.5 gap-1.5",
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
          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium leading-tight select-none tracking-normal transition-colors",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {dot && <span className="sr-only" aria-hidden="true" />}
        {icon && (
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
        <span>{children}</span>
      </span>
    );
  },
);

StatusBadge.displayName = "StatusBadge";
