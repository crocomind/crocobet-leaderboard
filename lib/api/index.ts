import { httpAdapter } from "./http-adapter";
import type {
  ApiAdapter,
  EmployeePostsQuery,
  LeaderboardQuery,
  RequestOptions,
  SubmitPostPayload,
} from "./types";

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

export async function getLeaderboard(
  query: LeaderboardQuery,
  options?: RequestOptions,
) {
  return (await getAdapter()).getLeaderboard(query, options);
}

export async function getMyPosts(options?: RequestOptions) {
  return (await getAdapter()).getMyPosts(options);
}

export async function getEmployeePosts(
  employeeId: string,
  query: EmployeePostsQuery,
  options?: RequestOptions,
) {
  return (await getAdapter()).getEmployeePosts(employeeId, query, options);
}

export async function submitPost(
  payload: SubmitPostPayload,
  options?: RequestOptions,
) {
  return (await getAdapter()).submitPost(payload, options);
}

export async function getCurrentUser(options?: RequestOptions) {
  return (await getAdapter()).getCurrentUser(options);
}

export * from "./types";
export { ApiError, isApiError } from "./errors";
