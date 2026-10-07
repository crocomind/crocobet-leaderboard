import { describe, expect, it } from "vitest";
import {
  DEFAULT_URL_STATE,
  parseUrlState,
  serializeUrlState,
} from "@/lib/url-state";

const parse = (query: string) => parseUrlState(new URLSearchParams(query));

describe("parseUrlState", () => {
  it("falls back to the defaults", () => {
    expect(parse("")).toEqual(DEFAULT_URL_STATE);
    expect(
      parse("view=nope&category=audio&period=year&platform=myspace"),
    ).toEqual(DEFAULT_URL_STATE);
  });

  it("reads the category, views and filters", () => {
    expect(
      parse("view=admin&category=static&platform=linkedin&period=all&q=nino"),
    ).toEqual({
      view: "admin",
      category: "static",
      platform: "linkedin",
      period: "all",
      round: "",
      q: "nino",
      employee: "",
    });
  });

  it("opens old links: my-videos, and the ignored metric parameter", () => {
    expect(parse("view=my-videos&metric=reactions")).toEqual({
      ...DEFAULT_URL_STATE,
      view: "my-posts",
    });
  });

  it("drops a platform that isn't on the board", () => {
    expect(parse("category=video&platform=linkedin").platform).toBe("all");
    expect(parse("category=static&platform=tiktok").platform).toBe("all");
    expect(parse("category=static&platform=facebook").platform).toBe(
      "facebook",
    );
  });
});

describe("rounds in the URL", () => {
  it("keeps a round for weekly and monthly boards only", () => {
    expect(parse("period=week&round=round-week-3")).toMatchObject({
      period: "week",
      round: "round-week-3",
    });
    expect(parse("period=all&round=round-week-3").round).toBe("");
    expect(parse("period=week&round=<script>").round).toBe("");
    expect(
      serializeUrlState({ ...DEFAULT_URL_STATE, period: "week", round: "r1" }),
    ).toBe("?period=week&round=r1");
  });
});

describe("serializeUrlState", () => {
  it("leaves defaults out and round-trips", () => {
    expect(serializeUrlState(DEFAULT_URL_STATE)).toBe("");
    const state = {
      ...DEFAULT_URL_STATE,
      category: "static" as const,
      platform: "instagram" as const,
      q: " ana ",
    };
    const query = serializeUrlState(state);
    expect(query).toBe("?category=static&platform=instagram&q=ana");
    expect(parse(query.slice(1))).toEqual({ ...state, q: "ana" });
  });
});

describe("profiles in the URL", () => {
  it("keeps whose profile only on the profile view", () => {
    expect(parse("view=profile&employee=e-12")).toMatchObject({
      view: "profile",
      employee: "e-12",
    });
    expect(parse("view=profile&employee=<b>").employee).toBe("");
    expect(
      serializeUrlState({
        ...DEFAULT_URL_STATE,
        view: "profile",
        employee: "e-12",
      }),
    ).toBe("?view=profile&employee=e-12");
    expect(serializeUrlState({ ...DEFAULT_URL_STATE, employee: "e-12" })).toBe(
      "",
    );
  });
});
