import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarContextValue {
  imageLoaded: boolean;
  setImageLoaded: (loaded: boolean) => void;
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null);

export const Avatar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const [imageLoaded, setImageLoaded] = React.useState(false);

  return (
    <AvatarContext.Provider value={{ imageLoaded, setImageLoaded }}>
      <div
        ref={ref}
        className={cn(
          "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border/50 bg-muted/40",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </AvatarContext.Provider>
  );
});

Avatar.displayName = "Avatar";

export interface AvatarImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  onLoadingStatusChange?: (status: "loading" | "loaded" | "error") => void;
}

export const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, src, alt, onLoadingStatusChange, ...props }, ref) => {
    const ctx = React.useContext(AvatarContext);
    const [status, setStatus] = React.useState<"idle" | "loading" | "loaded" | "error">(
      src ? "loading" : "error",
    );

    React.useEffect(() => {
      if (!src) {
        setStatus("error");
        ctx?.setImageLoaded(false);
        onLoadingStatusChange?.("error");
        return;
      }

      let active = true;
      if (typeof window !== "undefined" && typeof src === "string") {
        const img = new window.Image();
        img.src = src;

        img.onload = () => {
          if (!active) return;
          setStatus("loaded");
          ctx?.setImageLoaded(true);
          onLoadingStatusChange?.("loaded");
        };

        img.onerror = () => {
          if (!active) return;
          setStatus("error");
          ctx?.setImageLoaded(false);
          onLoadingStatusChange?.("error");
        };
      }

      return () => {
        active = false;
      };
    }, [src, ctx, onLoadingStatusChange]);

    if (status !== "loaded") return null;

    return (
      <img
        ref={ref}
        src={src}
        alt={alt}
        className={cn("aspect-square h-full w-full object-cover", className)}
        {...props}
      />
    );
  },
);

AvatarImage.displayName = "AvatarImage";

export const AvatarFallback = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(AvatarContext);

  if (ctx?.imageLoaded) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-xs select-none",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

AvatarFallback.displayName = "AvatarFallback";
