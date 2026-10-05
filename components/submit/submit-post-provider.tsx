"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

interface SubmitVideoContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openSubmit: () => void;
}

const SubmitVideoContext = createContext<SubmitVideoContextValue | null>(null);

/** Lets any component open the Submit Video dialog. */
export function SubmitVideoProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(
    () => ({ open, setOpen, openSubmit: () => setOpen(true) }),
    [open],
  );
  return (
    <SubmitVideoContext.Provider value={value}>
      {children}
    </SubmitVideoContext.Provider>
  );
}

export function useSubmitVideo(): SubmitVideoContextValue {
  const context = useContext(SubmitVideoContext);
  if (!context)
    throw new Error("useSubmitVideo must be used inside <SubmitVideoProvider>");
  return context;
}
