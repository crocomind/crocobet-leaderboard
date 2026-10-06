"use client";

import {
  ArrowUpRight,
  Lock,
  RefreshCw,
  ScanSearch,
  Trash2,
} from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import {
  AdminActions,
  type OnAdminAction,
} from "@/components/admin/admin-actions";
import {
  CheckBadge,
  CheckEvidence,
  FlagBadges,
} from "@/components/admin/evidence";
import { MetricSparklines } from "@/components/admin/sparkline";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Crossfade } from "@/components/common/crossfade";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { PlatformBadge } from "@/components/common/platform-badge";
import { ErrorState } from "@/components/common/state-panel";
import { StatusBadge } from "@/components/my-posts/post-card";
import { useI18n } from "@/components/providers/i18n-provider";
import { ChipGroup } from "@/components/ui/chip-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MotionButton, MotionLinkButton } from "@/components/ui/motion-button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useAdminPostQuery,
  useRecheckPostMutation,
  useDeleteAdminPostMutation,
  useRefreshPostMutation,
  useUpdateAdminPostMutation,
} from "@/lib/api/queries";
import type {
  AdminPostDetail,
  AdminPostPatch,
  ContentType,
} from "@/lib/api/types";
import { NOTE_MAX_LENGTH } from "@/lib/moderation";
import {
  categoryOf,
  CONTENT_TYPE_INFO,
  CONTENT_TYPES,
  safeExternalUrl,
} from "@/lib/platforms";
import { cn, fromLocalDateTimeInput, toLocalDateTimeInput } from "@/lib/utils";

interface PostReviewDrawerProps {
  postId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: OnAdminAction;
  onMessage: (text: string, tone?: "success" | "error") => void;
  busy: boolean;
}

/** Everything about one post, with the moderation actions and manual overrides. */
export function PostReviewDrawer({
  postId,
  open,
  onOpenChange,
  ...props
}: PostReviewDrawerProps) {
  const { t } = useI18n();
  const detail = useAdminPostQuery(postId);

  return (
    <ResponsiveDialog
      open={open && postId !== null}
      onOpenChange={onOpenChange}
      variant="side"
      className="md:w-[min(calc(100vw-1.5rem),34rem)]"
    >
      <Crossfade
        className="flex min-h-0 flex-1 flex-col"
        stateKey={detail.data ? "detail" : detail.isError ? "error" : "loading"}
      >
        {detail.data ? (
          <DrawerContent
            post={detail.data}
            onClose={() => onOpenChange(false)}
            {...props}
          />
        ) : detail.isError ? (
          <div className="p-6">
            <ResponsiveDialogTitle className="sr-only">
              {t.admin.drawer.label}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="sr-only">
              {t.admin.error}
            </ResponsiveDialogDescription>
            <ErrorState
              title={t.admin.error}
              description={t.leaderboard.error.description}
              retryLabel={t.common.retry}
              onRetry={() => void detail.refetch()}
              retrying={detail.isFetching}
            />
          </div>
        ) : (
          <div aria-busy="true" className="flex flex-col gap-4 p-6">
            <ResponsiveDialogTitle className="sr-only">
              {t.admin.drawer.label}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="sr-only">
              {t.leaderboard.updating}
            </ResponsiveDialogDescription>
            <div className="flex items-center gap-3">
              <Skeleton className="size-14 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40 rounded-md" />
                <Skeleton className="h-3 w-56 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-24 w-full rounded-control" />
            <Skeleton className="h-40 w-full rounded-control" />
          </div>
        )}
      </Crossfade>
    </ResponsiveDialog>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-t border-border pt-5", className)}>
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The caption with the matched tag or mention highlighted. */
function HighlightedCaption({
  caption,
  matched,
}: {
  caption: string;
  matched: readonly string[];
}) {
  const tokens = matched.filter(Boolean).map(escapeRegExp);
  if (tokens.length === 0)
    return <p className="text-sm whitespace-pre-line">{caption}</p>;
  const pattern = new RegExp(`(${tokens.join("|")})`, "giu");
  return (
    <p className="text-sm whitespace-pre-line">
      {caption.split(pattern).map((part, index) =>
        index % 2 === 1 ? (
          <mark
            key={index}
            className="rounded-md bg-brand/20 px-1 font-semibold text-brand-text"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </p>
  );
}

function DrawerContent({
  post,
  onAction,
  onMessage,
  onClose,
  busy,
}: Omit<PostReviewDrawerProps, "postId" | "open" | "onOpenChange"> & {
  post: AdminPostDetail;
  onClose: () => void;
}) {
  const { t, format, formatDate, formatDateTime, formatNumber } = useI18n();
  const refresh = useRefreshPostMutation();
  const recheck = useRecheckPostMutation();
  const remove = useDeleteAdminPostMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const href = safeExternalUrl(post.url);
  const video = post.category === "video";

  const eventLabel = (action: string) => {
    if (action.startsWith("flag:")) {
      const flag = action.slice(5) as keyof typeof t.admin.flags;
      return format(t.admin.events.flag, {
        flag: t.admin.flags[flag] ?? flag,
      });
    }
    return t.admin.events[action as keyof typeof t.admin.events] ?? action;
  };

  return (
    <>
      <div className="flex items-start gap-3 px-5 pt-4 pb-4 md:px-6 md:pt-6">
        <EmployeeAvatar employee={post.employee} size="lg" />
        <div className="min-w-0 flex-1 pt-0.5">
          <ResponsiveDialogTitle className="truncate">
            {post.employee.name}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            <span className="block truncate">{post.employee.email}</span>
            {post.employee.department && (
              <span className="block truncate">{post.employee.department}</span>
            )}
          </ResponsiveDialogDescription>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={post.status} />
            <CheckBadge check={post.check} />
          </div>
        </div>
        <ResponsiveDialogClose label={t.common.close} className="-mt-1 -mr-2" />
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 pb-8 md:px-6">
        <div className="rounded-control border border-border bg-surface/70 p-3.5">
          <div className="flex items-start gap-3">
            <PlatformBadge platform={post.platform} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {t.contentTypes[post.contentType]}
              </p>
              <p className="truncate text-sm">
                {post.title ?? t.common.untitled}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {format(t.admin.drawer.submitted, {
                  date: formatDateTime(post.submittedAt),
                })}
                {post.reviewedBy && post.reviewedAt && (
                  <>
                    {" · "}
                    {format(t.admin.drawer.reviewed, {
                      name: post.reviewedBy.name,
                      date: formatDateTime(post.reviewedAt),
                    })}
                  </>
                )}
              </p>
            </div>
            {href && (
              <MotionLinkButton
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="sm"
              >
                {t.common.openPost}
                <ArrowUpRight aria-hidden="true" />
                <span className="sr-only">({t.common.opensInNewTab})</span>
              </MotionLinkButton>
            )}
          </div>
          {post.statusReason && (
            <p className="mt-3 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs">
              <span className="font-semibold text-danger-text">
                {t.reasons[post.statusReason]}
              </span>
              {post.statusNote && <> · {post.statusNote}</>}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <AdminActions post={post} onAction={onAction} busy={busy} />
          <MotionButton
            variant="ghost"
            size="sm"
            loading={refresh.isPending}
            onClick={() =>
              refresh.mutate(post.id, {
                onSuccess: () => onMessage(t.admin.toasts.refresh),
                onError: () => onMessage(t.admin.toasts.error, "error"),
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            {t.admin.actions.refresh}
          </MotionButton>
          {post.status === "pending" && (
            <MotionButton
              variant="ghost"
              size="sm"
              loading={recheck.isPending}
              disabled={
                post.check.status === "queued" ||
                post.check.status === "running"
              }
              onClick={() =>
                recheck.mutate(post.id, {
                  onSuccess: () => onMessage(t.admin.toasts.recheck),
                  onError: () => onMessage(t.admin.toasts.error, "error"),
                })
              }
            >
              <ScanSearch aria-hidden="true" />
              {t.admin.actions.recheck}
            </MotionButton>
          )}
          <MotionButton
            variant="ghost"
            size="sm"
            className="text-danger-text hover:bg-danger/12"
            onClick={() => {
              remove.reset();
              setConfirmDelete(true);
            }}
          >
            <Trash2 aria-hidden="true" />
            {t.admin.actions.delete}
          </MotionButton>
        </div>

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t.admin.drawer.deleteTitle}
          description={
            <>
              {t.admin.drawer.deleteDescription}
              {remove.isError && (
                <span role="alert" className="mt-2 block text-danger-text">
                  {t.admin.toasts.error}
                </span>
              )}
            </>
          }
          confirmLabel={t.admin.actions.delete}
          destructive
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(post.id, {
              onSuccess: () => {
                setConfirmDelete(false);
                onClose();
                onMessage(t.admin.toasts.deleted);
              },
            })
          }
        />

        <Section title={t.admin.columns.evidence} className="border-t-0 pt-0">
          <CheckEvidence check={post.check} />
          <FlagBadges flags={post.flags} className="mt-3" />
        </Section>

        <Section title={t.admin.drawer.caption}>
          {post.caption ? (
            <HighlightedCaption
              caption={post.caption}
              matched={post.check.matched}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t.admin.drawer.noCaption}
            </p>
          )}
        </Section>

        <Section title={t.admin.drawer.author}>
          <p className="text-sm">
            {post.check.authorHandle ? (
              <span className="font-semibold">@{post.check.authorHandle}</span>
            ) : (
              <span className="text-muted-foreground">
                {t.admin.drawer.authorUnknown}
              </span>
            )}
            {post.authorName && (
              <span className="text-muted-foreground">
                {" "}
                · {post.authorName}
              </span>
            )}
          </p>
        </Section>

        <Section title={t.admin.columns.metrics}>
          <dl className="grid grid-cols-3 gap-2">
            <Metric label={t.metrics.score} highlight>
              {formatNumber(post.score)}
            </Metric>
            <Metric label={t.metrics.views}>
              {video
                ? post.views === null
                  ? "—"
                  : formatNumber(post.views)
                : "—"}
            </Metric>
            <Metric label={t.metrics.reactions}>
              {formatNumber(post.reactions)}
            </Metric>
          </dl>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {post.metricsLocked && (
              <span className="inline-flex items-center gap-1 font-semibold text-warning-text">
                <Lock className="size-3" aria-hidden="true" />
                {t.admin.drawer.locked}
              </span>
            )}
            <span>{t.admin.drawer.source[post.metricsSource]}</span>
            <span>
              {post.metricsUpdatedAt
                ? format(t.admin.updated, {
                    time: formatDateTime(post.metricsUpdatedAt),
                  })
                : t.admin.notFetched}
            </span>
            <span>· {t.metrics.formula[post.category]}</span>
          </p>
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t.admin.drawer.history}
            </p>
            {post.snapshots.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t.admin.drawer.noHistory}
              </p>
            ) : (
              <MetricSparklines snapshots={post.snapshots} showViews={video} />
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {t.admin.columns.published}:{" "}
            <span className="font-medium text-foreground">
              {post.publishedAt
                ? formatDate(post.publishedAt)
                : t.admin.publishedUnknown}
            </span>
            {post.publishedAtSource && (
              <> ({t.admin.drawer.publishedSource[post.publishedAtSource]})</>
            )}
          </p>
        </Section>

        <Section title={t.admin.drawer.edit}>
          {/* Remounts with fresh values whenever an editable value changes. */}
          <EditForm
            key={[
              post.id,
              post.views,
              post.reactions,
              post.metricsLocked,
              post.publishedAt,
              post.contentType,
            ].join(":")}
            post={post}
            onMessage={onMessage}
          />
        </Section>

        <Section title={t.admin.drawer.audit}>
          <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
            {post.events.map((event) => (
              <li key={event.id} className="relative text-sm">
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-border-strong"
                />
                <p className="font-medium">{eventLabel(event.action)}</p>
                <p className="text-xs text-muted-foreground">
                  {event.actor?.name ?? t.common.system} ·{" "}
                  <time dateTime={event.at}>{formatDateTime(event.at)}</time>
                  {event.reason && <> · {t.admin.reasonLabels[event.reason]}</>}
                </p>
                {event.note && (
                  <p className="mt-1 rounded-lg bg-hover px-2.5 py-1.5 text-xs">
                    {event.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}

function Metric({
  label,
  highlight,
  children,
}: {
  label: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-control border p-2.5",
        highlight ? "border-brand/35 bg-brand/8" : "border-border",
      )}
    >
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-bold tabular-nums">{children}</dd>
    </div>
  );
}

const parseCount = (value: string): number | null => {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : Number.NaN;
};

/** Manual overrides: numbers (with the lock), publish date and content type. */
function EditForm({
  post,
  onMessage,
}: {
  post: AdminPostDetail;
  onMessage: (text: string, tone?: "success" | "error") => void;
}) {
  const { t } = useI18n();
  const ids = useId();
  const update = useUpdateAdminPostMutation();
  const [views, setViews] = useState(post.views?.toString() ?? "");
  const [reactions, setReactions] = useState(String(post.reactions));
  const [locked, setLocked] = useState(post.metricsLocked);
  const [publishedAt, setPublishedAt] = useState(
    post.publishedAt ? toLocalDateTimeInput(post.publishedAt) : "",
  );
  const [contentType, setContentType] = useState<ContentType>(post.contentType);
  const [note, setNote] = useState("");
  const [invalid, setInvalid] = useState(false);

  const sameTypes = CONTENT_TYPES.filter(
    (type) => CONTENT_TYPE_INFO[type].platform === post.platform,
  );
  const video = categoryOf(contentType) === "video";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const patch: AdminPostPatch = {};
    const nextViews = video ? parseCount(views) : null;
    const nextReactions = parseCount(reactions);
    if (
      Number.isNaN(nextViews) ||
      nextReactions === null ||
      Number.isNaN(nextReactions)
    )
      return setInvalid(true);
    setInvalid(false);

    if (contentType !== post.contentType) patch.contentType = contentType;
    if (video && nextViews !== post.views) patch.views = nextViews;
    if (nextReactions !== post.reactions) patch.reactions = nextReactions;
    if (locked !== post.metricsLocked) patch.metricsLocked = locked;
    // The input has minute precision, so compare what it shows, not the instant.
    const shownBefore = post.publishedAt
      ? toLocalDateTimeInput(post.publishedAt)
      : "";
    const iso = publishedAt ? fromLocalDateTimeInput(publishedAt) : null;
    if (iso && publishedAt !== shownBefore) patch.publishedAt = iso;
    if (Object.keys(patch).length === 0)
      return onMessage(t.admin.drawer.noChanges);
    if (note.trim()) patch.note = note.trim();

    // A save remounts this form (see its key), so per-call mutate callbacks
    // wouldn't run; the promise always settles.
    update.mutateAsync({ postId: post.id, patch }).then(
      () => onMessage(t.admin.toasts.saved),
      () => onMessage(t.admin.toasts.error, "error"),
    );
  };

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {sameTypes.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            {t.admin.drawer.contentType}
          </legend>
          <ChipGroup
            label={t.admin.drawer.contentType}
            value={contentType}
            onValueChange={setContentType}
            options={sameTypes.map((type) => ({
              value: type,
              label: t.contentTypes[type],
            }))}
            className="flex-wrap [&>button]:h-9"
          />
        </fieldset>
      )}
      <div className="grid grid-cols-2 gap-3">
        {video && (
          <div>
            <Label htmlFor={`${ids}-views`} className="mb-1.5 block">
              {t.metrics.views}
            </Label>
            <Input
              id={`${ids}-views`}
              inputMode="numeric"
              value={views}
              onChange={(event) => setViews(event.target.value)}
              aria-invalid={invalid || undefined}
              className="h-10"
            />
          </div>
        )}
        <div>
          <Label htmlFor={`${ids}-reactions`} className="mb-1.5 block">
            {t.metrics.reactions}
          </Label>
          <Input
            id={`${ids}-reactions`}
            inputMode="numeric"
            value={reactions}
            onChange={(event) => setReactions(event.target.value)}
            aria-invalid={invalid || undefined}
            className="h-10"
          />
        </div>
      </div>
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={locked}
          onChange={(event) => setLocked(event.target.checked)}
          className="mt-0.5 size-4 accent-brand"
        />
        {t.admin.drawer.lock}
      </label>
      <div>
        <Label htmlFor={`${ids}-published`} className="mb-1.5 block">
          {t.admin.drawer.publishedAt}
        </Label>
        <Input
          id={`${ids}-published`}
          type="datetime-local"
          value={publishedAt}
          max={toLocalDateTimeInput(new Date())}
          onChange={(event) => setPublishedAt(event.target.value)}
          className="h-10"
        />
      </div>
      <div>
        <Label htmlFor={`${ids}-note`} className="mb-1.5 block">
          {t.admin.drawer.editNote}{" "}
          <span className="font-normal text-muted-foreground">
            ({t.submit.optional})
          </span>
        </Label>
        <Textarea
          id={`${ids}-note`}
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          onChange={(event) => setNote(event.target.value)}
          className="min-h-16"
        />
      </div>
      <MotionButton
        type="submit"
        variant="secondary"
        loading={update.isPending}
        className="self-start"
      >
        {t.admin.drawer.saveChanges}
      </MotionButton>
    </form>
  );
}
