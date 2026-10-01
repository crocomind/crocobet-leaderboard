"use client";

import { ArrowUpRight, Eye, Film, Heart, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/common/animated-number";
import { Crossfade } from "@/components/common/crossfade";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { PlatformBadge } from "@/components/common/platform-badge";
import { ErrorState } from "@/components/common/state-panel";
import { VideoThumbnail } from "@/components/common/video-thumbnail";
import { useI18n } from "@/components/providers/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { MotionLinkButton } from "@/components/ui/motion-button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmployeeVideosQuery } from "@/lib/api/queries";
import type {
  LeaderboardEntry,
  LeaderboardPeriod,
  PlatformFilter,
  Video,
} from "@/lib/api/types";
import { enterUp, STAGGER } from "@/lib/motion";
import { PLATFORMS, safeExternalUrl } from "@/lib/platforms";

interface EmployeeSheetProps {
  entry: LeaderboardEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: PlatformFilter;
  period: LeaderboardPeriod;
  isMe: boolean;
}

/** Side sheet (bottom sheet on mobile) with one employee's stats and videos. */
export function EmployeeSheet({
  entry,
  open,
  onOpenChange,
  platform,
  period,
  isMe,
}: EmployeeSheetProps) {
  const { t, format, formatNumber } = useI18n();
  // Keyed on the entry rather than `open`, so content stays during the close animation.
  const videos = useEmployeeVideosQuery(entry?.employee.id ?? null, {
    platform,
    period,
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
            </div>
            <ResponsiveDialogClose
              label={t.common.close}
              className="-mt-1 -mr-2"
            />
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6 md:px-6">
            <dl className="grid grid-cols-2 gap-2.5">
              <Stat icon={<Eye />} label={t.metrics.views}>
                <AnimatedNumber
                  value={entry.totalViews}
                  format={formatNumber}
                />
              </Stat>
              <Stat icon={<Heart />} label={t.metrics.reactions}>
                <AnimatedNumber
                  value={entry.totalReactions}
                  format={formatNumber}
                />
              </Stat>
              <Stat icon={<Sparkles />} label={t.metrics.score}>
                <AnimatedNumber value={entry.score} format={formatNumber} />
              </Stat>
              <Stat icon={<Film />} label={t.leaderboard.columns.videos}>
                <AnimatedNumber
                  value={entry.videoCount}
                  format={formatNumber}
                />
              </Stat>
            </dl>

            <div className="mt-6 mb-3 flex items-baseline justify-between gap-3">
              <h3 className="font-semibold">{t.employee.videosTitle}</h3>
              <p className="truncate text-xs text-muted-foreground">
                {format(t.employee.counting, {
                  platform: platformLabel,
                  period: t.periods[period],
                })}
              </p>
            </div>

            <Crossfade
              stateKey={
                videos.isPending
                  ? "loading"
                  : videos.isError
                    ? "error"
                    : videos.data.length === 0
                      ? "empty"
                      : "list"
              }
            >
              {videos.isPending ? (
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
              ) : videos.isError ? (
                <ErrorState
                  title={t.employee.error}
                  description={t.leaderboard.error.description}
                  retryLabel={t.common.retry}
                  onRetry={() => void videos.refetch()}
                  retrying={videos.isFetching}
                  className="py-8"
                />
              ) : videos.data.length === 0 ? (
                <p className="rounded-control border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  {t.employee.empty}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {videos.data.map((video, index) => (
                    <VideoRow key={video.id} video={video} index={index} />
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
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-control border border-border bg-surface/70 p-3.5">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-xl font-bold">{children}</dd>
    </div>
  );
}

function VideoRow({ video, index }: { video: Video; index: number }) {
  const { t, formatCompact, formatDate, plural } = useI18n();
  const href = safeExternalUrl(video.url);

  return (
    <motion.li
      {...enterUp(index, STAGGER.list)}
      className="flex items-center gap-3 rounded-control border border-border bg-surface/60 p-2.5 motion-colors hover:border-brand/25 hover:bg-surface"
    >
      <VideoThumbnail
        platform={video.platform}
        thumbnailUrl={video.thumbnailUrl}
        compact
        className="size-16 shrink-0 rounded-xl"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {video.title ?? t.common.untitled}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <PlatformBadge platform={video.platform} size="xs" />
          {PLATFORMS[video.platform].name}
          {video.postedAt && <> · {formatDate(video.postedAt)}</>}
        </p>
        <p className="mt-1 flex items-center gap-3 text-xs tabular-nums">
          <span
            className="inline-flex items-center gap-1"
            title={plural(t.metrics.units.views, video.views)}
          >
            <Eye
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">
              {plural(t.metrics.units.views, video.views)}
            </span>
            <span aria-hidden="true">{formatCompact(video.views)}</span>
          </span>
          <span
            className="inline-flex items-center gap-1"
            title={plural(t.metrics.units.reactions, video.reactions)}
          >
            <Heart
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">
              {plural(t.metrics.units.reactions, video.reactions)}
            </span>
            <span aria-hidden="true">{formatCompact(video.reactions)}</span>
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
            {t.common.openVideo}: {video.title ?? t.common.untitled} (
            {t.common.opensInNewTab})
          </span>
        </MotionLinkButton>
      )}
    </motion.li>
  );
}
