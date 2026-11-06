import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "./icons";

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

export function useDialog() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog subcomponents must be used within a <Dialog>");
  }
  return context;
}

export function Dialog({
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
    <DialogContext.Provider value={{ open, setOpen, triggerRef }}>
      {children}
    </DialogContext.Provider>
  );
}

export const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, children, onClick, ...props }, ref) => {
  const { setOpen, triggerRef } = useDialog();

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

DialogTrigger.displayName = "DialogTrigger";

export const DialogContent = React.forwardRef<
  HTMLDialogElement,
  React.HTMLAttributes<HTMLDivElement> & {
    onCloseAutoFocus?: () => void;
    forceMount?: boolean;
  }
>(({ className, children, forceMount = false, ...props }, ref) => {
  const { open, setOpen, triggerRef } = useDialog();
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);

  const handleDialogRef = (node: HTMLDialogElement | null) => {
    dialogRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDialogElement | null>).current = node;
  };

  // Sync open state with HTML5 <dialog> showModal / close
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

      // Focus first focusable element inside dialog or dialog itself
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

  // Handle native cancel event (Escape) and keydown
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

    // Focus trap inside modal
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
    // If user clicked directly on the <dialog> element (which acts as the backdrop)
    if (e.target === dialogRef.current) {
      setOpen(false);
    }
  };

  if (!open && !forceMount) return null;

  return (
    <dialog
      ref={handleDialogRef}
      role="dialog"
      aria-modal="true"
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      className={cn(
        "fixed inset-0 z-50 m-0 h-full w-full max-h-none max-w-none border-0 bg-black/60 p-0 backdrop-blur-sm items-center justify-center overflow-y-auto",
        open ? "flex" : "hidden",
      )}
    >
      <div
        className={cn(
          "relative w-full max-w-lg rounded-2xl border border-border bg-background p-6 text-foreground shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200 sm:my-8",
          className,
        )}
        {...props}
      >
        {children}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </dialog>
  );
});

DialogContent.displayName = "DialogContent";

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-left sm:text-left mb-4", className)}
      {...props}
    />
  );
}

DialogHeader.displayName = "DialogHeader";

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2 mt-6",
        className,
      )}
      {...props}
    />
  );
}

DialogFooter.displayName = "DialogFooter";

export const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-bold leading-none tracking-tight text-foreground", className)}
    {...props}
  />
));

DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));

DialogDescription.displayName = "DialogDescription";

export const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, onClick, ...props }, ref) => {
  const { setOpen } = useDialog();
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

DialogClose.displayName = "DialogClose";
