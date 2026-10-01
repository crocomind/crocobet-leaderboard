"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Employee } from "@/lib/api/types";
import { useCurrentUserQuery } from "@/lib/api/queries";

export type CurrentUserState =
  | { status: "loading"; user: null; error: null; refetch: () => void }
  | { status: "error"; user: null; error: Error; refetch: () => void }
  | { status: "success"; user: Employee; error: null; refetch: () => void };

const CurrentUserContext = createContext<CurrentUserState | null>(null);

/**
 * The single source of "who is signed in". Components read the user through
 * useCurrentUser() only, so adding real authentication later means changing
 * this provider (and getAuthHeaders in lib/api/http-client.ts) and nothing else.
 *
 * Today the user comes from GET /me (mocked by getCurrentUser()).
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { data, error, status, refetch } = useCurrentUserQuery();

  const value = useMemo<CurrentUserState>(() => {
    const retry = () => void refetch();
    if (status === "success")
      return { status, user: data, error: null, refetch: retry };
    if (status === "error")
      return { status, user: null, error, refetch: retry };
    return { status: "loading", user: null, error: null, refetch: retry };
  }, [data, error, status, refetch]);

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUserState {
  const context = useContext(CurrentUserContext);
  if (!context)
    throw new Error("useCurrentUser must be used inside <CurrentUserProvider>");
  return context;
}
