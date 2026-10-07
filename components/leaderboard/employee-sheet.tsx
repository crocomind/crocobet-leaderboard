"use client";

import {
  ArrowUpRight,
  Eye,
  Film,
  Heart,
  Sparkles,
  UserRound,
} from "lucide-react";
import { ScoreBreakdown } from "@/components/leaderboard/score-breakdown";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/common/animated-number";
import { Crossfade } from "@/components/common/crossfade";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { PlatformBadge } from "@/components/common/platform-badge";
import { ErrorState } from "@/components/common/state-panel";
import { PostThumbnail } from "@/components/common/post-thumbnail";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useI18n } from "@/components/providers/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { MotionButton, MotionLinkButton } from "@/components/ui/motion-button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmployeePostsQuery } from "@/lib/api/queries";
import type {
  ContentCategory,
  LeaderboardEntry,
  LeaderboardPeriod,
  PlatformFilter,
  Post,
} from "@/lib/api/types";
import { useAppUrlState } from "@/lib/hooks/use-app-url-state";
import { enterUp, STAGGER } from "@/lib/motion";
import { PLATFORMS, safeExternalUrl } from "@/lib/platforms";
import { cn } from "@/lib/utils";

interface EmployeeSheetProps {
  entry: LeaderboardEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: ContentCategory;
  platform: PlatformFilter;
  period: LeaderboardPeriod;
  round: string | null;
  /** "This week", or the chosen round's name. */
  periodLabel: string;
  isMe: boolean;
}

/** Side sheet (bottom sheet on mobile) with one employee's stats and posts. */
export function EmployeeSheet({
  entry,
  open,
  onOpenChange,
  category,
  platform,
  period,
  round,
  periodLabel,
  isMe,
}: EmployeeSheetProps) {
  const { t, format, formatNumber } = useI18n();
  const { openProfile } = useAppUrlState();
  // Profiles are for the person themselves and admins (the server checks too).
  const isAdmin = useCurrentUser().user?.role === "admin";
  const canSeeProfile = isMe || isAdmin;
  // Keyed on the entry rather than `open`, so content stays during the close animation.
  const posts = useEmployeePostsQuery(entry?.employee.id ?? null, {
    category,
    platform,
    period,
    round,
  });

  const platformLabel =
    platform === "all"
      ? t.leaderboard.allPlatformsLong
      : PLATFORMS[platform].name;

  return (
    <ResponsiveDialog
      open={open && entry !== null}
      onOpenChange={onOpenChange}
      variant="side"
    >
      {entry && (
        <>
          <div className="flex items-start gap-4 px-5 pt-4 pb-5 md:px-6 md:pt-6">
            <EmployeeAvatar employee={entry.employee} size="lg" />
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-2">
                <ResponsiveDialogTitle className="truncate">
                  {entry.employee.name}
                </ResponsiveDialogTitle>
                {isMe && <Badge variant="brand">{t.common.you}</Badge>}
              </div>
              <ResponsiveDialogDescription className="mt-0.5">
                {entry.employee.department} ·{" "}
                {format(t.employee.rank, { rank: entry.rank })}
              </ResponsiveDialogDescription>
              {canSeeProfile && (
                <MotionButton
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    onOpenChange(false);
                    openProfile(isMe ? "" : entry.employee.id);
                  }}
                >
                  <UserRound aria-hidden="true" />
                  {t.admin.leaderboards.viewProfile}
                </MotionButton>
              )}
            </div>
            <ResponsiveDialogClose
              label={t.common.close}
              className="-mt-1 -mr-2"
            />
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6 md:px-6">
            {/* The board's stats: static boards never show views. */}
            <dl className="grid grid-cols-2 gap-2.5">
              <Stat
                icon={<Sparkles />}
                label={t.metrics.score}
                hint={t.metrics.formula[category]}
                highlight
                className={entry.totalViews === null ? "col-span-2" : ""}
              >
                <AnimatedNumber value={entry.score} format={formatNumber} />
              </Stat>
              {entry.totalViews !== null && (
                <Stat icon={<Eye />} label={t.metrics.views}>
                  <AnimatedNumber
                    value={entry.totalViews}
                    format={formatNumber}
                  />
                </Stat>
              )}
              <Stat icon={<Heart />} label={t.metrics.reactions}>
                <AnimatedNumber
                  value={entry.totalReactions}
                  format={formatNumber}
                />
              </Stat>
              <Stat icon={<Film />} label={t.leaderboard.columns.posts}>
                <AnimatedNumber value={entry.postCount} format={formatNumber} />
              </Stat>
            </dl>

            <div className="mt-6 mb-3 flex items-baseline justify-between gap-3">
              <h3 className="font-semibold">{t.employee.postsTitle}</h3>
              <p className="truncate text-xs text-muted-foreground">
                {format(t.employee.counting, {
                  category: t.categories[category],
                  platform: platformLabel,
                  period: periodLabel,
                })}
              </p>
            </div>

            <Crossfade
              stateKey={
                posts.isPending
                  ? "loading"
                  : posts.isError
                    ? "error"
                    : posts.data.length === 0
                      ? "empty"
                      : "list"
              }
            >
              {posts.isPending ? (
                <ul aria-busy="true" className="flex flex-col gap-2">
                  {Array.from({ length: 3 }, (_, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-control border border-border p-2.5"
                    >
                      <Skeleton className="size-16 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4 rounded-md" />
                        <Skeleton className="h-3 w-1/2 rounded-md" />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : posts.isError ? (
                <ErrorState
                  title={t.employee.error}
                  retryLabel={t.common.retry}
                  onRetry={() => void posts.refetch()}
                  retrying={posts.isFetching}
                  className="py-8"
                />
              ) : posts.data.length === 0 ? (
                <p className="rounded-control border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  {t.employee.empty}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {posts.data.map((post, index) => (
                    <PostRow key={post.id} post={post} index={index} />
                  ))}
                </ul>
              )}
            </Crossfade>
          </div>
        </>
      )}
    </ResponsiveDialog>
  );
}

function Stat({
  icon,
  label,
  hint,
  highlight,
  className,
  children,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  highlight?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-control border p-3.5",
        highlight
          ? "border-brand/35 bg-brand/8"
          : "border-border bg-surface/70",
        className,
      )}
    >
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-xl font-bold">{children}</dd>
      {hint && (
        <dd className="mt-0.5 text-[11px] text-muted-foreground">{hint}</dd>
      )}
    </div>
  );
}

function PostRow({ post, index }: { post: Post; index: number }) {
  const { t, formatDate, plural } = useI18n();
  const href = safeExternalUrl(post.url);
  const title = post.title ?? t.common.untitled;

  return (
    <motion.li
      {...enterUp(index, STAGGER.list)}
      className="flex items-center gap-3 rounded-control border border-border bg-surface/60 p-2.5 motion-colors hover:border-brand/25 hover:bg-surface"
    >
      <PostThumbnail
        platform={post.platform}
        category={post.category}
        thumbnailUrl={post.thumbnailUrl}
        compact
        className="size-16 shrink-0 rounded-xl"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <PlatformBadge platform={post.platform} size="xs" />
          <span className="truncate">
            {t.contentTypes[post.contentType]}
            {post.publishedAt && <> · {formatDate(post.publishedAt)}</>}
          </span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="text-xs font-bold whitespace-nowrap tabular-nums">
            {plural(t.metrics.units.score, post.score)}
          </span>
          <span className="sr-only">
            {[
              post.views !== null
                ? plural(t.metrics.units.views, post.views)
                : null,
              plural(t.metrics.units.reactions, post.reactions),
            ]
              .filter(Boolean)
              .join(", ")}
          </span>
          <span aria-hidden="true">
            <ScoreBreakdown views={post.views} reactions={post.reactions} />
          </span>
        </p>
      </div>
      {href && (
        <MotionLinkButton
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          variant="icon"
          size="icon-sm"
        >
          <ArrowUpRight aria-hidden="true" />
          <span className="sr-only">
            {t.common.openPost}: {title} ({t.common.opensInNewTab})
          </span>
        </MotionLinkButton>
      )}
    </motion.li>
  );
}
