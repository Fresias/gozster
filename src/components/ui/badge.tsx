import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "neutral"
  | "success"
  | "warning"
  | "destructive"
  | "danger"
  | "info"
  | "purple";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-neutral-soft-border bg-neutral-soft text-neutral-soft-foreground font-medium",
  secondary: "border-neutral-soft-border bg-neutral-soft text-neutral-soft-foreground font-medium",
  neutral: "border-neutral-soft-border bg-neutral-soft text-neutral-soft-foreground font-medium",
  outline: "border-border bg-transparent text-foreground font-medium",
  success: "border-success-soft-border bg-success-soft text-success-soft-foreground font-medium",
  warning: "border-warning-soft-border bg-warning-soft text-warning-soft-foreground font-medium",
  destructive: "border-danger-soft-border bg-danger-soft text-danger-soft-foreground font-medium",
  danger: "border-danger-soft-border bg-danger-soft text-danger-soft-foreground font-medium",
  info: "border-neutral-soft-border bg-neutral-soft text-neutral-soft-foreground font-medium",
  purple: "border-neutral-soft-border bg-neutral-soft text-neutral-soft-foreground font-medium",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium select-none transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

