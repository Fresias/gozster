import * as React from "react";
import { cn } from "@/lib/utils";
import { Inbox } from "./icons";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  bordered?: boolean;
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      icon,
      title,
      description,
      action,
      bordered = true,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-2xl select-none",
          bordered && "border border-dashed border-border/80 bg-muted/20",
          className,
        )}
        {...props}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground border border-border/40 shadow-sm">
          {icon || <Inbox className="h-6 w-6" />}
        </div>
        <h3 className="text-base font-semibold text-foreground tracking-tight">{title}</h3>
        {description && (
          <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
        {action && <div className="mt-6 flex items-center justify-center">{action}</div>}
        {children && <div className="mt-4">{children}</div>}
      </div>
    );
  },
);

EmptyState.displayName = "EmptyState";
