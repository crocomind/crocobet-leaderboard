"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/logo.svg";

/**
 * Logo slot. Drop the official logo at public/logo.svg and it replaces the
 * text fallback automatically. The logo is never drawn in code.
 */
export function Logo({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  // The image can finish (or fail) before hydration attaches onLoad/onError.
  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    setStatus(image.naturalWidth > 0 ? "loaded" : "error");
  }, []);

  return (
    <span className={cn("relative inline-flex h-8 items-center", className)}>
      {status !== "error" && (
        // A plain <img> so a missing file falls back to text instead of erroring.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          src={LOGO_SRC}
          alt={label}
          className={cn(
            "h-8 w-auto transition-opacity duration-(--dur-fast) ease-(--ease-out-soft)",
            status === "loaded" ? "opacity-100" : "absolute opacity-0",
          )}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
      {status !== "loaded" && (
        <span
          aria-hidden={status === "loading"}
          className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight"
        >
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full bg-brand shadow-[0_0_12px_2px_var(--brand-primary)]"
          />
          {label}
        </span>
      )}
    </span>
  );
}
