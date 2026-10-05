"use client";

import { Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useI18n } from "@/components/providers/i18n-provider";
import { useSubmitPost } from "@/components/submit/submit-post-provider";
import { MotionButton } from "@/components/ui/motion-button";
import { REDUCED_FADE, springGentle } from "@/lib/motion";

/** Floating "Submit post" button for small screens (the header has one on desktop). */
export function MobileSubmitFab() {
  const { t } = useI18n();
  const { openSubmit } = useSubmitPost();
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 md:hidden"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduceMotion ? REDUCED_FADE : springGentle}
    >
      <MotionButton
        size="icon"
        aria-label={t.header.submitPost}
        onClick={openSubmit}
        className="size-14 rounded-full [&_svg]:size-6"
      >
        <Plus strokeWidth={2.5} aria-hidden="true" />
      </MotionButton>
    </motion.div>
  );
}
