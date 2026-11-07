import * as React from "react";
import { cn } from "@/lib/utils";

interface TooltipContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  tooltipId: string;
  delayDuration: number;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

export function TooltipProvider({
  children,
  delayDuration = 200,
}: {
  children: React.ReactNode;
  delayDuration?: number;
}) {
  return <>{children}</>;
}

export function Tooltip({
  children,
  open: controlledOpen,
  onOpenChange,
  delayDuration = 200,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const tooltipId = React.useId();

  const setOpen = React.useCallback(
    (action: React.SetStateAction<boolean>) => {
      const next = typeof action === "function" ? action(open) : action;
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, open, onOpenChange],
  );

  return (
    <TooltipContext.Provider value={{ open, setOpen, tooltipId, delayDuration }}>
      <div className="relative block w-full">{children}</div>
    </TooltipContext.Provider>
  );
}

export const TooltipTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ asChild, children, className, onMouseEnter, onMouseLeave, onFocus, onBlur, onKeyDown, ...props }, ref) => {
  const ctx = React.useContext(TooltipContext);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    onMouseEnter?.(e);
    if (!ctx) return;
    timerRef.current = setTimeout(() => {
      ctx.setOpen(true);
    }, ctx.delayDuration);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    onMouseLeave?.(e);
    if (timerRef.current) clearTimeout(timerRef.current);
    ctx?.setOpen(false);
  };

  const handleFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    onFocus?.(e);
    ctx?.setOpen(true);
  };

  const handleBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
    onBlur?.(e);
    if (timerRef.current) clearTimeout(timerRef.current);
    ctx?.setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if (e.key === "Escape") {
      ctx?.setOpen(false);
    }
  };

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<any>;
    return React.cloneElement(child, {
      ref: (node: any) => {
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<any>).current = node;
        const childRef = (child as any).ref;
        if (typeof childRef === "function") childRef(node);
        else if (childRef) childRef.current = node;
      },
      "aria-describedby": ctx?.open ? ctx.tooltipId : child.props["aria-describedby"],
      onMouseEnter: (e: any) => {
        child.props.onMouseEnter?.(e);
        handleMouseEnter(e);
      },
      onMouseLeave: (e: any) => {
        child.props.onMouseLeave?.(e);
        handleMouseLeave(e);
      },
      onFocus: (e: any) => {
        child.props.onFocus?.(e);
        handleFocus(e);
      },
      onBlur: (e: any) => {
        child.props.onBlur?.(e);
        handleBlur(e);
      },
      onKeyDown: (e: any) => {
        child.props.onKeyDown?.(e);
        handleKeyDown(e);
      },
      className: cn(child.props.className, className),
    });
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-describedby={ctx?.open ? ctx.tooltipId : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
});

TooltipTrigger.displayName = "TooltipTrigger";

export const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    side?: "top" | "bottom" | "left" | "right";
    align?: "start" | "center" | "end";
    sideOffset?: number;
  }
>(({ className, side = "top", align = "center", sideOffset = 4, children, ...props }, ref) => {
  const ctx = React.useContext(TooltipContext);

  if (!ctx?.open) return null;

  const sideClasses = {
    top: "bottom-full mb-1.5",
    bottom: "top-full mt-1.5",
    left: "right-full mr-1.5",
    right: "left-full ml-1.5",
  };

  const alignClasses = {
    start: side === "left" || side === "right" ? "top-0" : "left-0",
    center:
      side === "left" || side === "right"
        ? "top-1/2 -translate-y-1/2"
        : "left-1/2 -translate-x-1/2",
    end: side === "left" || side === "right" ? "bottom-0" : "right-0",
  };

  return (
    <div
      ref={ref}
      id={ctx.tooltipId}
      role="tooltip"
      className={cn(
        "absolute z-50 overflow-hidden rounded-md border border-border/80 bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md pointer-events-none animate-in fade-in-0 zoom-in-95 duration-150 whitespace-normal max-w-xs",
        sideClasses[side],
        alignClasses[align],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

TooltipContent.displayName = "TooltipContent";
