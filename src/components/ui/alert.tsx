import * as React from "react";
import { cn } from "@/lib/utils";

export type AlertVariant = "default" | "destructive" | "warning" | "success" | "info";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  icon?: React.ReactNode;
}

const alertVariants: Record<AlertVariant, string> = {
  default: "bg-card text-card-foreground border-border/80",
  destructive:
    "border-rose-500/35 bg-rose-500/10 text-rose-800 dark:text-rose-200 [&>svg]:text-rose-600 dark:[&>svg]:text-rose-400",
  warning:
    "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400",
  success:
    "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400",
  info:
    "border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200 [&>svg]:text-sky-600 dark:[&>svg]:text-sky-400",
};

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", icon, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          "relative w-full rounded-xl border p-4 text-sm [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
          alertVariants[variant],
          className,
        )}
        {...props}
      >
        {icon}
        {children}
      </div>
    );
  },
);

Alert.displayName = "Alert";

export const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));

AlertTitle.displayName = "AlertTitle";

export const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xs leading-relaxed text-muted-foreground", className)}
    {...props}
  />
));

AlertDescription.displayName = "AlertDescription";
