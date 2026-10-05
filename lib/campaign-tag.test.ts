import { describe, expect, it } from "vitest";
import {
  type CampaignTagConfig,
  checkCampaignTag,
  parseCampaignHashtags,
  parseCampaignMentions,
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

describe("hashtag", () => {
  it.each([
    "Team day! #CrocoBySquad",
    "#crocobysquad",
    "Love it #CROCOBYSQUAD!",
    "(#CrocoBySquad)",
    "#CrocoBySquad, #fun",
    "ჩვენი გუნდის ერთი დღე #CrocoBySquad 🐊",
  ])("matches %j", (caption) => {
    expect(check("tiktok", caption)).toEqual({
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
    expect(check("tiktok", caption).passed).toBe(false);
  });

  it("normalizes Unicode (NFKC), e.g. full-width letters", () => {
    expect(check("instagram", "＃ＣｒｏｃｏＢｙＳｑｕａｄ").passed).toBe(true);
  });

  it("reads the provider's structured hashtag list", () => {
    expect(
      check("instagram", null, { hashtags: ["crocobysquad"] }).passed,
    ).toBe(true);
    expect(
      check("instagram", null, { hashtags: ["#CrocoBySquad"] }).passed,
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
    expect(check("instagram", "Shot with @CrocoSquad today")).toEqual({
      passed: true,
      matched: ["@crocosquad"],
    });
    expect(check("tiktok", "thanks @croco.squad.")).toEqual({
      passed: true,
      matched: ["@croco.squad"],
    });
  });

  it("matches handles as whole tokens only", () => {
    expect(check("instagram", "@crocosquadfans").passed).toBe(false);
  });

  it("matches the provider's mentions or tagged users", () => {
    expect(check("instagram", null, { mentions: ["CrocoSquad"] }).passed).toBe(
      true,
    );
    expect(check("instagram", null, { mentions: ["@crocosquad"] }).passed).toBe(
      true,
    );
  });

  it("matches Facebook and LinkedIn page names as whole phrases", () => {
    expect(check("linkedin", "Proud to be part of Croco  Squad!")).toEqual({
      passed: true,
      matched: ["Croco Squad"],
    });
    expect(check("facebook", "croco squad ❤")).toEqual({
      passed: true,
      matched: ["Croco Squad"],
    });
    expect(check("facebook", null, { mentions: ["Croco Squad"] }).passed).toBe(
      true,
    );
  });

  it("doesn't match a page name inside a longer word", () => {
    expect(check("linkedin", "The Croco Squadron").passed).toBe(false);
  });

  it("only uses the mentions configured for that platform", () => {
    expect(check("tiktok", "Proud to be part of Croco Squad").passed).toBe(
      false,
    );
  });

  it("works with no mentions configured (hashtag only)", () => {
    const hashtagOnly: CampaignTagConfig = {
      hashtags: ["CrocoBySquad"],
      mentions: {},
    };
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
    expect(parseCampaignMentions(undefined)).toEqual({});
  });

  it("parses CAMPAIGN_HASHTAGS with a default", () => {
    expect(parseCampaignHashtags("#CrocoBySquad, CrocoSquad2026")).toEqual([
      "CrocoBySquad",
      "CrocoSquad2026",
    ]);
    expect(parseCampaignHashtags("")).toEqual(["CrocoBySquad"]);
  });
});
