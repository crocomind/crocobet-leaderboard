import type { ComponentProps } from "react";
import { inputClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Multi-line text input, styled like Input (border and glow on focus). */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  const invalid =
    props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return (
    <span
      data-invalid={invalid || undefined}
      className="field-glow block rounded-control"
    >
      <textarea
        className={cn(
          inputClassName,
          "h-auto min-h-24 resize-y py-3 leading-relaxed",
          className,
        )}
        {...props}
      />
    </span>
  );
}
