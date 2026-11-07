import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "./icons";

interface SheetContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
}

const SheetContext = React.createContext<SheetContextValue | null>(null);

export function useSheet() {
  const context = React.useContext(SheetContext);
  if (!context) {
    throw new Error("Sheet subcomponents must be used within a <Sheet>");
  }
  return context;
}

export function Sheet({
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

  const triggerRef = React.useRef<HTMLElement | null>(null);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
      if (!next && triggerRef.current) {
        // Return focus to trigger element when closed
        triggerRef.current.focus();
      }
    },
    [isControlled, onOpenChange],
  );

  return (
    <SheetContext.Provider value={{ open, setOpen, triggerRef }}>
      {children}
    </SheetContext.Provider>
  );
}

export const SheetTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, children, onClick, ...props }, ref) => {
  const { setOpen, triggerRef } = useSheet();

  const handleRef = (node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    setOpen(true);
  };

  return (
    <button
      ref={handleRef}
      type="button"
      aria-haspopup="dialog"
      onClick={handleClick}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
});

SheetTrigger.displayName = "SheetTrigger";

export type SheetSide = "top" | "bottom" | "left" | "right";

const sideClasses: Record<SheetSide, string> = {
  top: "inset-x-0 top-0 border-b shadow-[0_8px_24px_rgb(0_0_0/.08)] animate-in slide-in-from-top duration-300",
  bottom: "inset-x-0 bottom-0 border-t shadow-[0_-8px_24px_rgb(0_0_0/.08)] animate-in slide-in-from-bottom duration-300",
  left: "inset-y-0 left-0 h-full w-full max-w-[400px] sm:w-[400px] sm:max-w-[400px] border-r shadow-[8px_0_24px_rgb(0_0_0/.08)] animate-in slide-in-from-left duration-300",
  right: "inset-y-0 right-0 h-full w-full max-w-[400px] sm:w-[400px] sm:max-w-[400px] border-l shadow-[-8px_0_24px_rgb(0_0_0/.08)] animate-in slide-in-from-right duration-300",
};

export const SheetContent = React.forwardRef<
  HTMLDialogElement,
  React.HTMLAttributes<HTMLDivElement> & {
    side?: SheetSide;
  }
>(({ className, side = "right", children, ...props }, ref) => {
  const { open, setOpen, triggerRef } = useSheet();
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);

  const handleDialogRef = (node: HTMLDialogElement | null) => {
    dialogRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDialogElement | null>).current = node;
  };

  // Sync open state with HTML5 <dialog>
  React.useEffect(() => {
    const dialogEl = dialogRef.current;
    if (!dialogEl) return;

    if (open) {
      if (!dialogEl.open) {
        if (typeof dialogEl.showModal === "function") {
          try {
            dialogEl.showModal();
          } catch {
            dialogEl.setAttribute("open", "");
          }
        } else {
          dialogEl.setAttribute("open", "");
        }
      }

      // Focus first focusable element inside sheet
      const focusableElements = dialogEl.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusableElements.length > 0 && focusableElements[0]) {
        focusableElements[0].focus();
      } else {
        dialogEl.focus();
      }
    } else {
      if (dialogEl.open) {
        if (typeof dialogEl.close === "function") {
          dialogEl.close();
        } else {
          dialogEl.removeAttribute("open");
        }
      }
    }
  }, [open]);

  // Handle Escape key
  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    e.preventDefault();
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }

    // Focus trap
    if (e.key === "Tab") {
      const dialogEl = dialogRef.current;
      if (!dialogEl) return;
      const focusable = Array.from(
        dialogEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (first && last) {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <dialog
      ref={handleDialogRef}
      role="dialog"
      aria-modal="true"
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 m-0 h-full w-full max-h-none max-w-none border-0 bg-black/60 p-0 backdrop-blur-sm"
    >
      <div
        className={cn(
          "fixed z-50 bg-background p-6 transition ease-in-out border-border overflow-y-auto flex flex-col justify-between",
          sideClasses[side],
          className,
        )}
        {...props}
      >
        <div className="relative">
          {children}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar"
            className="absolute right-0 top-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </dialog>
  );
});

SheetContent.displayName = "SheetContent";

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-2 text-left mb-6 pr-8", className)}
      {...props}
    />
  );
}

SheetHeader.displayName = "SheetHeader";

export function SheetFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2 mt-auto pt-6 border-t border-border/50", className)}
      {...props}
    />
  );
}

SheetFooter.displayName = "SheetFooter";

export const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-bold text-foreground", className)}
    {...props}
  />
));

SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));

SheetDescription.displayName = "SheetDescription";

export const SheetClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, onClick, ...props }, ref) => {
  const { setOpen } = useSheet();
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        onClick?.(e);
        setOpen(false);
      }}
      className={className}
      {...props}
    />
  );
});

SheetClose.displayName = "SheetClose";
