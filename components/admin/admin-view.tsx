"use client";

import { Download, Inbox } from "lucide-react";
import { useMemo, useState } from "react";
import type { OnAdminAction } from "@/components/admin/admin-actions";
import {
  AdminFilters,
  DEFAULT_ADMIN_FILTERS,
} from "@/components/admin/admin-filters";
import { AdminQueue } from "@/components/admin/admin-queue";
import { Toast, useToast } from "@/components/admin/admin-toast";
import { ExportDialog } from "@/components/admin/export-dialog";
import {
  type DialogAction,
  ModerationDialog,
} from "@/components/admin/moderation-dialog";
import { PostReviewDrawer } from "@/components/admin/post-review-drawer";
import { RoundsManager } from "@/components/admin/rounds-manager";
import { SyncPanel } from "@/components/admin/sync-panel";
import { Crossfade } from "@/components/common/crossfade";
import { GlowBackdrop } from "@/components/common/glow-backdrop";
import { ErrorState, StatePanel } from "@/components/common/state-panel";
import { ListSkeleton } from "@/components/leaderboard/leaderboard-skeleton";
import { useI18n } from "@/components/providers/i18n-provider";
import { ChipGroup } from "@/components/ui/chip-group";
import { MotionButton } from "@/components/ui/motion-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { isApiError } from "@/lib/api/errors";
import {
  useAdminPostsQuery,
  useBulkModerateMutation,
  useModeratePostMutation,
} from "@/lib/api/queries";
import type {
  AdminAction,
  AdminPost,
  AdminPostsQuery,
  AdminQueueTab,
  ModerationPayload,
} from "@/lib/api/types";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

const TABS: AdminQueueTab[] = [
  "pending",
  "approved",
  "rejected",
  "disqualified",
  "flagged",
];

interface PendingDialog {
  action: DialogAction;
  postIds: string[];
}

/** The admin panel (?view=admin). Loaded on demand, behind AdminGate. */
export default function AdminPanel() {
  const { t, format } = useI18n();
  const { toast, show } = useToast();

  const [section, setSection] = useState<"queue" | "leaderboards">("queue");
  const [tab, setTab] = useState<AdminQueueTab>("pending");
  const [filters, setFilters] = useState(DEFAULT_ADMIN_FILTERS);
  const [searchText, setSearchText] = useState("");
  const q = useDebouncedValue(searchText.trim(), 300);
  const query = useMemo<AdminPostsQuery>(
    () => ({ status: tab, q, ...filters }),
    [tab, q, filters],
  );
  const queue = useAdminPostsQuery(query);
  const pages = queue.data?.pages;
  const posts = useMemo(
    () => pages?.flatMap((page) => page.posts) ?? [],
    [pages],
  );
  const counts = pages?.[0]?.counts;

  // A selection belongs to one queue view; changing tab, filters or search clears it.
  const queryKey = JSON.stringify(query);
  const [selection, setSelection] = useState<{
    key: string;
    ids: ReadonlySet<string>;
  }>({ key: queryKey, ids: new Set() });
  const selected: ReadonlySet<string> =
    selection.key === queryKey ? selection.ids : new Set();
  const setSelected = (
    next:
      | ReadonlySet<string>
      | ((current: ReadonlySet<string>) => ReadonlySet<string>),
  ) =>
    setSelection((current) => {
      const base = current.key === queryKey ? current.ids : new Set<string>();
      return {
        key: queryKey,
        ids: typeof next === "function" ? next(base) : next,
      };
    });

  const [drawerPostId, setDrawerPostId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialog, setDialog] = useState<PendingDialog | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const moderate = useModeratePostMutation();
  const bulk = useBulkModerateMutation();
  const busy = moderate.isPending || bulk.isPending;

  const errorText = (error: unknown) =>
    isApiError(error) && error.code === "rate_limited"
      ? t.admin.toasts.tooSoon
      : t.admin.toasts.error;

  const runModeration = (
    action: AdminAction,
    postIds: string[],
    payload: ModerationPayload,
  ) => {
    setDialogError(null);
    if (postIds.length === 1) {
      moderate.mutate(
        { postId: postIds[0]!, action, payload },
        {
          onSuccess: () => {
            setDialog(null);
            show(t.admin.toasts[action]);
          },
          onError: (error) => {
            if (dialog) setDialogError(errorText(error));
            else show(errorText(error), "error");
          },
        },
      );
      return;
    }
    bulk.mutate(
      { ids: postIds, action, ...payload },
      {
        onSuccess: ({ results }) => {
          setDialog(null);
          setSelected(new Set());
          const ok = results.filter((result) => result.ok).length;
          show(
            format(t.admin.bulk.result, { ok, failed: results.length - ok }),
            ok > 0 ? "success" : "error",
          );
        },
        onError: (error) => {
          if (dialog) setDialogError(errorText(error));
          else show(errorText(error), "error");
        },
      },
    );
  };

  const handleAction: OnAdminAction = (action, post) => {
    if (action === "approve" || action === "reopen")
      return runModeration(action, [post.id], {});
    setDialogError(null);
    setDialog({ action, postIds: [post.id] });
  };

  const openPost = (post: AdminPost) => {
    setDrawerPostId(post.id);
    setDrawerOpen(true);
  };

  const selectedPosts = posts.filter((post) => selected.has(post.id));
  const approvable = selectedPosts.filter((post) => post.status === "pending");

  return (
    <div className="relative isolate">
      <GlowBackdrop className="-top-28 opacity-60 md:-top-36" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-balance md:text-4xl">
            {t.admin.title}
          </h1>
          <p className="mt-1.5 max-w-xl text-pretty text-muted-foreground">
            {t.admin.subtitle}
          </p>
        </div>
        <MotionButton
          variant="secondary"
          onClick={() => setExportOpen(true)}
          className="self-start sm:self-auto"
        >
          <Download aria-hidden="true" />
          {t.admin.export.button}
        </MotionButton>
      </div>

      <SegmentedControl
        label={t.admin.sections.label}
        value={section}
        onValueChange={setSection}
        options={[
          { value: "queue", label: t.admin.sections.queue },
          { value: "leaderboards", label: t.admin.sections.leaderboards },
        ]}
        className="mt-6 w-full sm:w-auto [&>button]:px-3 sm:[&>button]:px-4"
      />

      {section === "leaderboards" ? (
        <div className="mt-6">
          <RoundsManager onMessage={show} />
        </div>
      ) : (
        <>
          <SyncPanel onMessage={show} className="mt-6" />

          <div className="-mx-4 mt-6 no-scrollbar overflow-x-auto fade-x px-4 py-1 md:mx-0 md:overflow-visible md:[mask-image:none] md:px-0">
            <ChipGroup
              label={t.admin.tabsLabel}
              value={tab}
              onValueChange={setTab}
              options={TABS.map((value) => ({
                value,
                label: (
                  <>
                    {t.admin.tabs[value]}
                    {counts && (
                      <span className="rounded-full bg-hover px-1.5 py-0.5 text-xs font-semibold tabular-nums">
                        {counts[value]}
                      </span>
                    )}
                  </>
                ),
              }))}
              className="w-max"
            />
          </div>

          <div className="mt-4">
            <AdminFilters
              filters={filters}
              onChange={setFilters}
              search={searchText}
              onSearchChange={setSearchText}
            />
          </div>

          {tab === "pending" && selected.size > 0 && (
            <div
              role="region"
              aria-label={t.admin.bulk.label}
              className="sticky top-20 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-card border border-brand/40 bg-glass p-2.5 pl-4 shadow-lifted backdrop-blur-xl"
            >
              <p className="mr-auto text-sm font-semibold" aria-live="polite">
                {format(t.admin.bulk.selected, { count: selected.size })}
              </p>
              <MotionButton
                size="sm"
                disabled={approvable.length === 0 || busy}
                loading={bulk.isPending && dialog === null}
                onClick={() =>
                  runModeration(
                    "approve",
                    approvable.map((post) => post.id),
                    {},
                  )
                }
              >
                {t.admin.bulk.approve} ({approvable.length})
              </MotionButton>
              <MotionButton
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => {
                  setDialogError(null);
                  setDialog({ action: "reject", postIds: [...selected] });
                }}
              >
                {t.admin.bulk.reject}
              </MotionButton>
              <MotionButton
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                {t.admin.bulk.clear}
              </MotionButton>
            </div>
          )}

          <Crossfade
            className="mt-5"
            stateKey={
              queue.isPending
                ? "loading"
                : queue.isError && !queue.data
                  ? "error"
                  : posts.length === 0
                    ? "empty"
                    : "list"
            }
          >
            {queue.isPending ? (
              <div role="status" aria-busy="true">
                <span className="sr-only">{t.leaderboard.updating}</span>
                <ListSkeleton rows={6} />
              </div>
            ) : queue.isError && !queue.data ? (
              <ErrorState
                title={t.admin.error}
                description={t.leaderboard.error.description}
                retryLabel={t.common.retry}
                onRetry={() => void queue.refetch()}
                retrying={queue.isFetching}
              />
            ) : posts.length === 0 ? (
              <StatePanel
                role="status"
                icon={<Inbox />}
                title={t.admin.empty.title}
                description={t.admin.empty.description}
              />
            ) : (
              <div
                className={
                  queue.isPlaceholderData
                    ? "opacity-60 transition-opacity"
                    : "transition-opacity"
                }
              >
                <AdminQueue
                  posts={posts}
                  selectable={tab === "pending"}
                  selected={selected}
                  onToggle={(postId) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (!next.delete(postId)) next.add(postId);
                      return next;
                    })
                  }
                  onToggleAll={(select) =>
                    setSelected(
                      select
                        ? new Set(posts.map((post) => post.id))
                        : new Set(),
                    )
                  }
                  onOpen={openPost}
                  onAction={handleAction}
                  busy={busy}
                />
                {queue.hasNextPage && (
                  <div className="mt-5 flex justify-center">
                    <MotionButton
                      variant="secondary"
                      loading={queue.isFetchingNextPage}
                      onClick={() => void queue.fetchNextPage()}
                    >
                      {t.common.loadMore}
                    </MotionButton>
                  </div>
                )}
              </div>
            )}
          </Crossfade>
        </>
      )}

      <PostReviewDrawer
        postId={drawerPostId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onAction={handleAction}
        onMessage={show}
        busy={busy}
      />

      <ModerationDialog
        action={dialog?.action ?? null}
        count={dialog?.postIds.length ?? 0}
        pending={busy}
        error={dialogError}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onSubmit={(payload) =>
          dialog && runModeration(dialog.action, dialog.postIds, payload)
        }
      />

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <Toast toast={toast} />
    </div>
  );
}
