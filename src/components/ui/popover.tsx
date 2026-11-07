import * as React from "react";
import { cn } from "@/lib/utils";

interface PopoverContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

export function Popover({
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback(
    (action: React.SetStateAction<boolean>) => {
      const next = typeof action === "function" ? action(open) : action;
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, open, onOpenChange]
  );

  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({
  asChild,
  children,
  className,
  ...props
}: {
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(PopoverContext);
  return (
    <button
      type="button"
      onClick={() => ctx?.setOpen((prev) => !prev)}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}

export function PopoverContent({
  className,
  children,
  align = "center",
  ...props
}: {
  className?: string;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
} & React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(PopoverContext);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!ctx?.open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        ctx.setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ctx]);

  if (!ctx?.open) return null;

  return (
    <div
      ref={popoverRef}
      className={cn(
        "absolute z-50 rounded-xl bg-popover text-popover-foreground p-4 shadow-[0_8px_24px_rgb(0_0_0/.08)] border border-border text-sm animate-in fade-in zoom-in-95 duration-100",
        align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
        "bottom-full mb-2 w-72 sm:w-80",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
