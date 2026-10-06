/**
 * Employee names are always shown in English (Latin letters), whatever the
 * UI language. The directory can hold a name in Georgian; then the Latin
 * spelling is used if there is one, otherwise the Georgian is romanized.
 */

const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/;

/** The national romanization, without the apostrophes, as names are usually written in English. */
const LATIN: Record<string, string> = {
  ა: "a",
  ბ: "b",
  გ: "g",
  დ: "d",
  ე: "e",
  ვ: "v",
  ზ: "z",
  თ: "t",
  ი: "i",
  კ: "k",
  ლ: "l",
  მ: "m",
  ნ: "n",
  ო: "o",
  პ: "p",
  ჟ: "zh",
  რ: "r",
  ს: "s",
  ტ: "t",
  უ: "u",
  ფ: "p",
  ქ: "k",
  ღ: "gh",
  ყ: "q",
  შ: "sh",
  ჩ: "ch",
  ც: "ts",
  ძ: "dz",
  წ: "ts",
  ჭ: "ch",
  ხ: "kh",
  ჯ: "j",
  ჰ: "h",
};

export function hasGeorgian(text: string): boolean {
  return GEORGIAN.test(text);
}

/** "თამარ ლომიძე" → "Tamar Lomidze". Latin text is returned as it is. */
export function romanize(text: string): string {
  if (!hasGeorgian(text)) return text;
  const latin = [...text]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      // Mtavruli capitals (Ა…) map onto the ordinary letters (ა…).
      const letter =
        code >= 0x1c90 && code <= 0x1cbf
          ? String.fromCodePoint(code - 0x1c90 + 0x10d0)
          : char;
      return LATIN[letter] ?? letter;
    })
    .join("");
  return latin.replace(
    /(^|[\s\-'’])(\p{Ll})/gu,
    (_, before: string, first: string) => before + first.toUpperCase(),
  );
}

/** The first name already in Latin letters; otherwise the first one, romanized. */
export function englishName(
  ...candidates: (string | null | undefined)[]
): string {
  const names = candidates
    .map((candidate) => candidate?.trim())
    .filter((candidate): candidate is string => Boolean(candidate));
  return names.find((name) => !hasGeorgian(name)) ?? romanize(names[0] ?? "");
}
