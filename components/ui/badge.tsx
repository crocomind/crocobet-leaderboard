import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "border-border bg-hover text-muted-foreground",
        brand: "border-brand/30 bg-brand/12 text-brand-text",
        success: "border-success/30 bg-success/12 text-success-text",
        warning: "border-warning/35 bg-warning/12 text-warning-text",
        danger: "border-danger/35 bg-danger/12 text-danger-text",
        solid: "border-transparent bg-primary text-primary-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
