import { squadTag } from "@/lib/campaign-tag";
import { weekRange, zonedToday } from "@/lib/periods";
import {
  analyzePostUrl,
  type ContentType,
  type Platform,
} from "@/lib/platforms";
import { generateRounds } from "@/lib/rounds";
import type { CheckError, ModerationReason } from "../types";
import {
  addEvent,
  CHECK_DELAY_MS,
  cronSlotsBetween,
  DAY_MS,
  fetchPost,
  HOUR_MS,
  moderate,
  runSync,
} from "./engine";
import type { MockEmployee, MockPost, MockState, ProviderTruth } from "./types";

/** Bump when the shape or the generator changes; stored mock state is then regenerated. */
export const MOCK_STATE_VERSION = 7;

/** The employee the mock backend treats as signed in. */
export const MOCK_CURRENT_USER_ID = "emp-tamar-lomidze";
/** The admin who reviewed the seeded posts. */
export const MOCK_REVIEWER_ID = "emp-mariam-chkheidze";
export const MOCK_TIMEZONE = "Asia/Tbilisi";

/** The mock challenge started this many weeks before the current week and runs 13 weeks. */
const WEEKS_BEFORE = 6;
const CHALLENGE_DAYS = 91;
/** Snapshots kept in full; older ones are thinned to one in four. */
const RECENT_SNAPSHOTS = 28;

class Random {
  private state: number;
  constructor(seed: number) {
    this.state = seed;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  chance(probability: number): boolean {
    return this.next() < probability;
  }
  between(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error("pick() needs a non-empty list");
    return item;
  }
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    let roll = this.next();
    for (const [item, weight] of items) {
      roll -= weight;
      if (roll <= 0) return item;
    }
    return items[0]![0];
  }
  gaussian(): number {
    const u = Math.max(this.next(), Number.EPSILON);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }
  chars(length: number, alphabet: string): string {
    let out = "";
    for (let i = 0; i < length; i++)
      out += alphabet[Math.floor(this.next() * alphabet.length)];
    return out;
  }
  digits(length: number): string {
    return (
      String(1 + Math.floor(this.next() * 9)) +
      this.chars(length - 1, "0123456789")
    );
  }
}

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SHORTCODE = `${ALNUM}_-`;

interface Person {
  name: string;
  department: string;
  /** How strong a creator they are; scales their numbers. */
  level: number;
}

const PEOPLE: Person[] = [
  { name: "Nino Beridze", department: "Marketing", level: 2.8 },
  { name: "Giorgi Kapanadze", department: "IT", level: 1.9 },
  { name: "Tamar Lomidze", department: "Customer Support", level: 1.1 },
  { name: "Luka Jgenti", department: "Product", level: 1.4 },
  { name: "Ana Gelashvili", department: "Marketing", level: 2.2 },
  { name: "Davit Tsiklauri", department: "Finance", level: 0.7 },
  { name: "Mariam Chkheidze", department: "HR", level: 1.2 },
  { name: "Sandro Melikidze", department: "IT", level: 1.6 },
  { name: "Salome Kiknadze", department: "Design", level: 2.0 },
  { name: "Levan Abashidze", department: "Customer Support", level: 0.9 },
  { name: "Elene Dvalishvili", department: "Marketing", level: 1.8 },
  { name: "Irakli Gogoladze", department: "Finance", level: 0.6 },
  { name: "Natia Kurdadze", department: "Product", level: 1.1 },
  { name: "Saba Mchedlishvili", department: "IT", level: 1.3 },
  { name: "Keti Bakradze", department: "Customer Support", level: 1.0 },
  { name: "Oliver Bennett", department: "Product", level: 1.5 },
  { name: "Emily Carter", department: "Marketing", level: 1.7 },
  { name: "James Whitaker", department: "IT", level: 0.8 },
  { name: "Sophie Hughes", department: "Design", level: 1.2 },
  { name: "Daniel Brooks", department: "Finance", level: 0.5 },
  { name: "Mzia Khutsishvili", department: "HR", level: 0.9 },
  { name: "Zurab Nozadze", department: "Customer Support", level: 0.7 },
  { name: "Lika Maisuradze", department: "Marketing", level: 1.0 },
  { name: "Tornike Bregvadze", department: "IT", level: 0.6 },
  { name: "Hannah Price", department: "Customer Support", level: 0.8 },
];

const slug = (text: string, separator: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(separator);

export const MOCK_EMPLOYEES: MockEmployee[] = PEOPLE.map((person) => {
  const [firstName = person.name, ...rest] = person.name.split(" ");
  return {
    id: `emp-${slug(person.name, "-")}`,
    name: person.name,
    firstName,
    lastName: rest.join(" ") || null,
    email: `${slug(person.name, ".")}@crocobet.com`,
    department: person.department,
    avatarUrl: null,
    handles: {
      instagram: slug(person.name, "."),
      tiktok: slug(person.name, "."),
      facebook: slug(person.name, "."),
      linkedin: slug(person.name, "-"),
    },
  };
});

const TITLES = [
  "A day in the life at Crocobet HQ",
  "Our support team's morning ritual",
  "Desk setup tour 2026",
  "Behind the scenes of our office makeover",
  "3 productivity tips from the IT crew",
  "Friday team lunch",
  "How we welcome new joiners",
  "Hackathon highlights",
  "Coffee machine chronicles",
  "Meet the Finance squad",
  "Team building weekend in Kakheti",
  "What our designers listen to while working",
  "Office plant of the month",
  "A quick tour of our new meeting rooms",
  "Lessons from my first 100 days",
  "Charity run with the team",
  "Celebrating 1,000 solved support tickets",
  "Our favorite lunch spots in Tbilisi",
  "ჩვენი გუნდის ერთი დღე",
  "ოფისის ახალი ინტერიერი",
  "პარასკევის განწყობა",
  "ახალი თანამშრომლების დახვედრა",
  "გუნდური ლაშქრობა ყაზბეგში",
  "ჩვენი IT გუნდის საიდუმლოებები",
  "სამუშაო დღე ჩემი თვალით",
];
const ENGLISH_TITLES = TITLES.filter((title) => /^[\x20-\x7e]+$/.test(title));

const TYPE_WEIGHTS: ReadonlyArray<readonly [ContentType, number]> = [
  ["tiktok_video", 0.21],
  ["instagram_reel", 0.2],
  ["facebook_video", 0.1],
  ["instagram_photo", 0.14],
  ["facebook_post", 0.12],
  ["linkedin_post", 0.2],
  ["tiktok_photo", 0.03],
];

/** Relative audience size and like rate per content type. */
const REACH: Record<ContentType, number> = {
  tiktok_video: 1.6,
  instagram_reel: 1.2,
  facebook_video: 0.8,
  instagram_photo: 1,
  facebook_post: 0.8,
  linkedin_post: 0.7,
  tiktok_photo: 1.2,
};
const LIKE_RATE: Partial<Record<ContentType, number>> = {
  tiktok_video: 0.075,
  tiktok_photo: 0.06,
  instagram_reel: 0.09,
  facebook_video: 0.05,
};

const NOTES: Partial<Record<ModerationReason, string>> = {
  missing_tag: "Add #CrocoBySquad to the caption and submit it again.",
  outside_challenge: "This was posted before the challenge started.",
  not_owner: "This post is from someone else's account.",
  duplicate: "It's the same video as one you already submitted.",
  unavailable: "The post is private, so we can't see its stats.",
  fake_engagement:
    "The views jumped overnight in a way that looks like bought engagement.",
  rule_violation: "The post breaks the challenge rules on brand use.",
};

interface Spec {
  contentType: ContentType;
  publishedHoursAgo: number;
  submitDelayHours: number;
  outcome: "approve" | "approve_override" | "reject" | "disqualify" | "pending";
  reason?: ModerationReason;
  note?: string;
  reviewDelayHours?: number;
  disqualifyAfterHours?: number;
  /** The tags in the caption; any but "none" passes the check. */
  tag: "both" | "hashtag" | "mention" | "none";
  error?: CheckError;
  /** The check hasn't run yet (submitted a moment ago). */
  queued?: boolean;
  title: string | null;
  level: number;
  hiddenViews?: boolean;
  /** The provider has no date, so the submitter's "posted on" date is used. */
  postedDateOnly?: boolean;
  /** A photo link that's really a video. */
  reallyVideo?: boolean;
  /** Posted from an account that isn't the employee's. */
  authorHandle?: string;
  spikeAfterHours?: number;
  loseTagAfterHours?: number;
  vanishAfterHours?: number;
  manualViews?: number;
}

/** Hand-written so the signed-in user sees every status and check result. */
const CURRENT_USER_SPECS: Spec[] = [
  {
    contentType: "tiktok_video",
    publishedHoursAgo: 50,
    submitDelayHours: 2,
    outcome: "approve",
    reviewDelayHours: 5,
    tag: "both",
    title: "Support team's morning standup",
    level: 1.1,
  },
  {
    contentType: "instagram_reel",
    publishedHoursAgo: 9 * 24,
    submitDelayHours: 3,
    outcome: "approve",
    reviewDelayHours: 8,
    tag: "both",
    title: "ჩვენი გუნდის ერთი დღე",
    level: 1.1,
  },
  {
    contentType: "linkedin_post",
    publishedHoursAgo: 12 * 24,
    submitDelayHours: 1,
    outcome: "approve",
    reviewDelayHours: 20,
    tag: "both",
    title: "What I learned in my first year at Crocobet",
    level: 1.3,
  },
  {
    contentType: "facebook_post",
    publishedHoursAgo: 26 * 24,
    submitDelayHours: 6,
    outcome: "approve",
    reviewDelayHours: 10,
    tag: "both",
    title: "Celebrating 1,000 solved support tickets",
    level: 1.1,
  },
  {
    contentType: "instagram_photo",
    publishedHoursAgo: 6,
    submitDelayHours: 1,
    outcome: "pending",
    tag: "both",
    title: "Desk setup tour 2026",
    level: 1.1,
  },
  {
    contentType: "facebook_post",
    publishedHoursAgo: 20,
    submitDelayHours: 2,
    outcome: "pending",
    tag: "none",
    title: "Office plants tour",
    level: 1.1,
  },
  {
    contentType: "facebook_video",
    publishedHoursAgo: 4,
    submitDelayHours: 1,
    outcome: "pending",
    tag: "both",
    error: "private",
    title: null,
    level: 1.1,
  },
  {
    contentType: "tiktok_video",
    publishedHoursAgo: 0.2,
    submitDelayHours: 0,
    outcome: "pending",
    tag: "both",
    queued: true,
    title: "Friday team lunch",
    level: 1.1,
  },
  {
    contentType: "tiktok_video",
    publishedHoursAgo: 30 * 24,
    submitDelayHours: 4,
    outcome: "reject",
    reason: "missing_tag",
    reviewDelayHours: 12,
    tag: "none",
    title: null,
    level: 1.1,
  },
  {
    contentType: "instagram_reel",
    publishedHoursAgo: 11 * 24,
    submitDelayHours: 2,
    outcome: "disqualify",
    reason: "fake_engagement",
    reviewDelayHours: 6,
    spikeAfterHours: 4 * 24,
    disqualifyAfterHours: 6 * 24,
    tag: "both",
    title: "Coffee machine chronicles",
    level: 1.1,
  },
];

const story = (spec: Partial<Spec> & Pick<Spec, "contentType">): Spec => ({
  publishedHoursAgo: 5 * 24,
  submitDelayHours: 2,
  outcome: "approve",
  reviewDelayHours: 6,
  tag: "both",
  title: null,
  level: 1.4,
  ...spec,
});

/** Fixed stories on top of the random posts, so the admin queue always shows every flag. */
const STORY_SPECS: Record<string, Spec[]> = {
  "emp-giorgi-kapanadze": [
    story({
      contentType: "tiktok_video",
      publishedHoursAgo: 6 * 24,
      loseTagAfterHours: 3 * 24,
      title: "3 productivity tips from the IT crew",
    }),
  ],
  "emp-sandro-melikidze": [
    story({
      contentType: "instagram_reel",
      publishedHoursAgo: 7 * 24,
      vanishAfterHours: 4 * 24,
      title: "Hackathon highlights",
    }),
  ],
  "emp-elene-dvalishvili": [
    story({
      contentType: "instagram_photo",
      publishedHoursAgo: 3 * 24,
      reallyVideo: true,
      title: "Behind the scenes of our office makeover",
    }),
  ],
  "emp-oliver-bennett": [
    story({
      contentType: "tiktok_video",
      publishedHoursAgo: 8 * 24,
      hiddenViews: true,
      manualViews: 4200,
      title: "How we welcome new joiners",
    }),
  ],
  "emp-saba-mchedlishvili": [
    story({
      contentType: "tiktok_video",
      publishedHoursAgo: 10 * 24,
      title: "Desk setup tour 2026",
    }),
    story({
      contentType: "tiktok_video",
      publishedHoursAgo: 30,
      outcome: "pending",
      authorHandle: "saba.second.account",
      title: "Friday team lunch",
    }),
  ],
  "emp-natia-kurdadze": [
    story({
      contentType: "tiktok_video",
      publishedHoursAgo: 26,
      outcome: "pending",
      // Tamar's account, already linked to Tamar.
      authorHandle: "tamar.lomidze",
      title: "Our favorite lunch spots in Tbilisi",
    }),
  ],
  "emp-keti-bakradze": [
    story({
      contentType: "facebook_post",
      publishedHoursAgo: 40,
      outcome: "pending",
      postedDateOnly: true,
      title: "Charity run with the team",
    }),
  ],
};

interface Context {
  random: Random;
  now: Date;
  campaignStart: Date;
}

function randomSpec(context: Context, person: Person): Spec {
  const { random, now, campaignStart } = context;
  const contentType = random.weighted(TYPE_WEIGHTS);
  const elapsedHours = (now.getTime() - campaignStart.getTime()) / HOUR_MS;
  const publishedHoursAgo = Math.max(
    0.5,
    random.next() ** 2.2 * (elapsedHours + 5 * 24),
  );
  const fresh = publishedHoursAgo < 48;
  const outside = publishedHoursAgo > elapsedHours;
  const isVideo =
    contentType === "tiktok_video" ||
    contentType === "tiktok_photo" ||
    contentType === "instagram_reel" ||
    contentType === "facebook_video";
  const datelessType =
    contentType === "instagram_reel" ||
    contentType === "instagram_photo" ||
    contentType === "facebook_video" ||
    contentType === "facebook_post";

  const spec: Spec = {
    contentType,
    publishedHoursAgo,
    submitDelayHours: random.between(0.2, 30),
    outcome: "approve",
    reviewDelayHours: random.between(2, 30),
    tag: random.chance(0.86)
      ? random.chance(0.88)
        ? "both"
        : random.pick(["hashtag", "mention"] as const)
      : "none",
    title: random.chance(0.85) ? random.pick(TITLES) : null,
    level: person.level,
    hiddenViews: isVideo && random.chance(0.04),
    postedDateOnly: datelessType && random.chance(0.08),
    reallyVideo:
      (contentType === "instagram_photo" || contentType === "facebook_post") &&
      random.chance(0.08),
  };

  if (outside) {
    return { ...spec, outcome: "reject", reason: "outside_challenge" };
  }
  if (random.chance(0.04)) {
    spec.error = "private";
    return fresh
      ? { ...spec, outcome: "pending" }
      : { ...spec, outcome: "reject", reason: "unavailable" };
  }
  if (spec.tag === "none") {
    if (fresh) return { ...spec, outcome: "pending" };
    return random.chance(0.8)
      ? { ...spec, outcome: "reject", reason: "missing_tag" }
      : {
          ...spec,
          outcome: "approve_override",
          note: "The tag is in the first comment, which counts.",
        };
  }
  if (fresh && random.chance(0.55)) {
    return { ...spec, outcome: "pending", queued: random.chance(0.1) };
  }

  const roll = random.next();
  const recent = publishedHoursAgo < 12 * 24;
  if (roll < 0.035 && recent && publishedHoursAgo > 72) {
    return {
      ...spec,
      outcome: "disqualify",
      reason: "fake_engagement",
      spikeAfterHours: random.between(24, 48),
      disqualifyAfterHours: random.between(50, 70),
    };
  }
  if (roll < 0.07) {
    return {
      ...spec,
      outcome: "reject",
      reason: random.pick(["not_owner", "duplicate"] as const),
      authorHandle: "someone.else",
    };
  }
  if (roll < 0.1 && recent) {
    return { ...spec, loseTagAfterHours: random.between(30, 60) };
  }
  if (roll < 0.12 && recent) {
    return { ...spec, vanishAfterHours: random.between(20, 40) };
  }
  if (spec.hiddenViews && random.chance(0.5)) {
    return { ...spec, manualViews: Math.round(random.between(800, 6000)) };
  }
  return spec;
}

function buildUrl(
  random: Random,
  employee: MockEmployee,
  contentType: ContentType,
  publishedAt: Date,
): string {
  switch (contentType) {
    case "tiktok_video": {
      // The top 32 bits of a TikTok ID are the publish time in Unix seconds.
      const id =
        (BigInt(Math.floor(publishedAt.getTime() / 1000)) << 32n) |
        BigInt(Math.floor(random.next() * 2 ** 32));
      return `https://www.tiktok.com/@${employee.handles.tiktok}/video/${id}?is_from_webapp=1`;
    }
    case "tiktok_photo": {
      const id =
        (BigInt(Math.floor(publishedAt.getTime() / 1000)) << 32n) |
        BigInt(Math.floor(random.next() * 2 ** 32));
      return `https://www.tiktok.com/@${employee.handles.tiktok}/photo/${id}`;
    }
    case "instagram_reel":
      return `https://www.instagram.com/reel/${random.chars(11, SHORTCODE)}/?igsh=${random.chars(12, ALNUM)}`;
    case "instagram_photo":
      return `https://www.instagram.com/p/${random.chars(11, SHORTCODE)}/`;
    case "facebook_video":
      return random.chance(0.5)
        ? `https://www.facebook.com/reel/${random.digits(15)}`
        : `https://www.facebook.com/watch/?v=${random.digits(15)}&ref=sharing`;
    case "facebook_post":
      return `https://www.facebook.com/${employee.handles.facebook}/posts/${random.digits(16)}`;
    case "linkedin_post": {
      // LinkedIn activity IDs carry the publish time in ms in their top bits (id >> 22).
      const id =
        (BigInt(publishedAt.getTime()) << 22n) |
        BigInt(Math.floor(random.next() * 2 ** 22));
      return `https://www.linkedin.com/posts/${employee.handles.linkedin}_${slug(random.pick(ENGLISH_TITLES), "-")}-activity-${id}-${random.chars(4, ALNUM)}?utm_source=share`;
    }
  }
}

function caption(random: Random, spec: Spec, platform: Platform): string {
  const line = spec.title ?? random.pick(TITLES);
  const squad = squadTag(platform);
  if (spec.tag === "both") return `${line}\n\n#CrocoBySquad #crocobet ${squad}`;
  if (spec.tag === "hashtag") return `${line}\n\n#CrocoBySquad #crocobet`;
  if (spec.tag === "mention") return `${line}\n\nWith ${squad}!`;
  return `${line}\n\n#crocobet #teamlife`;
}

function lifetimeMetrics(
  random: Random,
  spec: Spec,
): { views: number | null; reactions: number } {
  const reach = REACH[spec.contentType] * spec.level;
  const likeRate = LIKE_RATE[spec.contentType];
  if (likeRate !== undefined || spec.reallyVideo) {
    const views = Math.max(
      60,
      Math.round(Math.exp(7.9 + random.gaussian() * 0.8) * reach),
    );
    const reactions = Math.round(
      views * (likeRate ?? 0.06) * random.between(0.7, 1.3),
    );
    return { views: spec.hiddenViews ? null : views, reactions };
  }
  return {
    views: null,
    reactions: Math.max(
      4,
      Math.round(Math.exp(4.6 + random.gaussian() * 0.7) * reach),
    ),
  };
}

interface Scheduled {
  at: number;
  order: number;
  run: () => void;
}

/**
 * Seed data relative to `now`: a challenge that started six weeks ago, about
 * 25 employees with posts of every content type and status, and two weeks of
 * twice-daily syncs. Deterministic for a given `now`.
 */
export function createInitialState(now: Date): MockState {
  const random = new Random(20261006);
  const campaignStart = new Date(
    weekRange(now, MOCK_TIMEZONE).start.getTime() - WEEKS_BEFORE * 7 * DAY_MS,
  );
  const state: MockState = {
    version: MOCK_STATE_VERSION,
    generatedAt: now.toISOString(),
    campaign: {
      startsAt: campaignStart.toISOString(),
      endsAt: new Date(
        campaignStart.getTime() + CHALLENGE_DAYS * DAY_MS,
      ).toISOString(),
      timeZone: MOCK_TIMEZONE,
    },
    campaignSource: "default",
    rounds: [],
    exclusions: [],
    posts: [],
    socialAccounts: [],
    syncRuns: [],
    nextId: 0,
  };
  // Weekly and monthly rounds for the whole challenge, as an admin would generate them.
  const window = {
    startsAt: campaignStart,
    endsAt: new Date(state.campaign.endsAt),
    timeZone: MOCK_TIMEZONE,
  };
  state.rounds = (["week", "month"] as const).flatMap((kind) =>
    generateRounds(kind, window).map((round, index) => ({
      id: `round-${kind}-${index + 1}`,
      kind,
      name: null,
      startsAt: round.startsAt.toISOString(),
      endsAt: round.endsAt.toISOString(),
    })),
  );
  const context: Context = { random, now, campaignStart };
  const schedule: Scheduled[] = [];
  let order = 0;
  const at = (time: number, run: () => void) => {
    if (time <= now.getTime()) schedule.push({ at: time, order: order++, run });
  };

  MOCK_EMPLOYEES.forEach((employee, index) => {
    const person = PEOPLE[index]!;
    const specs =
      employee.id === MOCK_CURRENT_USER_ID
        ? CURRENT_USER_SPECS
        : [
            ...Array.from({ length: 3 + Math.floor(random.next() * 6) }, () =>
              randomSpec(context, person),
            ),
            ...(STORY_SPECS[employee.id] ?? []),
          ];

    specs.forEach((spec, postIndex) => {
      const publishedAt = new Date(
        now.getTime() - spec.publishedHoursAgo * HOUR_MS,
      );
      const submittedAt = Math.min(
        publishedAt.getTime() + spec.submitDelayHours * HOUR_MS,
        now.getTime() - (spec.queued ? 60_000 : 5 * 60_000),
      );
      const analysis = analyzePostUrl(
        buildUrl(random, employee, spec.contentType, publishedAt),
      );
      if (analysis.status !== "valid")
        throw new Error(`Mock URL is not valid: ${analysis.status}`);

      const metrics = lifetimeMetrics(random, spec);
      const truth: ProviderTruth = {
        error: spec.error ?? null,
        caption: caption(random, spec, analysis.platform),
        hashtags:
          spec.tag === "both" || spec.tag === "hashtag"
            ? ["CrocoBySquad", "crocobet"]
            : [],
        authorHandle: spec.authorHandle ?? employee.handles[analysis.platform],
        mediaKind:
          spec.reallyVideo || analysis.category === "video"
            ? "video"
            : random.pick(["image", "carousel"] as const),
        publishedAt: spec.postedDateOnly ? null : publishedAt.toISOString(),
        lifetimeViews: metrics.views,
        lifetimeReactions: metrics.reactions,
        growthDays: random.between(1.5, 4.5),
        growthFrom: publishedAt.toISOString(),
      };

      const post: MockPost = {
        id: `post-${employee.id.slice(4)}-${postIndex + 1}`,
        employeeId: employee.id,
        url: analysis.normalizedUrl,
        platform: analysis.platform,
        contentType: analysis.contentType,
        externalId: analysis.externalId,
        title: spec.title,
        caption: null,
        authorHandle: null,
        authorName: null,
        publishedAt: null,
        publishedAtSource: null,
        submittedPostedAt: spec.postedDateOnly
          ? zonedToday(publishedAt, MOCK_TIMEZONE)
          : null,
        submittedAt: new Date(submittedAt).toISOString(),
        status: "pending",
        statusReason: null,
        statusNote: null,
        reviewedBy: null,
        reviewedAt: null,
        approvedAt: null,
        check: {
          status: "queued",
          tagFound: null,
          matched: [],
          authorHandle: null,
          ownerMatch: null,
          publishedInWindow: null,
          error: null,
          checkedAt: null,
        },
        checkDueAt: spec.queued
          ? new Date(now.getTime() + 20_000).toISOString()
          : null,
        lastRecheckAt: null,
        views: null,
        reactions: 0,
        metricsSource: "provider",
        metricsLocked: false,
        metricsUpdatedAt: null,
        flags: [],
        consecutiveFetchFailures: 0,
        thumbnailUrl: null,
        snapshots: [],
        events: [],
        truth,
      };
      state.posts.push(post);

      at(submittedAt, () =>
        addEvent(state, post, new Date(submittedAt), employee.id, "submitted"),
      );
      if (spec.queued) return;
      const checkAt = submittedAt + CHECK_DELAY_MS;
      at(checkAt, () =>
        fetchPost(state, post, new Date(checkAt), { logCheck: true }),
      );

      const growthStart = publishedAt.getTime();
      if (spec.spikeAfterHours !== undefined)
        at(growthStart + spec.spikeAfterHours * HOUR_MS, () => {
          if (truth.lifetimeViews !== null) truth.lifetimeViews *= 9;
          truth.lifetimeReactions *= 9;
        });
      if (spec.loseTagAfterHours !== undefined)
        at(growthStart + spec.loseTagAfterHours * HOUR_MS, () => {
          truth.caption = (spec.title ?? "Office life") + "\n\n#crocobet";
          truth.hashtags = ["crocobet"];
        });
      if (spec.vanishAfterHours !== undefined)
        at(growthStart + spec.vanishAfterHours * HOUR_MS, () => {
          truth.error = "not_found";
        });

      if (spec.outcome === "pending") return;
      const reviewAt = submittedAt + (spec.reviewDelayHours ?? 6) * HOUR_MS;
      const reviewNote =
        spec.note ?? (spec.reason ? (NOTES[spec.reason] ?? null) : null);
      at(reviewAt, () => {
        const when = new Date(reviewAt);
        if (spec.outcome === "reject") {
          moderate(
            state,
            post,
            "reject",
            MOCK_REVIEWER_ID,
            { reason: spec.reason, note: reviewNote ?? undefined },
            when,
          );
          return;
        }
        moderate(
          state,
          post,
          "approve",
          MOCK_REVIEWER_ID,
          spec.outcome === "approve_override"
            ? { note: reviewNote ?? undefined }
            : {},
          when,
        );
      });
      if (spec.manualViews !== undefined) {
        const enteredAt = reviewAt + 2 * HOUR_MS;
        at(enteredAt, () => {
          post.views = spec.manualViews!;
          post.metricsLocked = true;
          post.metricsSource = "manual";
          post.metricsUpdatedAt = new Date(enteredAt).toISOString();
          post.snapshots.push({
            fetchedAt: new Date(enteredAt).toISOString(),
            views: post.views,
            reactions: post.reactions,
            source: "manual",
          });
          addEvent(
            state,
            post,
            new Date(enteredAt),
            MOCK_REVIEWER_ID,
            "edit_metrics",
            null,
            "Views copied from the creator's TikTok analytics screenshot.",
          );
        });
      }
      if (spec.outcome === "disqualify") {
        const disqualifyAt =
          growthStart + (spec.disqualifyAfterHours ?? 72) * HOUR_MS;
        at(disqualifyAt, () =>
          moderate(
            state,
            post,
            "disqualify",
            MOCK_REVIEWER_ID,
            { reason: spec.reason, note: reviewNote ?? undefined },
            new Date(disqualifyAt),
          ),
        );
      }
    });
  });

  for (const slot of cronSlotsBetween(
    new Date(campaignStart.getTime() - 7 * DAY_MS),
    now,
  )) {
    at(slot.getTime(), () => runSync(state, slot, "cron"));
  }

  schedule
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .forEach((item) => item.run());

  // Keeps the stored state small: the first snapshot, one in four of the
  // older ones, and the recent ones in full.
  for (const post of state.posts) {
    const cut = post.snapshots.length - RECENT_SNAPSHOTS;
    if (cut > 1)
      post.snapshots = post.snapshots.filter(
        (snapshot, index) =>
          index === 0 ||
          index >= cut ||
          snapshot.source === "manual" ||
          index % 4 === 0,
      );
  }
  return state;
}
