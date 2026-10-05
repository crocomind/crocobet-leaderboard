"use client";

import { AnimatePresence, motion } from "motion/react";
import { Crossfade } from "@/components/common/crossfade";
import { GlowBackdrop } from "@/components/common/glow-backdrop";
import { ErrorState } from "@/components/common/state-panel";
import { EmptyVideos } from "@/components/my-videos/empty-videos";
import {
  SummaryCards,
  SummaryCardsSkeleton,
} from "@/components/my-videos/summary-cards";
import {
  VideoCard,
  VideoCardSkeleton,
} from "@/components/my-videos/video-card";
import { useI18n } from "@/components/providers/i18n-provider";
import { useSubmitVideo } from "@/components/submit/submit-video-provider";
import { useMyVideosQuery } from "@/lib/api/queries";
import { enterUp, springLayout } from "@/lib/motion";

export function MyVideosView() {
  const { t } = useI18n();
  const { openSubmit } = useSubmitVideo();
  const myVideos = useMyVideosQuery();

  return (
    <div className="relative isolate">
      <GlowBackdrop className="-top-28 opacity-70 md:-top-36" />

      <h1 className="text-3xl font-extrabold tracking-tight text-balance md:text-4xl">
        {t.myVideos.title}
      </h1>
      <p className="mt-1.5 max-w-xl text-pretty text-muted-foreground">
        {t.myVideos.subtitle}
      </p>

      <Crossfade
        className="mt-8"
        stateKey={
          myVideos.isPending
            ? "loading"
            : myVideos.isError
              ? "error"
              : myVideos.data.videos.length === 0
                ? "empty"
                : "content"
        }
      >
        {myVideos.isPending ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">{t.leaderboard.updating}</span>
            <SummaryCardsSkeleton />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <VideoCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : myVideos.isError ? (
          <ErrorState
            title={t.myVideos.error.title}
            description={t.myVideos.error.description}
            retryLabel={t.common.retry}
            onRetry={() => void myVideos.refetch()}
            retrying={myVideos.isFetching}
            retryingLabel={t.leaderboard.updating}
          />
        ) : myVideos.data.videos.length === 0 ? (
          <EmptyVideos onSubmit={openSubmit} />
        ) : (
          <>
            <SummaryCards
              summary={myVideos.data.summary}
              verifiedCount={
                myVideos.data.videos.filter((v) => v.status === "verified")
                  .length
              }
            />
            <section aria-labelledby="my-videos-heading" className="mt-10">
              <h2 id="my-videos-heading" className="mb-4 text-lg font-bold">
                {t.myVideos.listLabel}
              </h2>
              <ul className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* New submissions fade in at the top; the rest glide over. */}
                <AnimatePresence mode="popLayout">
                  {myVideos.data.videos.map((video, index) => (
                    <motion.li
                      key={video.id}
                      layout="position"
                      {...enterUp(index)}
                      transition={{ layout: springLayout }}
                    >
                      <VideoCard video={video} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          </>
        )}
      </Crossfade>
    </div>
  );
}
