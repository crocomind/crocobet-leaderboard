"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getCurrentUser,
  getEmployeePosts,
  getLeaderboard,
  getMyPosts,
  submitPost,
} from "@/lib/api";
import type {
  EmployeePostsQuery,
  LeaderboardQuery,
  SubmitPostPayload,
} from "@/lib/api/types";

export const queryKeys = {
  currentUser: ["me"] as const,
  myPosts: ["me", "posts"] as const,
  leaderboardAll: ["leaderboard"] as const,
  leaderboard: (query: LeaderboardQuery) => ["leaderboard", query] as const,
  employeePosts: (employeeId: string, query: EmployeePostsQuery) =>
    ["employees", employeeId, "posts", query] as const,
};

/** Stats sync periodically on the backend; no need to refetch more often. */
const STATS_STALE_MS = 60_000;

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
  });
}

export function useSubmitPostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitPostPayload) => submitPost(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.myPosts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.leaderboardAll }),
      ]);
    },
  });
}

export function usePrefetchMyPosts() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.prefetchQuery({
      queryKey: queryKeys.myPosts,
      queryFn: ({ signal }) => getMyPosts({ signal }),
      staleTime: STATS_STALE_MS,
    });
}
