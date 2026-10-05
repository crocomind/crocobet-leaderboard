import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  assertSameOrigin,
  handle,
  HttpError,
  parseBody,
  parseQuery,
  safeEqual,
} from "@/lib/server/http";

const post = (headers: Record<string, string> = {}, body?: string) =>
  new Request("https://leaderboard.example/api/v1/posts", {
    method: "POST",
    headers,
    body,
  });

describe("assertSameOrigin", () => {
  it("accepts the app's own origin and refuses the rest", () => {
    expect(() =>
      assertSameOrigin(post({ origin: "https://leaderboard.example" })),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(post({ origin: "https://evil.example" })),
    ).toThrow(HttpError);
    expect(() => assertSameOrigin(post())).toThrow(HttpError);
  });
});

describe("handle", () => {
  it("turns errors into the error envelope", async () => {
    const known = await handle(async () => {
      throw new HttpError(409, "duplicate_post", "Already there");
    });
    expect(known.status).toBe(409);
    expect(await known.json()).toEqual({
      error: { code: "duplicate_post", message: "Already there" },
    });

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const unknown = await handle(async () => {
      throw new Error("database exploded: password=secret");
    });
    expect(unknown.status).toBe(500);
    expect(JSON.stringify(await unknown.json())).not.toContain("secret");
    spy.mockRestore();
  });
});

describe("parsing", () => {
  const schema = z.object({ url: z.string().min(1) });

  it("validates JSON bodies and query strings", async () => {
    await expect(parseBody(post({}, '{"url":"x"}'), schema)).resolves.toEqual({
      url: "x",
    });
    await expect(parseBody(post({}, "not json"), schema)).rejects.toMatchObject(
      {
        status: 400,
        code: "validation_error",
      },
    );
    await expect(parseBody(post({}, "{}"), schema)).rejects.toMatchObject({
      status: 400,
    });
    expect(
      parseQuery(
        new Request("https://x.example/?category=video"),
        z.object({ category: z.enum(["video", "static"]) }),
      ),
    ).toEqual({ category: "video" });
    expect(() =>
      parseQuery(
        new Request("https://x.example/?category=audio"),
        z.object({ category: z.enum(["video", "static"]) }),
      ),
    ).toThrow(HttpError);
  });
});

describe("safeEqual", () => {
  it("compares secrets", () => {
    expect(safeEqual("a-long-secret", "a-long-secret")).toBe(true);
    expect(safeEqual("a-long-secret", "a-long-secreT")).toBe(false);
    expect(safeEqual("short", "a-long-secret")).toBe(false);
  });
});
