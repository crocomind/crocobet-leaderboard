"use client";

import * as RadioGroup from "@radix-ui/react-radio-group";
import { motion } from "motion/react";
import { type ReactNode, useId } from "react";
import { springLayout } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  /** Accessible name for the group. */
  label: string;
  className?: string;
}

/**
 * A pill-shaped single choice (a radio group). The active pill is one shared
 * element that springs between options (springLayout), and the label colors
 * crossfade as it passes.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: SegmentedControlProps<T>) {
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
      className={cn(
        "relative isolate inline-flex rounded-full border border-border bg-surface p-1 shadow-soft",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            className={cn(
              "relative inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap",
              "press motion-press focus-visible:outline-offset-0",
              selected
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId={indicatorId}
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-full bg-primary shadow-glow"
                transition={springLayout}
              />
            )}
            {option.icon}
            <span>{option.label}</span>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
