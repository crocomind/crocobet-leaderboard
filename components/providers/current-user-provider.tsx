"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Employee } from "@/lib/api/types";
import { useCurrentUserQuery } from "@/lib/api/queries";
import type { SessionUser } from "@/lib/auth/types";

export type CurrentUserState =
  | { status: "signed-out"; user: null }
  | { status: "signed-in"; user: Employee };

const CurrentUserContext = createContext<CurrentUserState | null>(null);

/**
 * The single source of "who is signed in". Components read the user only
 * through useCurrentUser().
 *
 * Identity (name, email) comes from the Microsoft sign-in session, which the
 * server passes in, so it's available on first render with no loading state.
 * The employee record from GET /me adds the business ID and department when
 * the API has them. If /me fails, the user stays signed in with their session
 * identity.
 */
export function CurrentUserProvider({
  sessionUser,
  children,
}: {
  sessionUser: SessionUser | null;
  children: ReactNode;
}) {
  const { data: employee } = useCurrentUserQuery(sessionUser !== null);

  const value = useMemo<CurrentUserState>(() => {
    if (!sessionUser) return { status: "signed-out", user: null };
    return {
      status: "signed-in",
      user: {
        id: employee?.id ?? sessionUser.id,
        name: sessionUser.name,
        email: sessionUser.email,
        department: employee?.department ?? "",
        avatarUrl: employee?.avatarUrl ?? sessionUser.image,
      },
    };
  }, [sessionUser, employee]);

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
