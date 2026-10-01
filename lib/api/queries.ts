"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getCurrentUser,
  getEmployeeVideos,
  getLeaderboard,
  getMyVideos,
  submitVideo,
} from "@/lib/api";
import type {
  EmployeeVideosQuery,
  LeaderboardQuery,
  SubmitVideoPayload,
} from "@/lib/api/types";

export const queryKeys = {
  currentUser: ["me"] as const,
  myVideos: ["me", "videos"] as const,
  leaderboardAll: ["leaderboard"] as const,
  leaderboard: (query: LeaderboardQuery) => ["leaderboard", query] as const,
  employeeVideos: (employeeId: string, query: EmployeeVideosQuery) =>
    ["employees", employeeId, "videos", query] as const,
};

/** Stats sync periodically on the backend; no need to refetch more often. */
const STATS_STALE_MS = 60_000;

export function useCurrentUserQuery() {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: ({ signal }) => getCurrentUser({ signal }),
    staleTime: Number.POSITIVE_INFINITY,
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

export function useMyVideosQuery() {
  return useQuery({
    queryKey: queryKeys.myVideos,
    queryFn: ({ signal }) => getMyVideos({ signal }),
    staleTime: STATS_STALE_MS,
  });
}

export function useEmployeeVideosQuery(
  employeeId: string | null,
  query: EmployeeVideosQuery,
) {
  return useQuery({
    queryKey: queryKeys.employeeVideos(employeeId ?? "", query),
    queryFn: ({ signal }) =>
      getEmployeeVideos(employeeId ?? "", query, { signal }),
    enabled: employeeId !== null,
    staleTime: STATS_STALE_MS,
  });
}

export function useSubmitVideoMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitVideoPayload) => submitVideo(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.myVideos }),
        queryClient.invalidateQueries({ queryKey: queryKeys.leaderboardAll }),
      ]);
    },
  });
}

export function usePrefetchMyVideos() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.prefetchQuery({
      queryKey: queryKeys.myVideos,
      queryFn: ({ signal }) => getMyVideos({ signal }),
      staleTime: STATS_STALE_MS,
    });
}
