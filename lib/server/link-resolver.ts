import "server-only";
import { type Platform, PLATFORMS } from "@/lib/platforms";

/**
 * Resolves platform short links (vm.tiktok.com/…, fb.watch/…, /share/…) to
 * the post they point to. User-supplied URLs are never fetched blindly:
 *  - at most 5 redirects, followed by hand (redirect: "manual");
 *  - every hop must be https on the default port, on a host of that
 *    platform, and not an IP literal or localhost;
 *  - 5 seconds in total, and response bodies are never read.
 */

export const MAX_REDIRECTS = 5;
export const RESOLVE_TIMEOUT_MS = 5_000;

export type ResolveFailure =
  "blocked" | "timeout" | "too_many_redirects" | "http_error";

export type ResolveResult =
  { ok: true; url: string } | { ok: false; reason: ResolveFailure };

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Is this URL safe to request while resolving a link for `platform`? */
export function isAllowedHop(url: URL, platform: Platform): boolean {
  if (url.protocol !== "https:") return false;
  if (url.port !== "" && url.port !== "443") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // IPv6 literals keep their brackets in URL.hostname.
  if (IPV4.test(host) || host.includes(":") || host.startsWith("["))
    return false;
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  const bare = host.replace(/^(www|m|web|mobile)\./, "");
  return PLATFORMS[platform].hosts.includes(bare);
}

export async function resolveShortLink(
  url: string,
  platform: Platform,
  {
    fetchImpl = fetch,
    timeoutMs = RESOLVE_TIMEOUT_MS,
  }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<ResolveResult> {
  const signal = AbortSignal.timeout(timeoutMs);
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return { ok: false, reason: "blocked" };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedHop(current, platform))
      return { ok: false, reason: "blocked" };
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: {
          accept: "text/html",
          "user-agent": "Mozilla/5.0 (compatible; CrocoCreators/1.0)",
        },
      });
    } catch {
      return { ok: false, reason: signal.aborted ? "timeout" : "http_error" };
    }
    // Headers only: drop the body without reading it.
    void response.body?.cancel().catch(() => {});

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: "http_error" };
      try {
        current = new URL(location, current);
      } catch {
        return { ok: false, reason: "blocked" };
      }
      continue;
    }
    if (response.ok) return { ok: true, url: current.href };
    return { ok: false, reason: "http_error" };
  }
  return { ok: false, reason: "too_many_redirects" };
}
