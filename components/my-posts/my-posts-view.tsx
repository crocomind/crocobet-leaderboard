"use client";

import { AnimatePresence, motion } from "motion/react";
import { Crossfade } from "@/components/common/crossfade";
import { GlowBackdrop } from "@/components/common/glow-backdrop";
import { ErrorState } from "@/components/common/state-panel";
import { EmptyPosts } from "@/components/my-posts/empty-posts";
import {
  SummaryCards,
  SummaryCardsSkeleton,
} from "@/components/my-posts/summary-cards";
import { PostCard, PostCardSkeleton } from "@/components/my-posts/post-card";
import { useI18n } from "@/components/providers/i18n-provider";
import { useSubmitPost } from "@/components/submit/submit-post-provider";
import { useMyPostsQuery } from "@/lib/api/queries";
import { enterUp, springLayout } from "@/lib/motion";

export function MyPostsView() {
  const { t } = useI18n();
  const { openSubmit } = useSubmitPost();
  const myPosts = useMyPostsQuery();

  return (
    <div className="relative isolate">
      <GlowBackdrop className="-top-28 opacity-70 md:-top-36" />

      <h1 className="text-3xl font-extrabold tracking-tight text-balance md:text-4xl">
        {t.myPosts.title}
      </h1>
      <p className="mt-1.5 max-w-xl text-pretty text-muted-foreground">
        {t.myPosts.subtitle}
      </p>

      <Crossfade
        className="mt-8"
        stateKey={
          myPosts.isPending
            ? "loading"
            : myPosts.isError
              ? "error"
              : myPosts.data.posts.length === 0
                ? "empty"
                : "content"
        }
      >
        {myPosts.isPending ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">{t.leaderboard.updating}</span>
            <SummaryCardsSkeleton />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <PostCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : myPosts.isError ? (
          <ErrorState
            title={t.myPosts.error.title}
            description={t.myPosts.error.description}
            retryLabel={t.common.retry}
            onRetry={() => void myPosts.refetch()}
            retrying={myPosts.isFetching}
            retryingLabel={t.leaderboard.updating}
          />
        ) : myPosts.data.posts.length === 0 ? (
          <EmptyPosts onSubmit={openSubmit} />
        ) : (
          <>
            <SummaryCards
              summary={myPosts.data.summary}
              verifiedCount={
                myPosts.data.posts.filter((v) => v.status === "verified").length
              }
            />
            <section aria-labelledby="my-posts-heading" className="mt-10">
              <h2 id="my-posts-heading" className="mb-4 text-lg font-bold">
                {t.myPosts.listLabel}
              </h2>
              <ul className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* New submissions fade in at the top; the rest glide over. */}
                <AnimatePresence mode="popLayout">
                  {myPosts.data.posts.map((post, index) => (
                    <motion.li
                      key={post.id}
                      layout="position"
                      {...enterUp(index)}
                      transition={{ layout: springLayout }}
                    >
                      <PostCard post={post} />
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
