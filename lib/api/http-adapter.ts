import { request } from "./http-client";
import type {
  ApiAdapter,
  Employee,
  LeaderboardResponse,
  MyPostsResponse,
  Post,
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

  getMyPosts: ({ signal } = {}) =>
    request<MyPostsResponse>("/me/posts", { signal }),

  getEmployeePosts: (employeeId, query, { signal } = {}) =>
    request<Post[]>(`/employees/${encodeURIComponent(employeeId)}/posts`, {
      query: { platform: query.platform, period: query.period },
      signal,
    }),

  submitPost: (payload, { signal } = {}) =>
    request<Post>("/posts", { method: "POST", body: payload, signal }),

  getCurrentUser: ({ signal } = {}) => request<Employee>("/me", { signal }),
};
