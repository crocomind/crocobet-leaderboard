"use client";

import { Check, ClipboardPaste, Link2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ClipboardEvent, useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { PlatformBadge } from "@/components/common/platform-badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionButton } from "@/components/ui/motion-button";
import {
  DURATION,
  exitTween,
  REDUCED_FADE,
  springPress,
  tween,
} from "@/lib/motion";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

interface PostUrlFieldProps {
  id: string;
  registration: UseFormRegisterReturn<"url">;
  platform: Platform | null;
  valid: boolean;
  invalid: boolean;
  describedBy: string;
  onPasteText: (text: string) => void;
  onNativePaste: () => void;
}

/** Platform icon: pops in with a small scale-and-rotate spring; switching crossfades. */
function iconMotion(reduceMotion: boolean, rotate: number) {
  if (reduceMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: REDUCED_FADE },
      exit: { opacity: 0, transition: REDUCED_FADE },
    };
  }
  return {
    initial: { opacity: 0, scale: 0.4, rotate },
    animate: {
      opacity: 1,
      scale: 1,
      rotate: 0,
      transition: { default: springPress, opacity: tween(DURATION.fast) },
    },
    exit: { opacity: 0, scale: 0.6, transition: exitTween(DURATION.fast) },
  };
}

/** The hero URL input: live platform detection, valid/invalid states and a paste button. */
export function PostUrlField({
  id,
  registration,
  platform,
  valid,
  invalid,
  describedBy,
  onPasteText,
  onNativePaste,
}: PostUrlFieldProps) {
  const { t, format } = useI18n();
  const reduceMotion = useReducedMotion() ?? false;
  const [pasteFailed, setPasteFailed] = useState(false);
  // The dialog only renders in the browser, so navigator is always defined here.
  const canPaste = typeof navigator.clipboard?.readText === "function";

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      setPasteFailed(false);
      if (text) onPasteText(text);
    } catch {
      setPasteFailed(true);
    }
  };

  return (
    <div>
      {/* Border color and the outer glow (a pseudo-element) fade in on focus;
          the glow stays lit while the link is valid. */}
      <div
        data-invalid={invalid || undefined}
        data-glow={valid ? "on" : undefined}
        className={cn(
          "field-glow relative flex h-16 items-center gap-2 rounded-control border bg-surface pr-2 pl-3 shadow-soft motion-colors sm:h-[4.5rem] sm:pl-4",
          invalid
            ? "border-danger"
            : valid
              ? "border-brand/70"
              : "border-input focus-within:border-brand",
        )}
      >
        <span className="relative flex size-10 shrink-0 items-center justify-center">
          <AnimatePresence mode="popLayout" initial={false}>
            {platform ? (
              <motion.span key={platform} {...iconMotion(reduceMotion, -20)}>
                <PlatformBadge platform={platform} size="lg" />
              </motion.span>
            ) : (
              <motion.span
                key="link"
                {...iconMotion(reduceMotion, 0)}
                className="inline-flex size-10 items-center justify-center rounded-xl bg-hover text-muted-foreground"
              >
                <Link2 className="size-5" aria-hidden="true" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <input
          id={id}
          type="url"
          inputMode="url"
          enterKeyHint="go"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t.submit.urlPlaceholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-lg"
          {...registration}
          onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
            setPasteFailed(false);
            if (event.clipboardData.getData("text").trim()) onNativePaste();
          }}
        />

        <AnimatePresence initial={false}>
          {platform && (
            <motion.span
              key={platform}
              initial={{ opacity: 0, x: reduceMotion ? 0 : 8 }}
              animate={{ opacity: 1, x: 0, transition: tween(DURATION.base) }}
              exit={{
                opacity: 0,
                x: reduceMotion ? 0 : 8,
                transition: exitTween(DURATION.fast),
              }}
              className={cn(
                "hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold motion-colors sm:inline-flex",
                valid
                  ? "bg-brand/12 text-brand-text"
                  : "bg-hover text-muted-foreground",
              )}
            >
              {valid && (
                <Check
                  className="size-3.5"
                  strokeWidth={3}
                  aria-hidden="true"
                />
              )}
              {PLATFORMS[platform].name}
            </motion.span>
          )}
        </AnimatePresence>

        {canPaste && (
          <MotionButton
            variant="secondary"
            size="sm"
            onClick={() => void paste()}
            aria-label={t.submit.pasteLabel}
            className="shrink-0 shadow-none"
          >
            <ClipboardPaste aria-hidden="true" />
            <span className="hidden sm:inline" aria-hidden="true">
              {t.submit.paste}
            </span>
          </MotionButton>
        )}
      </div>

      {/* Announces detection to screen readers as the user types or pastes. */}
      <span className="sr-only" aria-live="polite">
        {platform
          ? format(t.submit.detected, { platform: PLATFORMS[platform].name })
          : ""}
      </span>
      {pasteFailed && (
        <p role="status" className="mt-2 text-sm text-warning-text">
          {t.submit.pasteFailed}
        </p>
      )}
    </div>
  );
}
