"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { SubmitSuccess } from "@/components/submit/submit-success";
import { SubmitPostForm } from "@/components/submit/submit-post-form";
import { useSubmitPost } from "@/components/submit/submit-post-provider";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import type { Post } from "@/lib/api/types";
import { useAppUrlState } from "@/lib/hooks/use-app-url-state";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { DURATION, exitTween, tween } from "@/lib/motion";
import { PLATFORM_LIST } from "@/lib/platforms";

/** Centered modal on desktop, bottom sheet on mobile. Opened via useSubmitPost(). */
export function SubmitPostDialog() {
  const { open, setOpen } = useSubmitPost();

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      variant="center"
      // Without an autofocused field (mobile), focus the dialog itself so the
      // keyboard doesn't jump up before the user taps the field.
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        if (event.currentTarget instanceof HTMLElement)
          event.currentTarget.focus();
      }}
    >
      <SubmitPostFlow onClose={() => setOpen(false)} />
    </ResponsiveDialog>
  );
}

/** Mounted only while the dialog is open, so every open starts fresh. */
function SubmitPostFlow({ onClose }: { onClose: () => void }) {
  const { t, format, formatList } = useI18n();
  const isDesktop = useIsDesktop();
  const { setView } = useAppUrlState();
  const [submitted, setSubmitted] = useState<Post | null>(null);
  const [round, setRound] = useState(0);

  return (
    <>
      <div className="flex items-start gap-3 px-5 pt-2 pb-5 md:px-7 md:pt-7">
        <div className="min-w-0 flex-1">
          <ResponsiveDialogTitle>{t.submit.title}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="mt-1">
            {format(t.submit.description, {
              platforms: formatList(
                PLATFORM_LIST.map((platform) => platform.name),
                "or",
              ),
            })}
          </ResponsiveDialogDescription>
        </div>
        <ResponsiveDialogClose label={t.common.close} className="-mt-1 -mr-2" />
      </div>

      <div className="overflow-y-auto overscroll-contain px-5 pb-6 md:px-7 md:pb-7">
        <AnimatePresence mode="wait" initial={false}>
          {submitted ? (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: tween(DURATION.fast) }}
            >
              <SubmitSuccess
                post={submitted}
                onSubmitAnother={() => {
                  setRound((current) => current + 1);
                  setSubmitted(null);
                }}
                onViewLeaderboard={() => {
                  onClose();
                  setView("leaderboard");
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key={`form-${round}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: tween(DURATION.base) }}
              exit={{
                opacity: 0,
                scale: 0.98,
                transition: exitTween(DURATION.base),
              }}
            >
              <SubmitPostForm
                onSubmitted={setSubmitted}
                autoFocus={isDesktop || round > 0}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
