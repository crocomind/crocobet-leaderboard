import Image from "next/image";
import { cn } from "@/lib/utils";

/** The "Croco by Squad" logo: a sticker that reads on both themes. */
export function Logo({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <Image
      src="/logo.png"
      alt={label}
      width={258}
      height={120}
      loading="eager"
      className={cn("h-10 w-auto shrink-0", className)}
    />
  );
}
