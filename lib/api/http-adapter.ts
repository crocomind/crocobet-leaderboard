import { request } from "./http-client";
import type {
  ApiAdapter,
  Employee,
  LeaderboardResponse,
  MyVideosResponse,
  Video,
} from "./types";

/** Talks to the real backend at NEXT_PUBLIC_API_BASE_URL. See API_CONTRACT.md. */
export const httpAdapter: ApiAdapter = {
  getLeaderboard: (query, { signal } = {}) =>
    request<LeaderboardResponse>("/leaderboard", {
      query: {
        metric: query.metric,
        platform: query.platform,
        period: query.period,
        search: query.search.trim(),
      },
      signal,
    }),

  getMyVideos: ({ signal } = {}) =>
    request<MyVideosResponse>("/me/videos", { signal }),

  getEmployeeVideos: (employeeId, query, { signal } = {}) =>
    request<Video[]>(`/employees/${encodeURIComponent(employeeId)}/videos`, {
      query: { platform: query.platform, period: query.period },
      signal,
    }),

  submitVideo: (payload, { signal } = {}) =>
    request<Video>("/videos", { method: "POST", body: payload, signal }),

  getCurrentUser: ({ signal } = {}) => request<Employee>("/me", { signal }),
};
