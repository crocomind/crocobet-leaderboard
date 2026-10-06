import { ApiError } from "../errors";
import type { ApiAdapter, EmployeeRole, RequestOptions } from "../types";
import { MockBackend } from "./backend";
import {
  createInitialState,
  MOCK_CURRENT_USER_ID,
  MOCK_STATE_VERSION,
} from "./data";
import type { MockState } from "./types";

const STORAGE_KEY = "croco-creators.mock-state";
const LEGACY_STORAGE_KEY = "croco-creators.mock-submissions";
/** Stored mock data older than this is regenerated around the current date. */
const MAX_STATE_AGE_MS = 3 * 86_400_000;

/** Share of mock requests that fail, so error states can be seen. 0 turns it off. */
const ERROR_RATE = (() => {
  const value = Number(process.env.NEXT_PUBLIC_MOCK_ERROR_RATE);
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0.05;
})();

/** NEXT_PUBLIC_MOCK_ROLE=admin|employee. Default: admin in development. */
const MOCK_ROLE: EmployeeRole = (() => {
  const role = process.env.NEXT_PUBLIC_MOCK_ROLE;
  if (role === "admin" || role === "employee") return role;
  return process.env.NODE_ENV === "development" ? "admin" : "employee";
})();

function loadState(now: Date): MockState {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as MockState) : null;
    if (
      stored?.version === MOCK_STATE_VERSION &&
      now.getTime() - Date.parse(stored.generatedAt) < MAX_STATE_AGE_MS
    )
      return stored;
  } catch {
    // No storage (private mode, tests) or unreadable data: start fresh.
  }
  return createInitialState(now);
}

function saveState(state: MockState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore; the in-memory copy still works for this session.
  }
}

let backend: MockBackend | undefined;

function getBackend(now: Date): MockBackend {
  backend ??= new MockBackend(loadState(now), {
    id: MOCK_CURRENT_USER_ID,
    role: MOCK_ROLE,
  });
  return backend;
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

/**
 * Simulates latency and the occasional failure, runs the request against the
 * mock backend (which throws ApiErrors like the real one) and returns a copy.
 */
async function respond<T>(
  produce: (mock: MockBackend, now: Date) => T,
  { signal }: RequestOptions = {},
  { mutates = false } = {},
): Promise<T> {
  await sleep(300 + Math.random() * 500, signal);
  if (Math.random() < ERROR_RATE) {
    throw new ApiError({
      status: 503,
      code: "service_unavailable",
      message: "Simulated network error (mock API)",
    });
  }
  const now = new Date();
  const mock = getBackend(now);
  const settled = mock.settle(now);
  try {
    return structuredClone(produce(mock, now));
  } finally {
    if (mutates || settled) saveState(mock.state);
  }
}

export const mockAdapter: ApiAdapter = {
  getCurrentUser: (options) =>
    respond((mock) => mock.getCurrentUser(), options),
  getLeaderboard: (query, options) =>
    respond((mock, now) => mock.getLeaderboard(query, now), options),
  getMyPosts: (options) =>
    respond((mock, now) => mock.getMyPosts(now), options),
  getEmployeePosts: (employeeId, query, options) =>
    respond(
      (mock, now) => mock.getEmployeePosts(employeeId, query, now),
      options,
    ),
  submitPost: (payload, options) =>
    respond((mock, now) => mock.submitPost(payload, now), options, {
      mutates: true,
    }),
  withdrawPost: (postId, options) =>
    respond((mock) => mock.withdrawPost(postId), options, { mutates: true }),
  recheckPost: (postId, options) =>
    respond((mock, now) => mock.recheckPost(postId, now), options, {
      mutates: true,
    }),

  getAdminPosts: (query, cursor, options) =>
    respond((mock) => mock.getAdminPosts(query, cursor), options),
  getAdminPost: (postId, options) =>
    respond((mock) => mock.getAdminPost(postId), options),
  updateAdminPost: (postId, patch, options) =>
    respond((mock, now) => mock.updateAdminPost(postId, patch, now), options, {
      mutates: true,
    }),
  moderatePost: (postId, action, payload, options) =>
    respond(
      (mock, now) => mock.moderatePost(postId, action, payload, now),
      options,
      { mutates: true },
    ),
  bulkModerate: (payload, options) =>
    respond((mock, now) => mock.bulkModerate(payload, now), options, {
      mutates: true,
    }),
  deleteAdminPost: (postId, options) =>
    respond((mock) => mock.deleteAdminPost(postId), options, {
      mutates: true,
    }),
  refreshPost: (postId, options) =>
    respond((mock, now) => mock.refreshPost(postId, now), options, {
      mutates: true,
    }),
  getSyncStatus: (options) => respond((mock) => mock.getSyncStatus(), options),
  startSync: (options) =>
    respond((mock, now) => mock.startSync(now), options, { mutates: true }),
  exportStandings: (query, options) =>
    respond(
      (mock, now) =>
        new Blob([mock.exportStandings(query, now)], {
          type: "text/csv;charset=utf-8",
        }),
      options,
    ),

  getRounds: (options) => respond((mock) => mock.getRounds(), options),
  createRound: (input, options) =>
    respond((mock) => mock.createRound(input), options, { mutates: true }),
  updateRound: (roundId, patch, options) =>
    respond((mock) => mock.updateRound(roundId, patch), options, {
      mutates: true,
    }),
  deleteRound: (roundId, options) =>
    respond((mock) => mock.deleteRound(roundId), options, { mutates: true }),
  generateRounds: (kind, options) =>
    respond((mock) => mock.generateRounds(kind), options, { mutates: true }),
  updateChallenge: (input, options) =>
    respond((mock) => mock.updateChallenge(input), options, { mutates: true }),
};
