import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";

export type ButtonSize = "default" | "sm" | "lg" | "touch";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.99]",
  secondary:
    "bg-secondary text-secondary-foreground hover:opacity-90 active:scale-[0.99]",
  outline:
    "border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
  ghost: "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
  destructive:
    "bg-destructive text-destructive-foreground hover:opacity-90 active:scale-[0.99]",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "min-h-11 px-4 py-2 text-sm",
  sm: "min-h-9 px-3 py-1.5 text-xs",
  lg: "min-h-12 px-6 py-3 text-base",
  touch: "min-h-14 px-6 py-3.5 text-base font-semibold tracking-wide",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-all select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
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
