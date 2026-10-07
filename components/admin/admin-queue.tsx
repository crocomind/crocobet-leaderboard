"use client";

import { ArrowUpRight, Lock, PanelRightOpen } from "lucide-react";
import { motion } from "motion/react";
import {
  AdminActions,
  type OnAdminAction,
} from "@/components/admin/admin-actions";
import {
  CheckBadge,
  CheckEvidence,
  FlagBadges,
} from "@/components/admin/evidence";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { PlatformBadge } from "@/components/common/platform-badge";
import { ScoreBreakdown } from "@/components/leaderboard/score-breakdown";
import { useI18n } from "@/components/providers/i18n-provider";
import { MotionButton, MotionLinkButton } from "@/components/ui/motion-button";
import type { AdminPost } from "@/lib/api/types";
import { useNow } from "@/lib/hooks/use-now";
import { enterUp, STAGGER } from "@/lib/motion";
import { safeExternalUrl } from "@/lib/platforms";
import { cn } from "@/lib/utils";

interface AdminQueueProps {
  posts: AdminPost[];
  /** Bulk selection is offered on the pending tab. */
  selectable: boolean;
  selected: ReadonlySet<string>;
  onToggle: (postId: string) => void;
  onToggleAll: (select: boolean) => void;
  onOpen: (post: AdminPost) => void;
  onAction: OnAdminAction;
  busy: boolean;
}

function SelectBox({
  checked,
  label,
  onChange,
  indeterminate,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  indeterminate?: boolean;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(element) => {
        if (element) element.indeterminate = Boolean(indeterminate);
      }}
      onChange={(event) => onChange(event.target.checked)}
      className="size-4 cursor-pointer accent-brand"
    />
  );
}

function PostCell({ post }: { post: AdminPost }) {
  const { t } = useI18n();
  const href = safeExternalUrl(post.url);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <PlatformBadge platform={post.platform} size="xs" />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold">
          {t.contentTypes[post.contentType]}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {post.title ?? t.common.untitled}
        </p>
      </div>
      {href && (
        <MotionLinkButton
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          variant="icon"
          size="icon-sm"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ArrowUpRight aria-hidden="true" />
          <span className="sr-only">
            {t.common.openPost}: {post.employee.name} ({t.common.opensInNewTab})
          </span>
        </MotionLinkButton>
      )}
    </div>
  );
}

/** When the post was submitted here, in the viewer's local time. */
function SubmittedAt({
  post,
  className,
}: {
  post: AdminPost;
  className?: string;
}) {
  const { formatDateTime } = useI18n();
  return (
    <time
      dateTime={post.submittedAt}
      className={cn("text-xs tabular-nums", className)}
    >
      {formatDateTime(post.submittedAt)}
    </time>
  );
}

function PublishedCell({ post }: { post: AdminPost }) {
  const { t, formatDate } = useI18n();
  return (
    <div className="text-xs">
      <p className={post.publishedAt ? "" : "text-muted-foreground"}>
        {post.publishedAt
          ? formatDate(post.publishedAt)
          : t.admin.publishedUnknown}
      </p>
      {post.publishedAtSource === "submitter" && (
        <p className="text-warning-text">{t.admin.dateUncertain}</p>
      )}
    </div>
  );
}

function MetricsCell({ post }: { post: AdminPost }) {
  const { t, format, formatNumber, formatRelativeTime } = useI18n();
  const now = useNow();
  return (
    <div className="text-xs">
      <p className="flex items-center gap-1 text-sm font-bold tabular-nums">
        {formatNumber(post.score)}
        {post.metricsLocked && (
          <Lock
            className="size-3 text-warning-text"
            aria-label={t.admin.drawer.locked}
          />
        )}
      </p>
      <ScoreBreakdown
        views={post.views}
        reactions={post.reactions}
        className="flex-wrap gap-x-2.5 gap-y-0.5"
      />
      <p className="mt-0.5 text-muted-foreground">
        {!post.metricsUpdatedAt
          ? t.admin.notFetched
          : now > 0
            ? format(t.admin.updated, {
                time:
                  formatRelativeTime(post.metricsUpdatedAt, now) ??
                  t.common.justNow,
              })
            : null}
      </p>
    </div>
  );
}

function DetailsButton({
  post,
  onOpen,
}: {
  post: AdminPost;
  onOpen: (post: AdminPost) => void;
}) {
  const { t } = useI18n();
  return (
    <MotionButton
      variant="ghost"
      size="sm"
      aria-haspopup="dialog"
      aria-label={`${t.admin.actions.details}: ${post.employee.name}`}
      onClick={() => onOpen(post)}
      className="h-8 px-2.5 text-xs"
    >
      <PanelRightOpen aria-hidden="true" />
      {t.admin.actions.details}
    </MotionButton>
  );
}

/** The moderation queue: a table on large screens, cards on small ones. */
export function AdminQueue({
  posts,
  selectable,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  onAction,
  busy,
}: AdminQueueProps) {
  const { t, format } = useI18n();
  const columns = t.admin.columns;
  const allSelected =
    posts.length > 0 && posts.every((post) => selected.has(post.id));
  const someSelected = posts.some((post) => selected.has(post.id));

  return (
    <>
      <div className="hidden overflow-hidden rounded-card border border-border bg-surface/80 shadow-soft backdrop-blur lg:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-border text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <tr>
              {selectable && (
                <th scope="col" className="w-10 py-3 pl-4">
                  <SelectBox
                    label={t.admin.bulk.selectAll}
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onChange={onToggleAll}
                  />
                </th>
              )}
              <th scope="col" className="w-[14%] px-3 py-3">
                {columns.employee}
              </th>
              <th scope="col" className="w-[15%] px-3 py-3">
                {columns.post}
              </th>
              {/* The queue is listed newest submission first. */}
              <th
                scope="col"
                aria-sort="descending"
                className="w-[11%] px-3 py-3"
              >
                {columns.submitted}
              </th>
              <th scope="col" className="w-[9%] px-3 py-3">
                {columns.published}
              </th>
              <th scope="col" className="w-[14%] px-3 py-3">
                {columns.evidence}
              </th>
              <th scope="col" className="w-[10%] px-3 py-3">
                {columns.metrics}
              </th>
              <th scope="col" className="w-[12%] px-3 py-3">
                {columns.flags}
              </th>
              <th scope="col" className="w-36 px-3 py-3 pr-4 text-right">
                {columns.actions}
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post, index) => (
              <motion.tr
                key={post.id}
                {...enterUp(index, STAGGER.rows)}
                className={cn(
                  "border-b border-border align-top motion-colors last:border-b-0 hover:bg-hover/60",
                  selected.has(post.id) && "bg-brand/8",
                )}
              >
                {selectable && (
                  <td className="py-3.5 pl-4">
                    <SelectBox
                      label={format(t.admin.bulk.selectPost, {
                        name: post.employee.name,
                      })}
                      checked={selected.has(post.id)}
                      onChange={() => onToggle(post.id)}
                    />
                  </td>
                )}
                <td className="px-3 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <EmployeeAvatar employee={post.employee} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {post.employee.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {post.employee.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <PostCell post={post} />
                </td>
                <td className="px-3 py-3">
                  <SubmittedAt post={post} />
                </td>
                <td className="px-3 py-3">
                  <PublishedCell post={post} />
                </td>
                <td className="px-3 py-3">
                  <CheckBadge check={post.check} />
                  <CheckEvidence check={post.check} className="mt-1.5" />
                </td>
                <td className="px-3 py-3">
                  <MetricsCell post={post} />
                </td>
                <td className="px-3 py-3">
                  <FlagBadges flags={post.flags} />
                </td>
                <td className="px-3 py-3 pr-4">
                  <div className="flex flex-col items-end gap-1.5">
                    <AdminActions
                      post={post}
                      onAction={onAction}
                      busy={busy}
                      compact
                      className="flex-col items-end"
                    />
                    <DetailsButton post={post} onOpen={onOpen} />
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {posts.map((post, index) => (
          <motion.li
            key={post.id}
            {...enterUp(index, STAGGER.list)}
            className={cn(
              "rounded-card border border-border bg-surface/85 p-4 shadow-soft backdrop-blur",
              selected.has(post.id) && "border-brand/45 bg-brand/8",
            )}
          >
            <div className="flex items-start gap-3">
              {selectable && (
                <span className="pt-2.5">
                  <SelectBox
                    label={format(t.admin.bulk.selectPost, {
                      name: post.employee.name,
                    })}
                    checked={selected.has(post.id)}
                    onChange={() => onToggle(post.id)}
                  />
                </span>
              )}
              <EmployeeAvatar employee={post.employee} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{post.employee.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {post.employee.email}
                </p>
              </div>
              <SubmittedAt
                post={post}
                className="shrink-0 pt-0.5 text-muted-foreground"
              />
            </div>
            <CheckBadge check={post.check} className="mt-3" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <PostCell post={post} />
              <PublishedCell post={post} />
              <CheckEvidence check={post.check} />
              <MetricsCell post={post} />
            </div>
            <FlagBadges flags={post.flags} className="mt-3" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <AdminActions
                post={post}
                onAction={onAction}
                busy={busy}
                compact
              />
              <DetailsButton post={post} onOpen={onOpen} />
            </div>
          </motion.li>
        ))}
      </ul>
    </>
  );
}
