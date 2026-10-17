import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "purple";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary text-primary-foreground font-bold shadow-sm",
  secondary: "border-border/60 bg-secondary/80 text-secondary-foreground font-semibold",
  outline: "border-border/80 bg-transparent text-foreground font-semibold",
  success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-400 font-bold",
  warning: "border-amber-500/40 bg-amber-500/15 text-amber-300 font-bold",
  destructive: "border-rose-500/40 bg-rose-500/15 text-rose-300 font-bold",
  info: "border-sky-500/40 bg-sky-500/15 text-sky-300 font-bold",
  purple: "border-purple-500/40 bg-purple-500/15 text-purple-300 font-bold",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold select-none transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

