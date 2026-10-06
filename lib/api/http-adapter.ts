import { request } from "./http-client";
import type {
  AdminPostDetail,
  AdminPostsResponse,
  ApiAdapter,
  BulkModerationResult,
  ChallengeWindow,
  LeaderboardResponse,
  Me,
  MyPostsResponse,
  Post,
  Round,
  RoundsResponse,
  SyncRun,
  SyncStatusResponse,
} from "./types";

const postPath = (postId: string) => `/posts/${encodeURIComponent(postId)}`;
const adminPostPath = (postId: string) =>
  `/admin/posts/${encodeURIComponent(postId)}`;

/** "all" means no filter, so it's left out of the query string. */
const filter = (value: string) => (value === "all" ? undefined : value);

/** Talks to the real backend at NEXT_PUBLIC_API_BASE_URL. See API_CONTRACT.md. */
export const httpAdapter: ApiAdapter = {
  getCurrentUser: ({ signal } = {}) => request<Me>("/me", { signal }),

  getLeaderboard: (query, { signal } = {}) =>
    request<LeaderboardResponse>("/leaderboard", {
      query: {
        category: query.category,
        platform: query.platform,
        period: query.period,
        round: query.round,
        search: query.search.trim(),
      },
      signal,
    }),

  getMyPosts: ({ signal } = {}) =>
    request<MyPostsResponse>("/me/posts", { signal }),

  getEmployeePosts: (employeeId, query, { signal } = {}) =>
    request<Post[]>(`/employees/${encodeURIComponent(employeeId)}/posts`, {
      query: {
        category: query.category,
        platform: query.platform,
        period: query.period,
        round: query.round,
      },
      signal,
    }),

  submitPost: (payload, { signal } = {}) =>
    request<Post>("/posts", { method: "POST", body: payload, signal }),

  withdrawPost: (postId, { signal } = {}) =>
    request<void>(postPath(postId), { method: "DELETE", signal }),

  recheckPost: (postId, { signal } = {}) =>
    request<void>(`${postPath(postId)}/recheck`, { method: "POST", signal }),

  getAdminPosts: (query, cursor, { signal } = {}) =>
    request<AdminPostsResponse>("/admin/posts", {
      query: {
        status: query.status,
        check: filter(query.check),
        flag: filter(query.flag),
        category: filter(query.category),
        platform: filter(query.platform),
        q: query.q.trim(),
        cursor,
      },
      signal,
    }),

  getAdminPost: (postId, { signal } = {}) =>
    request<AdminPostDetail>(adminPostPath(postId), { signal }),

  updateAdminPost: (postId, patch, { signal } = {}) =>
    request<AdminPostDetail>(adminPostPath(postId), {
      method: "PATCH",
      body: patch,
      signal,
    }),

  moderatePost: (postId, action, payload, { signal } = {}) =>
    request<AdminPostDetail>(`${adminPostPath(postId)}/${action}`, {
      method: "POST",
      body: payload,
      signal,
    }),

  bulkModerate: (payload, { signal } = {}) =>
    request<BulkModerationResult>("/admin/posts/bulk", {
      method: "POST",
      body: payload,
      signal,
    }),

  refreshPost: (postId, { signal } = {}) =>
    request<void>(`${adminPostPath(postId)}/refresh`, {
      method: "POST",
      signal,
    }),

  deleteAdminPost: (postId, { signal } = {}) =>
    request<void>(adminPostPath(postId), { method: "DELETE", signal }),

  getSyncStatus: ({ signal } = {}) =>
    request<SyncStatusResponse>("/admin/sync", { signal }),

  startSync: ({ signal } = {}) =>
    request<SyncRun>("/admin/sync", { method: "POST", signal }),

  exportStandings: (query, { signal } = {}) =>
    request<Blob>("/admin/export", {
      query: {
        category: query.category,
        period: query.period,
        round: query.round,
        periodStart: query.periodStart,
        asOf: query.asOf,
      },
      responseType: "blob",
      signal,
    }),

  getRounds: ({ signal } = {}) =>
    request<RoundsResponse>("/rounds", { signal }),

  createRound: (input, { signal } = {}) =>
    request<Round>("/admin/rounds", { method: "POST", body: input, signal }),

  updateRound: (roundId, patch, { signal } = {}) =>
    request<Round>(`/admin/rounds/${encodeURIComponent(roundId)}`, {
      method: "PATCH",
      body: patch,
      signal,
    }),

  deleteRound: (roundId, { signal } = {}) =>
    request<void>(`/admin/rounds/${encodeURIComponent(roundId)}`, {
      method: "DELETE",
      signal,
    }),

  generateRounds: (kind, { signal } = {}) =>
    request<RoundsResponse>("/admin/rounds/generate", {
      method: "POST",
      body: { kind },
      signal,
    }),

  updateChallenge: (input, { signal } = {}) =>
    request<ChallengeWindow>("/admin/challenge", {
      method: "PUT",
      body: input,
      signal,
    }),
};
