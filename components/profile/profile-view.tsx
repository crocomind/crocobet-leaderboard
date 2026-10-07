"use client";

import { Clapperboard, ImageIcon, UserMinus } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Crossfade } from "@/components/common/crossfade";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { GlowBackdrop } from "@/components/common/glow-backdrop";
import { ErrorState } from "@/components/common/state-panel";
import { PostCard } from "@/components/my-posts/post-card";
import {
  StatusBadge,
  useBoardLabel,
} from "@/components/leaderboard/board-label";
import { useI18n } from "@/components/providers/i18n-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError } from "@/lib/api/errors";
import { useCurrentUserQuery, useProfileQuery } from "@/lib/api/queries";
import type {
  BoardResult,
  ContentCategory,
  ProfileLeaderboard,
} from "@/lib/api/types";
import { useAppUrlState } from "@/lib/hooks/use-app-url-state";
import { enterUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<ContentCategory, ReactNode> = {
  video: <Clapperboard />,
  static: <ImageIcon />,
};

/**
 * Someone's leaderboard history: the 3-Month Challenge and every weekly and
 * monthly round they took part in. Your own, or anyone's for an admin.
 */
export function ProfileView() {
  const { t } = useI18n();
  const { state } = useAppUrlState();
  // Your own profile needs the employee id from /me (the session's id is a
  // different one), so it waits for that.
  const me = useCurrentUserQuery();
  const employeeId = state.employee || me.data?.id;
  const profile = useProfileQuery(employeeId);
  const forbidden = isApiError(profile.error) && profile.error.status === 403;
  const failed = profile.isError || (!state.employee && me.isError);

  return (
    <div className="relative isolate">
      <GlowBackdrop className="-top-28 opacity-70 md:-top-36" />
      <Crossfade
        stateKey={profile.data ? "content" : failed ? "error" : "loading"}
      >
        {profile.data ? (
          <ProfileContent
            data={profile.data}
            isMine={profile.data.employee.id === me.data?.id}
          />
        ) : failed ? (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
              {t.profile.title}
            </h1>
            <ErrorState
              className="mt-8"
              title={forbidden ? t.profile.forbidden : t.profile.notFound}
              retryLabel={t.common.retry}
              onRetry={() =>
                void (me.isError ? me.refetch() : profile.refetch())
              }
              retrying={profile.isFetching || me.isFetching}
              retryingLabel={t.leaderboard.updating}
            />
          </>
        ) : (
          <div role="status" aria-busy="true">
            <span className="sr-only">{t.leaderboard.updating}</span>
            <div className="flex items-center gap-4">
              <Skeleton className="size-20 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-56 rounded-lg" />
                <Skeleton className="h-4 w-40 rounded-md" />
              </div>
            </div>
            <Skeleton className="mt-8 h-40 w-full rounded-card" />
            <Skeleton className="mt-6 h-24 w-full rounded-card" />
          </div>
        )}
      </Crossfade>
    </div>
  );
}

function ProfileContent({
  data,
  isMine,
}: {
  data: NonNullable<ReturnType<typeof useProfileQuery>["data"]>;
  /** Your own profile: the posts keep their delete and re-check actions. */
  isMine: boolean;
}) {
  const { t, format, plural, formatDateRange } = useI18n();
  const boardLabel = useBoardLabel();
  const { employee, timeZone, challenge } = data;
  // Rounds with a result, or that an admin took them off.
  const rounds = data.rounds.filter(
    (board) =>
      board.removed ||
      board.results.video.rank !== null ||
      board.results.static.rank !== null,
  );

  return (
    <>
      <header className="flex items-center gap-4">
        <EmployeeAvatar employee={employee} size="xl" />
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-extrabold tracking-tight md:text-4xl">
            {employee.name}
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {[employee.department, employee.email].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>

      <section
        aria-labelledby="profile-challenge"
        className="mt-8 rounded-card border border-brand/35 bg-surface/85 p-4 shadow-glow backdrop-blur sm:p-5"
      >
        <BoardHeading
          id="profile-challenge"
          title={boardLabel(challenge, timeZone)}
          board={challenge}
          dates={formatDateRange(
            challenge.startsAt,
            challenge.endsAt,
            timeZone,
          )}
          large
        />
        <Results board={challenge} large />
      </section>

      <section aria-labelledby="profile-posts" className="mt-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="profile-posts" className="text-lg font-bold">
            {t.profile.posts}
          </h2>
          {data.posts.length > 0 && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {[
                plural(t.participants.posts, data.posts.length),
                ...(
                  [
                    [["approved"], t.participants.approved],
                    [["pending"], t.participants.pending],
                    [["rejected", "disqualified"], t.participants.rejected],
                  ] as const
                ).flatMap(([statuses, label]) => {
                  const count = data.posts.filter((post) =>
                    (statuses as readonly string[]).includes(post.status),
                  ).length;
                  return count > 0 ? [format(label, { count })] : [];
                }),
              ].join(" · ")}
            </p>
          )}
        </div>
        {data.posts.length === 0 ? (
          <p className="rounded-card border border-border bg-surface/70 p-5 text-sm text-muted-foreground">
            {t.profile.noPosts}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.posts.map((post, index) => (
              <motion.li key={post.id} {...enterUp(Math.min(index, 9))}>
                <PostCard post={post} readOnly={!isMine} />
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="profile-history" className="mt-10">
        <h2 id="profile-history" className="mb-4 text-lg font-bold">
          {t.profile.history}
        </h2>
        {rounds.length === 0 ? (
          <p className="rounded-card border border-border bg-surface/70 p-5 text-sm text-muted-foreground">
            {t.profile.noHistory}
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rounds.map((board) => (
              <li
                key={board.id}
                className="rounded-card border border-border bg-surface/85 p-4 shadow-soft backdrop-blur"
              >
                <BoardHeading
                  title={boardLabel(board, timeZone)}
                  board={board}
                  dates={formatDateRange(
                    board.startsAt,
                    board.endsAt,
                    timeZone,
                  )}
                />
                <Results board={board} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function BoardHeading({
  id,
  title,
  board,
  dates,
  large,
}: {
  id?: string;
  title: string;
  board: ProfileLeaderboard;
  dates: string;
  large?: boolean;
}) {
  const { t } = useI18n();
  const Heading = large ? "h2" : "h3";
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <Heading
          id={id}
          className={cn(
            "flex items-center gap-2 font-bold",
            large ? "text-lg" : "text-base",
          )}
        >
          <span className="truncate">{title}</span>
          <StatusBadge status={board.status} />
        </Heading>
        <p className="text-xs text-muted-foreground">{dates}</p>
      </div>
      {board.removed && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-text">
          <UserMinus className="size-3.5" aria-hidden="true" />
          {t.profile.removed}
        </span>
      )}
    </div>
  );
}

/** Rank and score on the video and static boards. */
function Results({
  board,
  large,
}: {
  board: ProfileLeaderboard;
  large?: boolean;
}) {
  const { t } = useI18n();
  return (
    <dl className={cn("grid grid-cols-2 gap-3", large ? "mt-4" : "mt-3")}>
      {(["video", "static"] as const).map((category) => (
        <Result
          key={category}
          icon={CATEGORY_ICONS[category]}
          label={
            category === "video"
              ? t.categories.videoBoard
              : t.categories.staticBoard
          }
          result={board.results[category]}
          large={large}
        />
      ))}
    </dl>
  );
}

function Result({
  icon,
  label,
  result,
  large,
}: {
  icon: ReactNode;
  label: string;
  result: BoardResult;
  large?: boolean;
}) {
  const { t, format, formatNumber, plural } = useI18n();
  return (
    <div className="rounded-control bg-hover/50 p-3">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5 [&_svg]:text-brand-text">
        {icon}
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1.5 font-extrabold tracking-tight tabular-nums",
          large ? "text-2xl sm:text-3xl" : "text-lg",
        )}
      >
        {result.rank === null ? (
          <span className="text-base font-semibold text-muted-foreground">
            {t.profile.notRanked}
          </span>
        ) : (
          format(t.profile.rank, {
            rank: formatNumber(result.rank),
            total: formatNumber(result.totalParticipants),
          })
        )}
      </dd>
      {result.rank !== null && (
        <dd className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {plural(t.metrics.units.score, result.score)}
        </dd>
      )}
    </div>
  );
}
