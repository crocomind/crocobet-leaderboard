export const LOCALES = ["en", "ka"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";

/** Language names in their own language, for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ka: "ქართული",
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/** Saved choice first, then the browser's Accept-Language, then English. */
export function resolveLocale(
  saved: string | undefined,
  acceptLanguage: string | null,
): Locale {
  if (isLocale(saved)) return saved;

  const preferences = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return {
        language: tag.toLowerCase().split("-")[0],
        weight: q ? Number(q.slice(2)) : 1,
      };
    })
    .filter((entry) => entry.language && Number.isFinite(entry.weight))
    .sort((a, b) => b.weight - a.weight);

  for (const { language } of preferences) {
    if (isLocale(language)) return language;
  }
  return DEFAULT_LOCALE;
}
