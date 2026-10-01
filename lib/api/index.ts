import { httpAdapter } from "./http-adapter";
import type {
  ApiAdapter,
  EmployeeVideosQuery,
  LeaderboardQuery,
  RequestOptions,
  SubmitVideoPayload,
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

export async function getMyVideos(options?: RequestOptions) {
  return (await getAdapter()).getMyVideos(options);
}

export async function getEmployeeVideos(
  employeeId: string,
  query: EmployeeVideosQuery,
  options?: RequestOptions,
) {
  return (await getAdapter()).getEmployeeVideos(employeeId, query, options);
}

export async function submitVideo(
  payload: SubmitVideoPayload,
  options?: RequestOptions,
) {
  return (await getAdapter()).submitVideo(payload, options);
}

export async function getCurrentUser(options?: RequestOptions) {
  return (await getAdapter()).getCurrentUser(options);
}

export * from "./types";
export { ApiError, isApiError } from "./errors";
