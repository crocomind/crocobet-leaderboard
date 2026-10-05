import { describe, expect, it, vi } from "vitest";
import { analyzePostUrl } from "@/lib/platforms";
import type { PostRef } from "@/lib/post-data";
import facebook from "./__fixtures__/facebook.json";
import instagram from "./__fixtures__/instagram.json";
import linkedin from "./__fixtures__/linkedin.json";
import tiktok from "./__fixtures__/tiktok.json";
import { createApifyProvider, URLS_PER_RUN } from "./index";

/** A ref as the app stores it: the normalized link and its post ID. */
function ref(url: string): PostRef {
  const analysis = analyzePostUrl(url);
  if (analysis.status !== "valid") throw new Error(`bad url ${url}`);
  return {
    platform: analysis.platform,
    contentType: analysis.contentType,
    url: analysis.normalizedUrl,
    externalId: analysis.externalId,
  };
}

const DATASETS: Record<string, unknown[]> = {
  "clockworks~tiktok-video-scraper": tiktok,
  "apify~instagram-scraper": instagram,
  "apify~facebook-posts-scraper": facebook,
  "harvestapi~linkedin-profile-posts": linkedin,
};

interface Call {
  actor: string;
  url: URL;
  headers: Headers;
  input: Record<string, unknown>;
}

/** Fake Apify: answers each actor with its fixture dataset, or a given status. */
function fakeApify(status: Record<string, number> = {}) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(
    async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      const actor = decodeURIComponent(url.pathname.split("/")[3] ?? "");
      calls.push({
        actor,
        url,
        headers: new Headers(init?.headers),
        input: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      const code = status[actor] ?? 201;
      return code >= 400
        ? new Response('{"error":{"type":"x"}}', { status: code })
        : Response.json(DATASETS[actor] ?? [], { status: code });
    },
  );
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const refs = {
  tiktok: ref(
    "https://www.tiktok.com/@gretalynnhihi/video/7543693751290481942",
  ),
  tiktokGone: ref("https://www.tiktok.com/@someone/video/7400000000000000001"),
  reel: ref("https://www.instagram.com/reel/DZN3mhZBQ_Q/"),
  photo: ref("https://instagram.com/p/Photo123AbC"),
  missing: ref("https://www.instagram.com/p/Missing0000/"),
  facebook: ref("https://www.facebook.com/reel/895509256298494"),
  linkedin: ref(
    "https://www.linkedin.com/posts/williamhgates_childhood-activity-7329207003942125568-_gfJ",
  ),
};

const signal = new AbortController().signal;

describe("Apify provider", () => {
  it("runs one capped run per platform and matches results back to posts", async () => {
    const apify = fakeApify();
    const provider = createApifyProvider({
      token: "apify_api_secret",
      maxChargeUsd: 0.75,
      fetchImpl: apify.fetchImpl,
    });
    const outcomes = await provider.fetchMany(Object.values(refs), { signal });

    expect(apify.calls.map((call) => call.actor).sort()).toEqual(
      Object.keys(DATASETS).sort(),
    );
    for (const call of apify.calls) {
      expect(call.headers.get("authorization")).toBe("Bearer apify_api_secret");
      expect(call.url.search).not.toContain("secret");
      expect(call.url.pathname).toMatch(/\/run-sync-get-dataset-items$/);
      expect(call.url.searchParams.get("maxTotalChargeUsd")).toBe("0.75");
      expect(call.url.searchParams.get("timeout")).toBe("240");
    }
    const instagramCall = apify.calls.find(
      (call) => call.actor === "apify~instagram-scraper",
    )!;
    expect(
      apify.calls.map((call) => [
        call.actor,
        call.url.searchParams.get("memory"),
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["clockworks~tiktok-video-scraper", "2048"],
        ["apify~instagram-scraper", "1024"],
      ]),
    );
    expect(instagramCall.input).toMatchObject({
      directUrls: [
        "https://www.instagram.com/p/DZN3mhZBQ_Q/",
        "https://www.instagram.com/p/Photo123AbC/",
        "https://www.instagram.com/p/Missing0000/",
      ],
      resultsType: "posts",
    });

    const get = (r: PostRef) => outcomes.get(r.url);
    expect(get(refs.tiktok)).toMatchObject({
      ok: true,
      post: { views: 145900 },
    });
    expect(get(refs.tiktokGone)).toMatchObject({ ok: false, error: "private" });
    expect(get(refs.reel)).toMatchObject({ ok: true, post: { views: 241820 } });
    expect(get(refs.photo)).toMatchObject({
      ok: true,
      post: { reactions: null },
    });
    // Not in the results at all.
    expect(get(refs.missing)).toMatchObject({ ok: false, error: "not_found" });
    expect(get(refs.facebook)).toMatchObject({
      ok: true,
      post: { reactions: 147 },
    });
    expect(get(refs.linkedin)).toMatchObject({
      ok: true,
      post: { reactions: 2916 },
    });
    expect(outcomes.size).toBe(Object.keys(refs).length);
  });

  it("blames failed runs on the provider, platform by platform", async () => {
    const apify = fakeApify({
      "clockworks~tiktok-video-scraper": 429,
      "apify~instagram-scraper": 402,
    });
    const outcomes = await createApifyProvider({
      token: "t",
      maxChargeUsd: 1,
      fetchImpl: apify.fetchImpl,
    }).fetchMany([refs.tiktok, refs.reel, refs.facebook], { signal });
    expect(outcomes.get(refs.tiktok.url)).toMatchObject({
      ok: false,
      error: "rate_limited",
      retryable: true,
    });
    expect(outcomes.get(refs.reel.url)).toMatchObject({
      ok: false,
      error: "provider_error",
    });
    expect(outcomes.get(refs.facebook.url)?.ok).toBe(true);
  });

  it("uses actor overrides and splits big batches into runs of 50", async () => {
    const apify = fakeApify();
    const many = Array.from({ length: URLS_PER_RUN + 5 }, (_, i) =>
      ref(
        `https://www.tiktok.com/@a/video/${7400000000000000100n + BigInt(i)}`,
      ),
    );
    await createApifyProvider({
      token: "t",
      maxChargeUsd: 1,
      actors: { tiktok: "someone~tiktok-scraper" },
      fetchImpl: apify.fetchImpl,
    }).fetchMany(many, { signal });
    expect(apify.calls.map((call) => call.actor)).toEqual([
      "someone~tiktok-scraper",
      "someone~tiktok-scraper",
    ]);
    expect(
      apify.calls.map((call) => (call.input.postURLs as string[]).length),
    ).toEqual([URLS_PER_RUN, 5]);
  });

  it("fits runs before the deadline and skips them when there's no time", async () => {
    const apify = fakeApify();
    const provider = createApifyProvider({
      token: "t",
      maxChargeUsd: 1,
      fetchImpl: apify.fetchImpl,
    });
    await provider.fetchMany([refs.linkedin], {
      signal,
      deadline: Date.now() + 100_000,
    });
    expect(
      Number(apify.calls[0]!.url.searchParams.get("timeout")),
    ).toBeLessThanOrEqual(80);

    const late = await provider.fetchMany([refs.linkedin], {
      signal,
      deadline: Date.now() + 30_000,
    });
    expect(apify.calls).toHaveLength(1);
    expect(late.get(refs.linkedin.url)).toMatchObject({
      ok: false,
      error: "provider_error",
    });
  });
});
