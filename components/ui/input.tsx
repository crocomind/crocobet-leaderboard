import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const inputClassName = cn(
  "block h-12 w-full min-w-0 rounded-control border border-input bg-surface px-4 text-[15px] text-foreground shadow-soft",
  "motion-colors placeholder:text-muted-foreground focus-visible:outline-none",
  "focus:border-brand aria-invalid:border-danger",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

interface InputProps extends ComponentProps<"input"> {
  wrapperClassName?: string;
}

/**
 * Text input. On focus the border shifts to brand green and a soft outer glow
 * fades in (a pseudo-element, see `field-glow` in globals.css), both over
 * --dur-base. aria-invalid switches both to the error color.
 */
export function Input({
  className,
  wrapperClassName,
  type = "text",
  ...props
}: InputProps) {
  const invalid =
    props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return (
    <span
      data-invalid={invalid || undefined}
      className={cn("field-glow block rounded-control", wrapperClassName)}
    >
      <input type={type} className={cn(inputClassName, className)} {...props} />
    </span>
  );
}
