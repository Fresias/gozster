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
    "bg-primary text-primary-foreground font-medium hover:brightness-105 active:scale-[0.98]",
  secondary:
    "h-9 px-3 rounded-lg border bg-background text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98] font-medium",
  outline:
    "h-9 px-3 rounded-lg border bg-background text-foreground hover:bg-muted/60 hover:border-border active:scale-[0.98] font-medium",
  ghost:
    "bg-transparent text-foreground hover:bg-muted/60 hover:text-foreground active:scale-[0.98] font-medium",
  destructive:
    "bg-destructive text-destructive-foreground font-medium hover:brightness-110 active:scale-[0.98]",
  elevated:
    "bg-card text-foreground border border-border shadow-none hover:bg-muted/60 active:scale-[0.98] font-medium",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-3.5 rounded-lg text-sm",
  sm: "h-8 px-3 rounded-lg text-xs",
  lg: "h-10 px-5 rounded-lg text-sm",
  touch: "min-h-14 px-6 py-3.5 rounded-xl text-base font-bold tracking-wide",
  icon: "size-9 h-9 w-9 rounded-lg p-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
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

