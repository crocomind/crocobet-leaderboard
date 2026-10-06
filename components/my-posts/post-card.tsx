"use client";

import {
  ArrowUpRight,
  Ban,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clapperboard,
  Hourglass,
  ImageIcon,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PostThumbnail } from "@/components/common/post-thumbnail";
import { ScoreBreakdown } from "@/components/leaderboard/score-breakdown";
import { useI18n } from "@/components/providers/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { MotionButton, MotionLinkButton } from "@/components/ui/motion-button";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError } from "@/lib/api/errors";
import {
  useRecheckPostMutation,
  useWithdrawPostMutation,
} from "@/lib/api/queries";
import type { Post, PostCheck, PostStatus } from "@/lib/api/types";
import { safeExternalUrl } from "@/lib/platforms";
import { trackSpotlight } from "@/lib/spotlight";
import { cn } from "@/lib/utils";

const STATUS_STYLE = {
  pending: { variant: "warning", icon: Hourglass },
  approved: { variant: "success", icon: CircleCheck },
  rejected: { variant: "danger", icon: CircleX },
  disqualified: { variant: "danger", icon: Ban },
} as const satisfies Record<PostStatus, { variant: string; icon: unknown }>;

export function StatusBadge({ status }: { status: PostStatus }) {
  const { t } = useI18n();
  const { variant, icon: Icon } = STATUS_STYLE[status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {t.myPosts.status[status]}
    </Badge>
  );
}

/** What the automated check found, in the owner's words. */
function CheckNotice({ check }: { check: PostCheck }) {
  const { t, format } = useI18n();
  const notice = {
    queued: {
      icon: LoaderCircle,
      text: t.myPosts.check.running,
      tone: "border-border bg-hover text-muted-foreground",
      spin: true,
    },
    running: {
      icon: LoaderCircle,
      text: t.myPosts.check.running,
      tone: "border-border bg-hover text-muted-foreground",
      spin: true,
    },
    passed: {
      icon: CircleCheck,
      text: format(t.myPosts.check.passed, {
        matched: check.matched.join(", ") || "#CrocoBySquad",
      }),
      tone: "border-success/25 bg-success/10 text-success-text",
      spin: false,
    },
    failed: {
      icon: TriangleAlert,
      text: t.myPosts.check.failed,
      tone: "border-warning/25 bg-warning/10 text-warning-text",
      spin: false,
    },
    error: {
      icon: CircleAlert,
      text: t.myPosts.check.error,
      tone: "border-danger/25 bg-danger/10 text-danger-text",
      spin: false,
    },
  }[check.status];
  const Icon = notice.icon;

  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
        notice.tone,
      )}
    >
      <Icon
        className={cn("mt-px size-3.5 shrink-0", notice.spin && "animate-spin")}
        aria-hidden="true"
      />
      {notice.text}
    </p>
  );
}

export function PostCard({ post }: { post: Post }) {
  const { t, format, formatDate, plural } = useI18n();
  const href = safeExternalUrl(post.url);
  const title = post.title ?? t.common.untitled;
  const pending = post.status === "pending";
  const counted = post.status === "approved" || pending;
  const checking =
    post.check.status === "queued" || post.check.status === "running";

  const recheck = useRecheckPostMutation();
  const withdraw = useWithdrawPostMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const actionError =
    recheck.error ?? (confirmOpen ? null : withdraw.error) ?? null;
  const CategoryIcon = post.category === "video" ? Clapperboard : ImageIcon;

  return (
    <article
      onPointerMove={trackSpotlight}
      className="card-depth card-spotlight relative flex h-full hover-lift flex-col rounded-card border border-border bg-surface/85 shadow-soft backdrop-blur motion-lift [--lift:3px] hover:border-brand/30"
    >
      <PostThumbnail
        platform={post.platform}
        category={post.category}
        thumbnailUrl={post.thumbnailUrl}
        className="aspect-[16/9] w-full rounded-t-card"
      />

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={post.status} />
          <span className="truncate text-xs text-muted-foreground">
            {t.contentTypes[post.contentType]}
          </span>
        </div>

        <div>
          <h3
            className={
              post.title
                ? "line-clamp-2 font-semibold"
                : "font-semibold text-muted-foreground"
            }
          >
            {title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {post.publishedAt
              ? format(t.myPosts.posted, { date: formatDate(post.publishedAt) })
              : format(t.myPosts.submitted, {
                  date: formatDate(post.submittedAt),
                })}
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-brand-text">
            <CategoryIcon className="size-3.5" aria-hidden="true" />
            {format(t.myPosts.countsAs, {
              category: t.categories[post.category],
            })}
          </p>
        </div>

        {pending && <CheckNotice check={post.check} />}

        {(post.status === "rejected" || post.status === "disqualified") && (
          <div className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs">
            {post.statusReason && (
              <p className="font-semibold text-danger-text">
                {format(t.myPosts.reason, {
                  reason: t.reasons[post.statusReason],
                })}
              </p>
            )}
            {post.statusNote && (
              <p className="mt-1 text-foreground">
                <span className="text-muted-foreground">
                  {t.myPosts.reviewerNote}:{" "}
                </span>
                {post.statusNote}
              </p>
            )}
            <p className="mt-1 text-muted-foreground">{t.myPosts.notCounted}</p>
          </div>
        )}

        {actionError && (
          <p role="alert" className="text-xs text-danger-text">
            {isApiError(actionError) && actionError.code === "rate_limited"
              ? t.myPosts.recheckTooSoon
              : t.myPosts.actionError}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1">
          {counted && post.metricsUpdatedAt ? (
            <p className="flex items-center gap-3">
              <span className="text-sm font-bold tabular-nums">
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
          ) : counted ? (
            <p className="text-xs text-muted-foreground">
              {t.myPosts.statsPending}
            </p>
          ) : (
            <span />
          )}
          {href && (
            <MotionLinkButton
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              variant="ghost"
              size="sm"
              className="-mr-2"
            >
              {t.common.openPost}
              <ArrowUpRight aria-hidden="true" />
              <span className="sr-only">
                : {title} ({t.common.opensInNewTab})
              </span>
            </MotionLinkButton>
          )}
        </div>

        {pending && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <MotionButton
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={checking}
              loading={recheck.isPending}
              onClick={() => recheck.mutate(post.id)}
            >
              <RefreshCw aria-hidden="true" />
              {t.myPosts.recheck}
            </MotionButton>
            <MotionButton
              variant="ghost"
              size="sm"
              className="flex-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                withdraw.reset();
                setConfirmOpen(true);
              }}
            >
              <Undo2 aria-hidden="true" />
              {t.myPosts.withdraw}
            </MotionButton>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.myPosts.withdrawTitle}
        description={
          <>
            {t.myPosts.withdrawDescription}
            {withdraw.isError && (
              <span role="alert" className="mt-2 block text-danger-text">
                {t.myPosts.actionError}
              </span>
            )}
          </>
        }
        confirmLabel={t.myPosts.withdrawConfirm}
        destructive
        pending={withdraw.isPending}
        onConfirm={() =>
          withdraw.mutate(post.id, { onSuccess: () => setConfirmOpen(false) })
        }
      />
    </article>
  );
}

export function PostCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-card border border-border bg-surface/70"
    >
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-32 rounded-full" />
        <Skeleton className="h-4 w-3/4 rounded-md" />
        <Skeleton className="h-3 w-1/3 rounded-md" />
      </div>
    </div>
  );
}
