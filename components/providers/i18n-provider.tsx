"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { type Dictionary, dictionaries } from "@/lib/i18n/dictionaries";
import {
  createFormatters,
  type Formatters,
  interpolate,
} from "@/lib/i18n/format";

interface I18nContextValue extends Formatters {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
  /** Fills {placeholders} in a dictionary string. */
  format: typeof interpolate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      t: dictionaries[locale],
      setLocale,
      format: interpolate,
      ...createFormatters(locale),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside <I18nProvider>");
  return context;
}
