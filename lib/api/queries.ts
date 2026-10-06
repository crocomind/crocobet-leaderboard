"use client";

import {
  keepPreviousData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import {
  bulkModerate,
  createRound,
  deleteRound,
  generateRounds,
  getRounds,
  updateChallenge,
  updateRound,
  exportStandings,
  getAdminPost,
  getAdminPosts,
  getCurrentUser,
  getEmployeePosts,
  getLeaderboard,
  getMyPosts,
  getSyncStatus,
  moderatePost,
  recheckPost,
  refreshPost,
  deleteAdminPost,
  startSync,
  submitPost,
  updateAdminPost,
  withdrawPost,
} from "@/lib/api";
import type {
  AdminAction,
  AdminPostDetail,
  AdminPostPatch,
  AdminPostsQuery,
  BulkModerationPayload,
  EmployeePostsQuery,
  ExportQuery,
  LeaderboardQuery,
  ModerationPayload,
  ChallengeInput,
  PostCheck,
  RoundInput,
  RoundKind,
  RoundPatch,
  SubmitPostPayload,
} from "@/lib/api/types";
import { syncInProgress } from "@/lib/api/sync-status";

export const queryKeys = {
  currentUser: ["me"] as const,
  myPosts: ["me", "posts"] as const,
  leaderboardAll: ["leaderboard"] as const,
  leaderboard: (query: LeaderboardQuery) => ["leaderboard", query] as const,
  employeesAll: ["employees"] as const,
  employeePosts: (employeeId: string, query: EmployeePostsQuery) =>
    ["employees", employeeId, "posts", query] as const,
  adminAll: ["admin"] as const,
  adminPosts: (query: AdminPostsQuery) => ["admin", "posts", query] as const,
  adminPost: (postId: string) => ["admin", "post", postId] as const,
  syncStatus: ["admin", "sync"] as const,
  rounds: ["rounds"] as const,
};

/**
 * Metrics refresh twice a day on the backend, and every change made in the
 * app invalidates what it touches, so boards stay fresh for a while.
 */
const STATS_STALE_MS = 5 * 60_000;
/** Boards stay cached this long after they leave the screen, so going back is instant. */
const STATS_GC_MS = 30 * 60_000;
/** While a check runs, poll for its result. */
const CHECK_POLL_MS = 3_000;

const checkRunning = (check: Pick<PostCheck, "status">) =>
  check.status === "queued" || check.status === "running";

/** Checks usually finish in seconds; a stuck one waits for the next sync instead. */
const CHECK_POLL_LIMIT_MS = 2 * 60_000;
const pollingSince = new Map<string, number>();

/** Polls every few seconds while a check runs, for at most two minutes at a stretch. */
function pollWhileChecking(key: string, running: boolean): number | false {
  if (!running) {
    pollingSince.delete(key);
    return false;
  }
  const since = pollingSince.get(key) ?? Date.now();
  pollingSince.set(key, since);
  return Date.now() - since < CHECK_POLL_LIMIT_MS ? CHECK_POLL_MS : false;
}

/** Moderation and submissions change every board, My Posts and the admin lists. */
function invalidateAfterChange(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.leaderboardAll }),
    queryClient.invalidateQueries({ queryKey: queryKeys.myPosts }),
    queryClient.invalidateQueries({ queryKey: queryKeys.employeesAll }),
    queryClient.invalidateQueries({ queryKey: queryKeys.adminAll }),
  ]);
}

export function useCurrentUserQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: ({ signal }) => getCurrentUser({ signal }),
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });
}

export function useLeaderboardQuery(query: LeaderboardQuery) {
  return useQuery({
    queryKey: queryKeys.leaderboard(query),
    queryFn: ({ signal }) => getLeaderboard(query, { signal }),
    staleTime: STATS_STALE_MS,
    gcTime: STATS_GC_MS,
    refetchInterval: 5 * 60_000,
    // Keep showing the old list while a new filter loads, so rows can animate
    // to their new positions instead of flashing a skeleton.
    placeholderData: keepPreviousData,
  });
}

export function useMyPostsQuery() {
  return useQuery({
    queryKey: queryKeys.myPosts,
    queryFn: ({ signal }) => getMyPosts({ signal }),
    staleTime: STATS_STALE_MS,
    refetchInterval: (query) =>
      pollWhileChecking(
        "my-posts",
        query.state.data?.posts.some((post) => checkRunning(post.check)) ??
          false,
      ),
  });
}

export function useEmployeePostsQuery(
  employeeId: string | null,
  query: EmployeePostsQuery,
) {
  return useQuery({
    queryKey: queryKeys.employeePosts(employeeId ?? "", query),
    queryFn: ({ signal }) =>
      getEmployeePosts(employeeId ?? "", query, { signal }),
    enabled: employeeId !== null,
    staleTime: STATS_STALE_MS,
    gcTime: STATS_GC_MS,
  });
}

/** Loads boards in the background (cached ones are skipped), so switching to them is instant. */
export function usePrefetchBoards() {
  const queryClient = useQueryClient();
  return useCallback(
    (queries: readonly LeaderboardQuery[]) => {
      for (const query of queries)
        void queryClient.prefetchQuery({
          queryKey: queryKeys.leaderboard(query),
          queryFn: ({ signal }) => getLeaderboard(query, { signal }),
          staleTime: STATS_STALE_MS,
          gcTime: STATS_GC_MS,
        });
    },
    [queryClient],
  );
}

/** Loads an employee's counted posts before their sheet opens (on hover or focus). */
export function usePrefetchEmployeePosts() {
  const queryClient = useQueryClient();
  return useCallback(
    (employeeId: string, query: EmployeePostsQuery) =>
      void queryClient.prefetchQuery({
        queryKey: queryKeys.employeePosts(employeeId, query),
        queryFn: ({ signal }) =>
          getEmployeePosts(employeeId, query, { signal }),
        staleTime: STATS_STALE_MS,
        gcTime: STATS_GC_MS,
      }),
    [queryClient],
  );
}

export function useSubmitPostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitPostPayload) => submitPost(payload),
    onSuccess: () => {
      // A new check starts: poll for its result again.
      pollingSince.clear();
      return invalidateAfterChange(queryClient);
    },
  });
}

export function useWithdrawPostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => withdrawPost(postId),
    onSuccess: () => invalidateAfterChange(queryClient),
  });
}

export function useRecheckPostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => recheckPost(postId),
    onSuccess: () => {
      pollingSince.clear();
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.myPosts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminAll }),
      ]);
    },
  });
}

export function usePrefetchMyPosts() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.myPosts,
        queryFn: ({ signal }) => getMyPosts({ signal }),
        staleTime: STATS_STALE_MS,
      }),
    [queryClient],
  );
}

// ---------------------------------------------------------------- admin

/** What the admin queue opens with: pending posts, no filters. */
export const DEFAULT_ADMIN_QUERY: AdminPostsQuery = {
  status: "pending",
  check: "all",
  flag: "all",
  category: "all",
  platform: "all",
  q: "",
};

/** Loads the first page of the admin queue and the sync panel ahead of time. */
export function usePrefetchAdmin() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.adminPosts(DEFAULT_ADMIN_QUERY),
      queryFn: ({ pageParam, signal }) =>
        getAdminPosts(DEFAULT_ADMIN_QUERY, pageParam, { signal }),
      initialPageParam: null as string | null,
      staleTime: 15_000,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.syncStatus,
      queryFn: ({ signal }) => getSyncStatus({ signal }),
      staleTime: 15_000,
    });
  }, [queryClient]);
}

export function useAdminPostsQuery(query: AdminPostsQuery) {
  return useInfiniteQuery({
    queryKey: queryKeys.adminPosts(query),
    queryFn: ({ pageParam, signal }) =>
      getAdminPosts(query, pageParam, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useAdminPostQuery(postId: string | null) {
  return useQuery({
    queryKey: queryKeys.adminPost(postId ?? ""),
    queryFn: ({ signal }) => getAdminPost(postId ?? "", { signal }),
    enabled: postId !== null,
    refetchInterval: (query) =>
      pollWhileChecking(
        `admin-post:${postId}`,
        query.state.data ? checkRunning(query.state.data.check) : false,
      ),
  });
}

/** Admin mutations that return the updated post put it straight into the drawer's cache. */
function useAdminPostMutation<V>(
  mutationFn: (variables: V) => Promise<AdminPostDetail>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (detail) => {
      queryClient.setQueryData(queryKeys.adminPost(detail.id), detail);
      await invalidateAfterChange(queryClient);
    },
  });
}

export function useModeratePostMutation() {
  return useAdminPostMutation(
    ({
      postId,
      action,
      payload,
    }: {
      postId: string;
      action: AdminAction;
      payload: ModerationPayload;
    }) => moderatePost(postId, action, payload),
  );
}

export function useUpdateAdminPostMutation() {
  return useAdminPostMutation(
    ({ postId, patch }: { postId: string; patch: AdminPostPatch }) =>
      updateAdminPost(postId, patch),
  );
}

export function useBulkModerateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BulkModerationPayload) => bulkModerate(payload),
    onSuccess: () => invalidateAfterChange(queryClient),
  });
}

/** Removes a post entirely; every board, list and the employee's My Posts update. */
export function useDeleteAdminPostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => deleteAdminPost(postId),
    // Lists refresh in the background, so the drawer closes right away. The
    // deleted post's own detail is left out: it would only 404.
    onSuccess: (_, postId) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.leaderboardAll }),
        queryClient.invalidateQueries({ queryKey: queryKeys.myPosts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.employeesAll }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.adminAll,
          predicate: (query) =>
            !(query.queryKey[1] === "post" && query.queryKey[2] === postId),
        }),
      ]);
    },
  });
}

export function useRefreshPostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => refreshPost(postId),
    onSuccess: () => invalidateAfterChange(queryClient),
  });
}

export function useSyncStatusQuery() {
  return useQuery({
    queryKey: queryKeys.syncStatus,
    queryFn: ({ signal }) => getSyncStatus({ signal }),
    refetchInterval: (query) =>
      syncInProgress(query.state.data?.runs[0], query.state.dataUpdatedAt)
        ? 2_000
        : 60_000,
  });
}

export function useStartSyncMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startSync(),
    onSuccess: () => invalidateAfterChange(queryClient),
  });
}

export function useExportStandingsMutation() {
  return useMutation({
    mutationFn: (query: ExportQuery) => exportStandings(query),
  });
}

// ------------------------------------------------------------------ rounds

/** The challenge window and every round, for the period menu and the admin panel. */
export function useRoundsQuery() {
  return useQuery({
    queryKey: queryKeys.rounds,
    queryFn: ({ signal }) => getRounds({ signal }),
    staleTime: 5 * 60_000,
  });
}

/** Round and challenge edits change which posts every board counts. */
function useRoundsMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.rounds }),
        invalidateAfterChange(queryClient),
      ]),
  });
}

export function useCreateRoundMutation() {
  return useRoundsMutation((input: RoundInput) => createRound(input));
}

export function useUpdateRoundMutation() {
  return useRoundsMutation(
    ({ roundId, patch }: { roundId: string; patch: RoundPatch }) =>
      updateRound(roundId, patch),
  );
}

export function useDeleteRoundMutation() {
  return useRoundsMutation((roundId: string) => deleteRound(roundId));
}

export function useGenerateRoundsMutation() {
  return useRoundsMutation((kind: RoundKind) => generateRounds(kind));
}

export function useUpdateChallengeMutation() {
  return useRoundsMutation((input: ChallengeInput) => updateChallenge(input));
}
