import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  badge?: React.ReactNode;
}

export type SegmentedSize = "sm" | "md" | "lg";

export interface SegmentedProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: (SegmentedOption<T> | T)[];
  size?: SegmentedSize;
  disabled?: boolean;
  className?: string;
  name?: string;
  "aria-label"?: string;
}

const sizeContainerClasses: Record<SegmentedSize, string> = {
  sm: "p-0.5 rounded-lg text-xs gap-0.5",
  md: "p-1 rounded-xl text-sm gap-1",
  lg: "p-1.5 rounded-xl text-base gap-1.5",
};

const sizeItemClasses: Record<SegmentedSize, string> = {
  sm: "px-2.5 py-1 text-xs rounded-md min-h-7",
  md: "px-3.5 py-1.5 text-sm rounded-lg min-h-9",
  lg: "px-4 py-2 text-base rounded-lg min-h-11",
};

export function Segmented<T extends string = string>({
  value,
  onChange,
  options,
  size = "md",
  disabled = false,
  className,
  name,
  "aria-label": ariaLabel,
}: SegmentedProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const normalizedOptions: SegmentedOption<T>[] = React.useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === "string") {
        return { value: opt as T, label: opt };
      }
      return opt;
    });
  }, [options]);

  const enabledOptions = React.useMemo(
    () => normalizedOptions.filter((opt) => !opt.disabled && !disabled),
    [normalizedOptions, disabled],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentVal: T) => {
    if (disabled) return;
    const currentIndex = enabledOptions.findIndex((opt) => opt.value === currentVal);
    if (currentIndex === -1) return;

    let targetIndex = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      targetIndex = (currentIndex + 1) % enabledOptions.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      targetIndex = (currentIndex - 1 + enabledOptions.length) % enabledOptions.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      targetIndex = enabledOptions.length - 1;
    }

    if (targetIndex >= 0 && targetIndex < enabledOptions.length) {
      const targetOption = enabledOptions[targetIndex];
      if (targetOption) {
        onChange(targetOption.value);
        // Focus the target button
        const targetBtn = containerRef.current?.querySelector<HTMLButtonElement>(
          `[data-value="${targetOption.value}"]`,
        );
        targetBtn?.focus();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel || name}
      className={cn(
        "inline-flex items-center bg-muted/60 border border-border/50 text-muted-foreground select-none",
        sizeContainerClasses[size],
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      {normalizedOptions.map((option) => {
        const isSelected = option.value === value;
        const isOptionDisabled = disabled || option.disabled;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            data-value={option.value}
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={isOptionDisabled}
            onClick={() => {
              if (!isOptionDisabled && option.value !== value) {
                onChange(option.value);
              }
            }}
            onKeyDown={(e) => handleKeyDown(e, option.value)}
            className={cn(
              "relative inline-flex items-center justify-center font-medium whitespace-nowrap transition-all duration-150 cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              sizeItemClasses[size],
              isSelected
                ? "bg-background text-foreground font-semibold shadow-sm border border-border/40"
                : "text-muted-foreground hover:text-foreground hover:bg-background/40",
              isOptionDisabled && "opacity-40 cursor-not-allowed pointer-events-none",
            )}
          >
            {option.icon && <span className="mr-1.5 shrink-0">{option.icon}</span>}
            <span>{option.label}</span>
            {option.badge && <span className="ml-1.5 shrink-0">{option.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
