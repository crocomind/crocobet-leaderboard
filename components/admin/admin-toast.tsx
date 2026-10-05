"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "@/lib/hooks/use-is-client";
import { exitTween, REDUCED_FADE, springGentle } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface ToastMessage {
  id: number;
  text: string;
  tone: "success" | "error";
}

/** A short confirmation after an admin action. Disappears on its own. */
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback(
    (text: string, tone: ToastMessage["tone"] = "success") => {
      clearTimeout(timer.current);
      setToast({ id: Date.now(), text, tone });
      timer.current = setTimeout(() => setToast(null), 4_000);
    },
    [],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, show };
}

export function Toast({ toast }: { toast: ToastMessage | null }) {
  const isClient = useIsClient();
  const reduceMotion = useReducedMotion() ?? false;
  if (!isClient) return null;
  const Icon = toast?.tone === "error" ? CircleAlert : CircleCheck;

  return createPortal(
    // The live region stays mounted so screen readers announce each message.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4"
    >
      <AnimatePresence mode="popLayout">
        {toast && (
          <motion.p
            key={toast.id}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: reduceMotion ? REDUCED_FADE : springGentle,
            }}
            exit={{
              opacity: 0,
              transition: reduceMotion ? REDUCED_FADE : exitTween(),
            }}
            className={cn(
              "flex max-w-md items-center gap-2 rounded-full border bg-glass px-4 py-2.5 text-sm font-medium shadow-lifted backdrop-blur-xl",
              toast.tone === "error"
                ? "border-danger/40 text-danger-text"
                : "border-brand/40 text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                toast.tone === "success" && "text-brand-text",
              )}
              aria-hidden="true"
            />
            {toast.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
