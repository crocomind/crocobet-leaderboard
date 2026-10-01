"use client";

import * as RadioGroup from "@radix-ui/react-radio-group";
import { motion } from "motion/react";
import { type ReactNode, useId } from "react";
import { springLayout } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface ChipOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

interface ChipGroupProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly ChipOption<T>[];
  label: string;
  className?: string;
}

const chipClassName = cn(
  "relative inline-flex h-10 shrink-0 press items-center rounded-full border border-border bg-surface px-4 text-sm font-medium whitespace-nowrap shadow-soft motion-press",
  "hover:border-border-strong",
);

/**
 * Rounded filter chips with single selection (a radio group). The active
 * background is a single element that springs from chip to chip.
 */
export function ChipGroup<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: ChipGroupProps<T>) {
  const indicatorId = useId();

  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(next) => {
        const option = options.find((o) => o.value === next);
        if (option) onValueChange(option.value);
      }}
      aria-label={label}
      orientation="horizontal"
      loop
      // The indicator (z-1) sits above every chip's background and below every
      // label (z-2), whichever direction it slides.
      className={cn("isolate flex items-center gap-2", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            className={cn(
              chipClassName,
              selected
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId={indicatorId}
                aria-hidden="true"
                className="absolute -inset-px z-[1] rounded-full border border-brand/50 bg-brand/12"
                transition={springLayout}
              />
            )}
            <span className="relative z-[2] inline-flex items-center gap-2">
              {option.icon}
              {option.label}
            </span>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
