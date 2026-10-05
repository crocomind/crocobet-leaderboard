import { analyzePostUrl } from "@/lib/platforms";
import { normalizeForSearch } from "@/lib/utils";
import { ApiError } from "../errors";
import type {
  ApiAdapter,
  Employee,
  LeaderboardResponse,
  MyPostsResponse,
  RequestOptions,
  Post,
} from "../types";
import { MOCK_CURRENT_USER_ID, MOCK_EMPLOYEES, MOCK_POSTS } from "./data";
import { metricValue } from "@/lib/leaderboard";
import {
  countsTowardsRanking,
  periodWindow,
  previousWindow,
  rankEmployees,
} from "./ranking";

const STORAGE_KEY = "croco-creators.mock-submissions";
const SYNC_INTERVAL_MS = 10 * 60_000;

/** Share of mock requests that fail, so error states can be seen. 0 turns it off. */
const ERROR_RATE = (() => {
  const value = Number(process.env.NEXT_PUBLIC_MOCK_ERROR_RATE);
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0.05;
})();

// Submissions made in the browser, kept in localStorage so they survive reloads.
let submissions: Post[] | undefined;

function loadSubmissions(): Post[] {
  if (submissions) return submissions;
  submissions = [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) submissions = parsed as Post[];
  } catch {
    // No storage (private mode, tests); keep submissions in memory only.
  }
  return submissions;
}

function saveSubmissions(posts: Post[]) {
  submissions = posts;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  } catch {
    // Ignore; the in-memory copy still works for this session.
  }
}

function allPosts(): Post[] {
  return [...MOCK_POSTS, ...loadSubmissions()];
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(new DOMException("Request aborted", "AbortError"));
    if (signal?.aborted) return abort();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      abort();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Simulates latency and the occasional failure, then returns a copy of the result. */
async function respond<T>(
  produce: () => T,
  { signal }: RequestOptions = {},
): Promise<T> {
  await sleep(350 + Math.random() * 550, signal);
  if (Math.random() < ERROR_RATE) {
    throw new ApiError({
      status: 503,
      code: "service_unavailable",
      message: "Simulated network error (mock API)",
    });
  }
  return structuredClone(produce());
}

function currentUser(): Employee {
  const user = MOCK_EMPLOYEES.find(
    (employee) => employee.id === MOCK_CURRENT_USER_ID,
  );
  if (!user) throw new Error("Mock current user is missing");
  return user;
}

export const mockAdapter: ApiAdapter = {
  getLeaderboard: (query, options) =>
    respond((): LeaderboardResponse => {
      const now = Date.now();
      const posts = allPosts();
      const ranked = rankEmployees(MOCK_EMPLOYEES, posts, {
        metric: query.metric,
        platform: query.platform,
        window: periodWindow(query.period, now),
      });
      const previous = rankEmployees(MOCK_EMPLOYEES, posts, {
        metric: query.metric,
        platform: query.platform,
        window: previousWindow(query.period, now),
      });
      const previousRanks = new Map(
        previous.map((entry) => [entry.employee.id, entry.rank]),
      );
      const entries = ranked.map((entry) => ({
        ...entry,
        previousRank: previousRanks.get(entry.employee.id) ?? null,
      }));

      const myIndex = entries.findIndex(
        (entry) => entry.employee.id === MOCK_CURRENT_USER_ID,
      );
      const mine = entries[myIndex];
      const above = entries[myIndex - 1];
      const myStanding = mine
        ? {
            entry: mine,
            gapToNext: above
              ? metricValue(above, query.metric) -
                metricValue(mine, query.metric)
              : null,
          }
        : null;

      const search = normalizeForSearch(query.search);
      return {
        query,
        entries: search
          ? entries.filter((entry) =>
              normalizeForSearch(entry.employee.name).includes(search),
            )
          : entries,
        totalParticipants: entries.length,
        myStanding,
        lastSyncedAt: new Date(
          Math.floor(now / SYNC_INTERVAL_MS) * SYNC_INTERVAL_MS,
        ).toISOString(),
      };
    }, options),

  getMyPosts: (options) =>
    respond((): MyPostsResponse => {
      const posts = allPosts();
      const mine = posts
        .filter((post) => post.employeeId === MOCK_CURRENT_USER_ID)
        .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
      const verified = mine.filter((post) => post.status === "verified");
      const allTime = rankEmployees(MOCK_EMPLOYEES, posts, {
        metric: "score",
        platform: "all",
        window: periodWindow("all", Date.now()),
      });

      return {
        posts: mine,
        summary: {
          totalViews: verified.reduce((sum, post) => sum + post.views, 0),
          totalReactions: verified.reduce(
            (sum, post) => sum + post.reactions,
            0,
          ),
          postCount: mine.length,
          rank:
            allTime.find((entry) => entry.employee.id === MOCK_CURRENT_USER_ID)
              ?.rank ?? null,
          totalParticipants: allTime.length,
        },
      };
    }, options),

  getEmployeePosts: (employeeId, query, options) =>
    respond((): Post[] => {
      const window = periodWindow(query.period, Date.now());
      return allPosts()
        .filter(
          (post) =>
            post.employeeId === employeeId &&
            countsTowardsRanking(post, query.platform, window),
        )
        .sort((a, b) => b.views - a.views);
    }, options),

  submitPost: async (payload, options) => {
    const result = analyzePostUrl(payload.url);
    const posts = allPosts();

    // Checked before the simulated failure so these behave like real 4xx responses.
    if (result.status !== "valid" || result.platform !== payload.platform) {
      await sleep(400, options?.signal);
      throw new ApiError({
        status: 422,
        code: "validation_error",
        message: "Invalid post link",
      });
    }
    if (posts.some((post) => post.url === result.normalizedUrl)) {
      await sleep(400, options?.signal);
      throw new ApiError({
        status: 409,
        code: "duplicate_post",
        message: "This post has already been submitted",
      });
    }

    return respond((): Post => {
      const post: Post = {
        id: `vid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        employeeId: MOCK_CURRENT_USER_ID,
        url: result.normalizedUrl,
        platform: result.platform,
        title: payload.title?.trim() || null,
        postedAt: payload.postedAt ?? null,
        submittedAt: new Date().toISOString(),
        status: "pending",
        rejectionReason: null,
        views: 0,
        reactions: 0,
        thumbnailUrl: null,
      };
      saveSubmissions([...loadSubmissions(), post]);
      return post;
    }, options);
  },

  getCurrentUser: (options) => respond(currentUser, options),
};
