import { describe, expect, it } from "vitest";
import {
  type CampaignTagConfig,
  checkCampaignTag,
  DEFAULT_MENTIONS,
  parseCampaignHashtags,
  parseCampaignMentions,
  squadTag,
  tagParts,
} from "@/lib/campaign-tag";

const config: CampaignTagConfig = {
  hashtags: ["CrocoBySquad"],
  mentions: {
    instagram: ["crocosquad"],
    tiktok: ["@croco.squad"],
    facebook: ["Croco Squad"],
    linkedin: ["Croco Squad"],
  },
};
const check = (
  platform: Parameters<typeof checkCampaignTag>[0],
  caption: string | null,
  extra = {},
) => checkCampaignTag(platform, { caption, ...extra }, config);
/** Only the hashtag is required (no accounts configured). */
const hashtagOnly: CampaignTagConfig = {
  hashtags: ["CrocoBySquad"],
  mentions: {},
};
const checkHashtag = (
  platform: Parameters<typeof checkCampaignTag>[0],
  caption: string | null,
  extra = {},
) => checkCampaignTag(platform, { caption, ...extra }, hashtagOnly);

describe("the rule: the hashtag and a Croco Squad tag", () => {
  it("passes with both, and not with only one of them", () => {
    expect(
      check("instagram", "Team day #CrocoBySquad with @crocosquad"),
    ).toEqual({
      passed: true,
      matched: ["#crocobysquad", "@crocosquad"],
    });
    expect(check("instagram", "Team day #CrocoBySquad").passed).toBe(false);
    expect(check("instagram", "Team day with @crocosquad").passed).toBe(false);
  });

  it("needs only the hashtag where no account is configured", () => {
    expect(checkHashtag("instagram", "Team day #CrocoBySquad").passed).toBe(
      true,
    );
  });

  it("says which half matched", () => {
    expect(tagParts(["#crocobysquad"])).toEqual({
      hashtag: true,
      mention: false,
    });
    expect(tagParts(["Croco Squad"])).toEqual({
      hashtag: false,
      mention: true,
    });
  });

  it("knows how to tag Croco Squad on each platform", () => {
    expect(squadTag("instagram")).toBe("@croco.squad");
    expect(squadTag("tiktok")).toBe("@Croco Squad");
    expect(squadTag("linkedin")).toBe("@crocobet.com | Croco Squad");
    expect(squadTag("facebook", {})).toBeNull();
  });
});

describe("hashtag", () => {
  it.each([
    "Team day! #CrocoBySquad",
    "#crocobysquad",
    "Love it #CROCOBYSQUAD!",
    "(#CrocoBySquad)",
    "#CrocoBySquad, #fun",
    "ჩვენი გუნდის ერთი დღე #CrocoBySquad 🐊",
  ])("matches %j", (caption) => {
    expect(checkHashtag("tiktok", caption)).toEqual({
      passed: true,
      matched: ["#crocobysquad"],
    });
  });

  it.each([
    "#CrocoBySquadFun",
    "CrocoBySquad without the hash",
    "#Croco #BySquad",
    "#Croco_BySquad",
    "",
  ])("doesn't match %j", (caption) => {
    expect(checkHashtag("tiktok", caption).passed).toBe(false);
  });

  it("normalizes Unicode (NFKC), e.g. full-width letters", () => {
    expect(checkHashtag("instagram", "＃ＣｒｏｃｏＢｙＳｑｕａｄ").passed).toBe(
      true,
    );
  });

  it("reads the provider's structured hashtag list", () => {
    expect(
      checkHashtag("instagram", null, { hashtags: ["crocobysquad"] }).passed,
    ).toBe(true);
    expect(
      checkHashtag("instagram", null, { hashtags: ["#CrocoBySquad"] }).passed,
    ).toBe(true);
  });

  it("supports Georgian hashtags as whole tokens", () => {
    const georgian: CampaignTagConfig = {
      hashtags: ["კროკოსქვადი"],
      mentions: {},
    };
    expect(
      checkCampaignTag(
        "facebook",
        { caption: "#კროკოსქვადი გილოცავთ" },
        georgian,
      ).passed,
    ).toBe(true);
    expect(
      checkCampaignTag("facebook", { caption: "#კროკოსქვადისთვის" }, georgian)
        .passed,
    ).toBe(false);
  });
});

describe("mentions", () => {
  it("matches an @handle in the caption", () => {
    expect(check("instagram", "Shot with @CrocoSquad today").matched).toEqual([
      "@crocosquad",
    ]);
    expect(check("tiktok", "thanks @croco.squad.").matched).toEqual([
      "@croco.squad",
    ]);
  });

  it("matches handles as whole tokens only", () => {
    expect(check("instagram", "@crocosquadfans").matched).toEqual([]);
  });

  it("matches the provider's mentions or tagged users", () => {
    expect(
      check("instagram", null, { mentions: ["CrocoSquad"] }).matched,
    ).toEqual(["@crocosquad"]);
    expect(
      check("instagram", null, { mentions: ["@crocosquad"] }).matched,
    ).toEqual(["@crocosquad"]);
  });

  it("matches Facebook and LinkedIn page names as whole phrases", () => {
    expect(
      check("linkedin", "Proud to be part of Croco  Squad!").matched,
    ).toEqual(["Croco Squad"]);
    expect(check("facebook", "croco squad ❤").matched).toEqual(["Croco Squad"]);
    expect(
      check("facebook", null, { mentions: ["Croco Squad"] }).matched,
    ).toEqual(["Croco Squad"]);
  });

  it("doesn't match a page name inside a longer word", () => {
    expect(check("linkedin", "The Croco Squadron").matched).toEqual([]);
  });

  it("only uses the mentions configured for that platform", () => {
    expect(check("tiktok", "Proud to be part of Croco Squad").matched).toEqual(
      [],
    );
  });

  it("works with no mentions configured (hashtag only)", () => {
    expect(
      checkCampaignTag("instagram", { caption: "@crocosquad" }, hashtagOnly)
        .passed,
    ).toBe(false);
    expect(
      checkCampaignTag("instagram", { caption: "#CrocoBySquad" }, hashtagOnly)
        .passed,
    ).toBe(true);
  });
});

it("records every match", () => {
  expect(check("instagram", "#CrocoBySquad with @crocosquad").matched).toEqual([
    "#crocobysquad",
    "@crocosquad",
  ]);
});

describe("config parsing", () => {
  it("parses CAMPAIGN_MENTIONS", () => {
    expect(
      parseCampaignMentions(
        "instagram:crocosquad, tiktok:@croco.squad,facebook:Croco Squad,linkedin:Croco Squad,bogus:x,nope",
      ),
    ).toEqual({
      instagram: ["crocosquad"],
      tiktok: ["@croco.squad"],
      facebook: ["Croco Squad"],
      linkedin: ["Croco Squad"],
    });
    expect(parseCampaignMentions(" none ")).toEqual({});
  });

  it("recognizes the real Croco Squad tags by default", () => {
    const defaults = {
      hashtags: ["CrocoBySquad"],
      mentions: parseCampaignMentions(undefined),
    };
    expect(parseCampaignMentions("")).toEqual(DEFAULT_MENTIONS);
    for (const [platform, caption] of [
      ["instagram", "Office day with @croco.squad #CrocoBySquad"],
      ["tiktok", "thanks @Croco Squad! #CrocoBySquad"],
      ["facebook", "#CrocoBySquad Proud to be part of @Croco Squad."],
      ["linkedin", "Thank you crocobet.com | Croco  Squad #CrocoBySquad"],
    ] as const)
      expect(checkCampaignTag(platform, { caption }, defaults).passed).toBe(
        true,
      );
    // TikTok and Facebook report tagged accounts by display name.
    expect(
      checkCampaignTag(
        "tiktok",
        { caption: "Our day", mentions: ["crocosquad_ge", "Croco Squad"] },
        defaults,
      ).matched,
    ).toEqual(["Croco Squad"]);
    // Other accounts with similar handles don't count.
    for (const [platform, caption] of [
      ["instagram", "#CrocoBySquad @crocosquad"],
      ["instagram", "#CrocoBySquad Croco Squad vibes"],
      ["tiktok", "#CrocoBySquad @crocosquadron"],
      ["linkedin", "#CrocoBySquad The Croco Squadron"],
    ] as const)
      expect(checkCampaignTag(platform, { caption }, defaults).passed).toBe(
        false,
      );
  });

  it("parses CAMPAIGN_HASHTAGS with a default", () => {
    expect(parseCampaignHashtags("#CrocoBySquad, CrocoSquad2026")).toEqual([
      "CrocoBySquad",
      "CrocoSquad2026",
    ]);
    expect(parseCampaignHashtags("")).toEqual(["CrocoBySquad"]);
  });
});
