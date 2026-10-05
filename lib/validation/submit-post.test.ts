import { describe, expect, it } from "vitest";
import {
  createSubmitPostSchema,
  type SubmitPostFormValues,
  TITLE_MAX_LENGTH,
} from "@/lib/validation/submit-post";

const TODAY = "2026-10-01";
const schema = createSubmitPostSchema({ today: () => TODAY });

const base: SubmitPostFormValues = {
  url: "https://www.tiktok.com/@nino.beridze/video/7412345678901234567",
  title: "",
  postedAt: "",
};

/** The error code for one field, or undefined if it passes. */
function errorFor(
  values: Partial<SubmitPostFormValues>,
  field: keyof SubmitPostFormValues,
  testSchema = schema,
) {
  const result = testSchema.safeParse({ ...base, ...values });
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("submit post schema: url", () => {
  it.each([
    "https://www.instagram.com/reel/C8xYz12AbCd/",
    "https://www.facebook.com/watch/?v=1234567890123456",
    "https://vm.tiktok.com/ZMabc123/",
    "https://www.linkedin.com/feed/update/urn:li:ugcPost:7212345678901234567",
  ])("accepts a supported post link: %s", (url) => {
    expect(errorFor({ url }, "url")).toBeUndefined();
  });

  it("requires a link", () => {
    expect(errorFor({ url: "" }, "url")).toBe("required");
    expect(errorFor({ url: "   " }, "url")).toBe("required");
  });

  it("rejects text that isn't a link", () => {
    expect(errorFor({ url: "my latest post" }, "url")).toBe("invalidUrl");
  });

  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://x.com/crocobet/status/1",
  ])("rejects unsupported platforms: %s", (url) => {
    expect(errorFor({ url }, "url")).toBe("unsupportedPlatform");
  });

  it.each([
    "https://www.instagram.com/nino.beridze/",
    "https://www.facebook.com/CrocobetOfficial",
    "https://www.tiktok.com/@nino.beridze",
    "https://www.linkedin.com/in/nino-beridze/",
  ])("rejects profile and feed links on supported platforms: %s", (url) => {
    expect(errorFor({ url }, "url")).toBe("notAPost");
  });

  it("rejects duplicates by normalized URL, whatever the variant", () => {
    const submitted = new Set([
      "https://tiktok.com/@nino.beridze/video/7412345678901234567",
    ]);
    const withHistory = createSubmitPostSchema({
      today: () => TODAY,
      isDuplicate: (url) => submitted.has(url),
    });

    for (const url of [
      "https://www.tiktok.com/@nino.beridze/video/7412345678901234567",
      "https://m.tiktok.com/@nino.beridze/video/7412345678901234567/?is_from_webapp=1",
    ]) {
      expect(errorFor({ url }, "url", withHistory)).toBe("duplicate");
    }
    expect(
      errorFor(
        {
          url: "https://www.tiktok.com/@nino.beridze/video/7412345678901234568",
        },
        "url",
        withHistory,
      ),
    ).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    const result = schema.parse({ ...base, url: `  ${base.url}  ` });
    expect(result.url).toBe(base.url);
  });
});

describe("submit post schema: optional fields", () => {
  it("accepts empty optional fields", () => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it("limits the title length", () => {
    expect(
      errorFor({ title: "a".repeat(TITLE_MAX_LENGTH) }, "title"),
    ).toBeUndefined();
    expect(errorFor({ title: "a".repeat(TITLE_MAX_LENGTH + 1) }, "title")).toBe(
      "titleTooLong",
    );
  });

  it("trims the title", () => {
    expect(schema.parse({ ...base, title: "  Team day  " }).title).toBe(
      "Team day",
    );
  });

  it("accepts past dates and today", () => {
    expect(errorFor({ postedAt: "2026-09-15" }, "postedAt")).toBeUndefined();
    expect(errorFor({ postedAt: TODAY }, "postedAt")).toBeUndefined();
  });

  it("rejects future dates", () => {
    expect(errorFor({ postedAt: "2026-10-02" }, "postedAt")).toBe(
      "dateInFuture",
    );
  });

  it.each(["2026-02-30", "2026-13-01", "01/10/2026", "yesterday"])(
    "rejects invalid dates: %s",
    (postedAt) => {
      expect(errorFor({ postedAt }, "postedAt")).toBe("dateInvalid");
    },
  );
});
