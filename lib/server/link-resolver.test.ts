import { describe, expect, it } from "vitest";
import {
  isAllowedHop,
  MAX_REDIRECTS,
  resolveShortLink,
} from "@/lib/server/link-resolver";

/** A fake network: each URL answers with a redirect or a status. */
function network(routes: Record<string, string | number>) {
  const requested: string[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    requested.push(url);
    expect(init?.redirect).toBe("manual");
    const route = routes[url];
    if (route === undefined) return new Response(null, { status: 404 });
    if (typeof route === "number")
      return new Response("body", { status: route });
    return new Response(null, { status: 302, headers: { location: route } });
  }) as typeof fetch;
  return { fetchImpl, requested };
}

describe("isAllowedHop", () => {
  const allowed = (url: string, platform = "tiktok" as const) =>
    isAllowedHop(new URL(url), platform);

  it("allows https links on the platform's own hosts", () => {
    expect(allowed("https://vm.tiktok.com/ZMabc/")).toBe(true);
    expect(allowed("https://www.tiktok.com/@a/video/1")).toBe(true);
    expect(allowed("https://m.tiktok.com/v/1.html")).toBe(true);
  });

  it("blocks anything an attacker could aim at", () => {
    expect(allowed("http://vm.tiktok.com/ZMabc/")).toBe(false);
    expect(allowed("https://vm.tiktok.com:8443/ZMabc/")).toBe(false);
    expect(allowed("https://user:pass@vm.tiktok.com/x")).toBe(false);
    expect(allowed("https://127.0.0.1/x")).toBe(false);
    expect(allowed("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(allowed("https://[::1]/x")).toBe(false);
    expect(allowed("https://localhost/x")).toBe(false);
    expect(allowed("https://tiktok.localhost/x")).toBe(false);
    expect(allowed("https://evil.example/x")).toBe(false);
    expect(allowed("https://tiktok.com.evil.example/x")).toBe(false);
    expect(allowed("https://facebook.com/x")).toBe(false);
  });
});

describe("resolveShortLink", () => {
  it("follows redirects to the post", async () => {
    const { fetchImpl, requested } = network({
      "https://vm.tiktok.com/ZMabc/":
        "https://www.tiktok.com/@ana/video/7412345678901234567?_r=1",
      "https://www.tiktok.com/@ana/video/7412345678901234567?_r=1": 200,
    });
    expect(
      await resolveShortLink("https://vm.tiktok.com/ZMabc/", "tiktok", {
        fetchImpl,
      }),
    ).toEqual({
      ok: true,
      url: "https://www.tiktok.com/@ana/video/7412345678901234567?_r=1",
    });
    expect(requested).toHaveLength(2);
  });

  it("stops at a redirect to another host, an IP or plain http", async () => {
    for (const target of [
      "https://evil.example/steal",
      "https://10.0.0.1/admin",
      "http://www.tiktok.com/@a/video/1",
      "https://localhost:3000/api",
    ]) {
      const { fetchImpl, requested } = network({
        "https://vm.tiktok.com/ZMabc/": target,
      });
      expect(
        await resolveShortLink("https://vm.tiktok.com/ZMabc/", "tiktok", {
          fetchImpl,
        }),
      ).toEqual({ ok: false, reason: "blocked" });
      // The forbidden hop is never requested.
      expect(requested).toEqual(["https://vm.tiktok.com/ZMabc/"]);
    }
  });

  it(`gives up after ${MAX_REDIRECTS} redirects`, async () => {
    const routes: Record<string, string> = {};
    for (let i = 0; i < 10; i++)
      routes[`https://www.tiktok.com/r${i}`] =
        `https://www.tiktok.com/r${i + 1}`;
    const { fetchImpl, requested } = network(routes);
    expect(
      await resolveShortLink("https://www.tiktok.com/r0", "tiktok", {
        fetchImpl,
      }),
    ).toEqual({ ok: false, reason: "too_many_redirects" });
    expect(requested).toHaveLength(MAX_REDIRECTS + 1);
  });

  it("times out", async () => {
    const fetchImpl = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("timeout", "TimeoutError")),
        ),
      )) as typeof fetch;
    expect(
      await resolveShortLink("https://vm.tiktok.com/slow/", "tiktok", {
        fetchImpl,
        timeoutMs: 50,
      }),
    ).toEqual({ ok: false, reason: "timeout" });
  });

  it("reports HTTP errors and missing locations", async () => {
    const { fetchImpl } = network({ "https://fb.watch/abc/": 500 });
    expect(
      await resolveShortLink("https://fb.watch/abc/", "facebook", {
        fetchImpl,
      }),
    ).toEqual({ ok: false, reason: "http_error" });
  });
});
