"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

interface SubmitPostContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openSubmit: () => void;
}

const SubmitPostContext = createContext<SubmitPostContextValue | null>(null);

/** Lets any component open the Submit Post dialog. */
export function SubmitPostProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(
    () => ({ open, setOpen, openSubmit: () => setOpen(true) }),
    [open],
  );
  return (
    <SubmitPostContext.Provider value={value}>
      {children}
    </SubmitPostContext.Provider>
  );
}

export function useSubmitPost(): SubmitPostContextValue {
  const context = useContext(SubmitPostContext);
  if (!context)
    throw new Error("useSubmitPost must be used inside <SubmitPostProvider>");
  return context;
}
