"use client";

import { createContext, type ReactNode, useContext } from "react";
import { type Dictionary, dictionary } from "@/lib/i18n/dictionaries";
import {
  createFormatters,
  type Formatters,
  interpolate,
} from "@/lib/i18n/format";

interface I18nContextValue extends Formatters {
  t: Dictionary;
  /** Fills {placeholders} in a dictionary string. */
  format: typeof interpolate;
}

/** The UI strings and formatters (English only), the same for every render. */
const VALUE: I18nContextValue = {
  t: dictionary,
  format: interpolate,
  ...createFormatters(),
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nContext.Provider value={VALUE}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside <I18nProvider>");
  return context;
}
