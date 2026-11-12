import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "elevated";

export type ButtonSize = "default" | "sm" | "lg" | "quick" | "touch" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:brightness-105 active:scale-[0.98]",
  secondary: "border bg-background text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98]",
  outline: "border bg-background text-foreground hover:bg-muted/60 active:scale-[0.98]",
  ghost: "bg-transparent text-foreground hover:bg-muted/60 active:scale-[0.98]",
  destructive: "bg-destructive text-destructive-foreground hover:brightness-110 active:scale-[0.98]",
  elevated: "border border-border bg-card text-foreground shadow-none hover:bg-muted/60 active:scale-[0.98]",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-[var(--button-h)] px-3.5 text-sm",
  sm: "h-[var(--button-h-sm)] px-3 text-xs",
  lg: "h-[var(--button-h-lg)] px-5 text-sm",
  quick: "h-[var(--button-h-quick)] px-3 rounded-xl text-base font-bold",
  touch: "min-h-14 px-6 py-3.5 rounded-xl text-base font-bold tracking-wide",
  icon: "size-[var(--button-h)] p-0",
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

