import { describe, expect, it } from "vitest";
import { parseServerConfig } from "@/lib/server/config";
import { providerFor } from "@/lib/server/providers";

describe("providerFor", () => {
  it("uses Apify only with a token, and manual entry otherwise", () => {
    const withToken = parseServerConfig({
      POST_DATA_PROVIDER: "apify",
      APIFY_API_TOKEN: "apify_api_secret",
    });
    expect(providerFor("tiktok", withToken).id).toBe("apify");
    const withoutToken = parseServerConfig({ POST_DATA_PROVIDER: "apify" });
    expect(providerFor("tiktok", withoutToken).id).toBe("manual");
    expect(
      providerFor("tiktok", parseServerConfig({ POST_DATA_PROVIDER: "nope" }))
        .id,
    ).toBe("manual");
  });
});
