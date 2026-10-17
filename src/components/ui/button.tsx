import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "elevated";

export type ButtonSize = "default" | "sm" | "lg" | "touch" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-primary text-primary-foreground shadow-sm hover:brightness-105 active:scale-[0.98] font-semibold",
  secondary:
    "bg-secondary text-secondary-foreground border border-border/50 hover:bg-secondary/80 active:scale-[0.98] font-semibold",
  outline:
    "border border-border/80 bg-transparent text-foreground hover:bg-secondary/60 hover:border-border active:scale-[0.98] font-medium",
  ghost:
    "bg-transparent text-foreground hover:bg-secondary/60 hover:text-foreground active:scale-[0.98] font-medium",
  destructive:
    "bg-destructive text-destructive-foreground shadow-sm hover:brightness-110 active:scale-[0.98] font-semibold",
  elevated:
    "bg-card text-foreground border border-border/70 shadow-m3-1 hover:shadow-m3-2 hover:border-primary/40 active:scale-[0.98] font-semibold",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "min-h-12 px-4 py-2.5 text-sm",
  sm: "min-h-9 px-3 py-1.5 text-xs",
  lg: "min-h-12 px-6 py-3 text-base",
  touch: "min-h-14 px-6 py-3.5 text-base font-bold tracking-wide",
  icon: "min-h-12 min-w-12 p-2.5",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-150 select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

