import { httpAdapter } from "./http-adapter";
import type { ApiAdapter } from "./types";

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

let adapterPromise: Promise<ApiAdapter> | undefined;

// The mock adapter is loaded lazily, so a build with mocks off doesn't ship
// the mock data.
function getAdapter(): Promise<ApiAdapter> {
  adapterPromise ??= USE_MOCKS
    ? import("./mock/adapter").then((module) => module.mockAdapter)
    : Promise.resolve(httpAdapter);
  return adapterPromise;
}

/** A function that forwards to the active adapter's method. */
function forward<K extends keyof ApiAdapter>(method: K): ApiAdapter[K] {
  return (async (...args: unknown[]) => {
    const adapter = await getAdapter();
    return (adapter[method] as (...params: unknown[]) => unknown)(...args);
  }) as ApiAdapter[K];
}

export const getCurrentUser = forward("getCurrentUser");
export const getLeaderboard = forward("getLeaderboard");
export const getMyPosts = forward("getMyPosts");
export const getEmployeePosts = forward("getEmployeePosts");
export const submitPost = forward("submitPost");
export const withdrawPost = forward("withdrawPost");
export const recheckPost = forward("recheckPost");
export const getAdminPosts = forward("getAdminPosts");
export const getAdminPost = forward("getAdminPost");
export const updateAdminPost = forward("updateAdminPost");
export const moderatePost = forward("moderatePost");
export const bulkModerate = forward("bulkModerate");
export const refreshPost = forward("refreshPost");
export const deleteAdminPost = forward("deleteAdminPost");
export const getSyncStatus = forward("getSyncStatus");
export const startSync = forward("startSync");
export const exportStandings = forward("exportStandings");
export const getRounds = forward("getRounds");
export const createRound = forward("createRound");
export const updateRound = forward("updateRound");
export const deleteRound = forward("deleteRound");
export const generateRounds = forward("generateRounds");
export const updateChallenge = forward("updateChallenge");

export * from "./types";
export { ApiError, isApiError } from "./errors";
