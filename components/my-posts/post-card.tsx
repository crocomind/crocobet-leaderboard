"use client";

import {
  ArrowUpRight,
  CircleCheck,
  CircleX,
  Eye,
  Heart,
  Hourglass,
} from "lucide-react";
import { PostThumbnail } from "@/components/common/post-thumbnail";
import { useI18n } from "@/components/providers/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { MotionLinkButton } from "@/components/ui/motion-button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Post, PostStatus } from "@/lib/api/types";
import { PLATFORMS, safeExternalUrl } from "@/lib/platforms";
import { trackSpotlight } from "@/lib/spotlight";

const STATUS_STYLE = {
  pending: { variant: "warning", icon: Hourglass },
  verified: { variant: "success", icon: CircleCheck },
  rejected: { variant: "danger", icon: CircleX },
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

export function PostCard({ post }: { post: Post }) {
  const { t, format, formatDate, formatCompact, plural } = useI18n();
  const href = safeExternalUrl(post.url);
  const title = post.title ?? t.common.untitled;

  return (
    <article
      onPointerMove={trackSpotlight}
      className="card-depth card-spotlight relative flex h-full hover-lift flex-col rounded-card border border-border bg-surface/85 shadow-soft backdrop-blur motion-lift [--lift:3px] hover:border-brand/30"
    >
      <PostThumbnail
        platform={post.platform}
        thumbnailUrl={post.thumbnailUrl}
        className="aspect-[16/9] w-full rounded-t-card"
      />

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={post.status} />
          <span className="truncate text-xs text-muted-foreground">
            {PLATFORMS[post.platform].name}
          </span>
        </div>

        <h3
          className={
            post.title
              ? "mt-3 line-clamp-2 font-semibold"
              : "mt-3 font-semibold text-muted-foreground"
          }
        >
          {title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {post.postedAt
            ? format(t.myPosts.posted, { date: formatDate(post.postedAt) })
            : format(t.myPosts.submitted, {
                date: formatDate(post.submittedAt),
              })}
        </p>

        {post.status === "rejected" && post.rejectionReason && (
          <p className="mt-3 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger-text">
            {format(t.myPosts.rejectionReason, {
              reason: post.rejectionReason,
            })}
          </p>
        )}
        {post.status === "pending" && (
          <p className="mt-3 rounded-xl border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning-text">
            {t.myPosts.statsPending}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          {post.status === "verified" ? (
            <p className="flex items-center gap-4 text-sm font-semibold tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <Eye
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <span aria-hidden="true">{formatCompact(post.views)}</span>
                <span className="sr-only">
                  {plural(t.metrics.units.views, post.views)}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Heart
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <span aria-hidden="true">{formatCompact(post.reactions)}</span>
                <span className="sr-only">
                  {plural(t.metrics.units.reactions, post.reactions)}
                </span>
              </span>
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
      </div>
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
