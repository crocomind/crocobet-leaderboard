"use client";

import { Clapperboard, Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { PlatformBadge } from "@/components/common/platform-badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { ConfettiBurst } from "@/components/submit/confetti-burst";
import { MotionButton } from "@/components/ui/motion-button";
import type { Post } from "@/lib/api/types";
import { DURATION, EASE_OUT_SOFT, springGentle, tween } from "@/lib/motion";

interface SubmitSuccessProps {
  post: Post;
  onSubmitAnother: () => void;
  onViewMyPosts: () => void;
}

/**
 * The submit button's pill morphs into a round badge, the checkmark draws
 * itself and a little confetti bursts in brand colors. Static under reduced motion.
 */
export function SubmitSuccess({
  post,
  onSubmitAnother,
  onViewMyPosts,
}: SubmitSuccessProps) {
  const { t, format } = useI18n();
  const reduceMotion = useReducedMotion() ?? false;
  const animateIn = !reduceMotion;

  const fadeUp = (delay: number) =>
    animateIn
      ? {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { ...tween(DURATION.slow), delay },
        }
      : {};

  return (
    <div className="flex flex-col items-center py-4 text-center sm:py-6">
      <div className="relative flex h-28 w-full items-center justify-center">
        {animateIn && (
          <>
            <motion.span
              aria-hidden="true"
              className="absolute size-20 rounded-full bg-brand/30"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.8, 1.9], opacity: [0.7, 0] }}
              transition={{ duration: 0.9, delay: 0.32, ease: EASE_OUT_SOFT }}
            />
            <ConfettiBurst />
          </>
        )}

        <motion.span
          aria-hidden="true"
          className="relative flex items-center justify-center bg-primary text-primary-foreground shadow-glow"
          initial={
            animateIn ? { width: 240, height: 56, borderRadius: 16 } : false
          }
          animate={{ width: 80, height: 80, borderRadius: 40 }}
          transition={springGentle}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-10"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M5 12.5 9.5 17 19 7.5"
              initial={animateIn ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ ...tween(DURATION.slow), delay: 0.28 }}
            />
          </svg>
        </motion.span>
      </div>

      <motion.h3
        role="status"
        className="mt-5 text-2xl font-extrabold tracking-tight"
        {...fadeUp(0.35)}
      >
        {t.submit.successTitle}
      </motion.h3>
      <motion.p
        className="mt-2 max-w-sm text-sm text-pretty text-muted-foreground"
        {...fadeUp(0.42)}
      >
        {format(t.submit.successDescription, {
          board:
            post.category === "video"
              ? t.categories.videoBoard
              : t.categories.staticBoard,
        })}
      </motion.p>

      <motion.p
        className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface/80 py-1.5 pr-3.5 pl-1.5 text-sm"
        {...fadeUp(0.48)}
      >
        <PlatformBadge platform={post.platform} size="sm" />
        <span className="truncate font-medium">
          {post.title ?? t.contentTypes[post.contentType]}
        </span>
      </motion.p>

      {/* Side by side when both fit, otherwise stacked with the main step on
          top, so long labels never overflow the dialog. */}
      <motion.div
        className="mt-8 flex w-full flex-wrap-reverse gap-3"
        {...fadeUp(0.55)}
      >
        <MotionButton
          variant="secondary"
          size="lg"
          className="grow basis-0"
          onClick={onSubmitAnother}
        >
          <Plus aria-hidden="true" />
          {t.submit.submitAnother}
        </MotionButton>
        {/* Focus lands on the main next step so Enter continues. */}
        <MotionButton
          size="lg"
          className="grow basis-0"
          onClick={onViewMyPosts}
          autoFocus
        >
          <Clapperboard aria-hidden="true" />
          {t.submit.viewMyPosts}
        </MotionButton>
      </motion.div>
    </div>
  );
}
