import { describe, expect, it } from "vitest";
import { englishName, hasGeorgian, romanize } from "@/lib/names";

describe("names", () => {
  it("romanizes Georgian names and leaves Latin ones alone", () => {
    expect(romanize("თამარ ლომიძე")).toBe("Tamar Lomidze");
    expect(romanize("ნინო ჭავჭავაძე-წერეთელი")).toBe(
      "Nino Chavchavadze-Tsereteli",
    );
    expect(romanize("ღვთისო ყიფიანი")).toBe("Ghvtiso Qipiani");
    // Mtavruli capitals.
    expect(romanize("ᲗᲐᲛᲐᲠ")).toBe("Tamar");
    expect(romanize("Ana Gelashvili")).toBe("Ana Gelashvili");
    expect(hasGeorgian("Ana")).toBe(false);
  });

  it("prefers a Latin spelling, then romanizes", () => {
    expect(englishName("თამარ ლომიძე", "Tamar Lomidze")).toBe("Tamar Lomidze");
    expect(englishName("Ana Gelashvili", "ანა")).toBe("Ana Gelashvili");
    expect(englishName(null, "  ", "გიორგი")).toBe("Giorgi");
    expect(englishName(undefined)).toBe("");
  });
});
