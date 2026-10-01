import { analyzeVideoUrl, type Platform } from "@/lib/platforms";
import { toIsoDate } from "@/lib/utils";
import type { Employee, Video, VideoStatus } from "../types";

/** The employee the mock backend treats as signed in. */
export const MOCK_CURRENT_USER_ID = "emp-tamar-lomidze";

export const DAY_MS = 86_400_000;

// Seeded PRNG so the mock data is identical on every load.
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261001);

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error("pick() needs a non-empty list");
  return item;
}

function gaussian(): number {
  const u = Math.max(rand(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function randomId(length: number, alphabet: string): string {
  let out = "";
  for (let i = 0; i < length; i++)
    out += alphabet[Math.floor(rand() * alphabet.length)];
  return out;
}

const digits = (length: number) =>
  String(1 + Math.floor(rand() * 9)) + randomId(length - 1, "0123456789");
const shortcode = (length: number) =>
  randomId(
    length,
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-",
  );

interface Person {
  name: string;
  department: string;
  /** How strong a creator they are; scales their views. */
  level: number;
}

const PEOPLE: Person[] = [
  { name: "Nino Beridze", department: "Marketing", level: 2.8 },
  { name: "Giorgi Kapanadze", department: "IT", level: 1.9 },
  { name: "Tamar Lomidze", department: "Customer Support", level: 0 },
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

export const MOCK_EMPLOYEES: Employee[] = PEOPLE.map((person) => ({
  id: `emp-${slug(person.name, "-")}`,
  name: person.name,
  email: `${slug(person.name, ".")}@crocobet.com`,
  department: person.department,
  avatarUrl: null,
}));

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
  "New Year party recap",
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

const REJECTION_REASONS = [
  "The video is private, so we can't read its stats.",
  "Posted before the competition started.",
  "The link points to someone else's account.",
];

/** Relative audience size per platform. */
const REACH: Record<Platform, number> = {
  tiktok: 1.6,
  instagram: 1.2,
  facebook: 0.8,
  linkedin: 0.45,
};

const REACTION_RATE: Record<Platform, number> = {
  tiktok: 0.075,
  instagram: 0.09,
  facebook: 0.05,
  linkedin: 0.13,
};

const PLATFORM_WEIGHTS: ReadonlyArray<readonly [Platform, number]> = [
  ["tiktok", 0.36],
  ["instagram", 0.3],
  ["facebook", 0.19],
  ["linkedin", 0.15],
];

function pickPlatform(): Platform {
  let roll = rand();
  for (const [platform, weight] of PLATFORM_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return platform;
  }
  return "tiktok";
}

const URL_BUILDERS: Record<Platform, (employee: Employee) => string> = {
  instagram: () =>
    `https://www.instagram.com/reel/${shortcode(11)}/?igsh=${shortcode(12)}`,
  facebook: () =>
    rand() < 0.5
      ? `https://www.facebook.com/reel/${digits(15)}`
      : `https://www.facebook.com/watch/?v=${digits(15)}&ref=sharing`,
  tiktok: (employee) =>
    `https://www.tiktok.com/@${slug(employee.name, ".")}/video/${digits(19)}?is_from_webapp=1`,
  linkedin: (employee) =>
    `https://www.linkedin.com/posts/${slug(employee.name, "-")}_${slug(pick(TITLES.slice(0, 19)), "-")}-activity-${digits(19)}-${shortcode(4)}?utm_source=share`,
};

function normalize(rawUrl: string): string {
  const result = analyzeVideoUrl(rawUrl);
  if (result.status !== "valid")
    throw new Error(`Mock URL is not valid: ${rawUrl}`);
  return result.normalizedUrl;
}

const startOfToday = (() => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
})();

function buildVideo(
  employee: Employee,
  index: number,
  spec: {
    platform: Platform;
    daysAgo: number;
    status: VideoStatus;
    views: number;
    reactions: number;
    title: string | null;
    rejectionReason?: string;
  },
): Video {
  const posted = startOfToday - spec.daysAgo * DAY_MS;
  const submitted = Math.min(
    posted + Math.floor(rand() * 1.5 * DAY_MS) + 9 * 3_600_000,
    Date.now() - 60_000,
  );
  const verified = spec.status === "verified";

  return {
    id: `vid-${employee.id.slice(4)}-${index + 1}`,
    employeeId: employee.id,
    url: normalize(URL_BUILDERS[spec.platform](employee)),
    platform: spec.platform,
    title: spec.title,
    postedAt: toIsoDate(new Date(posted)),
    submittedAt: new Date(submitted).toISOString(),
    status: spec.status,
    rejectionReason:
      spec.status === "rejected"
        ? (spec.rejectionReason ?? REJECTION_REASONS[0]!)
        : null,
    views: verified ? spec.views : 0,
    reactions: verified ? spec.reactions : 0,
    thumbnailUrl: null,
  };
}

/** Hand-written so the signed-in user's view shows every status. */
const CURRENT_USER_VIDEOS = [
  {
    platform: "tiktok",
    daysAgo: 2,
    status: "verified",
    views: 1240,
    reactions: 118,
    title: "Support team's morning standup",
  },
  {
    platform: "instagram",
    daysAgo: 9,
    status: "verified",
    views: 1180,
    reactions: 131,
    title: "ჩვენი გუნდის ერთი დღე",
  },
  {
    platform: "linkedin",
    daysAgo: 21,
    status: "verified",
    views: 520,
    reactions: 74,
    title: "What I learned in my first year at Crocobet",
  },
  {
    platform: "facebook",
    daysAgo: 0,
    status: "pending",
    views: 0,
    reactions: 0,
    title: "Office plants tour",
  },
  {
    platform: "tiktok",
    daysAgo: 47,
    status: "rejected",
    views: 0,
    reactions: 0,
    title: null,
    rejectionReason: REJECTION_REASONS[1],
  },
  {
    platform: "instagram",
    daysAgo: 58,
    status: "verified",
    views: 5480,
    reactions: 538,
    title: "Desk setup tour 2026",
  },
] as const satisfies ReadonlyArray<Parameters<typeof buildVideo>[2]>;

function generateVideos(employee: Employee, person: Person): Video[] {
  if (employee.id === MOCK_CURRENT_USER_ID) {
    return CURRENT_USER_VIDEOS.map((spec, index) =>
      buildVideo(employee, index, spec),
    );
  }

  const count = 2 + Math.floor(rand() * 6);
  return Array.from({ length: count }, (_, index) => {
    const platform = pickPlatform();
    const daysAgo = Math.floor(rand() ** 1.8 * 110);
    const fresh = daysAgo <= 2;
    const roll = rand();
    const status: VideoStatus =
      fresh && roll < 0.45 ? "pending" : roll > 0.96 ? "rejected" : "verified";

    const recency = fresh ? 0.35 + rand() * 0.3 : 1;
    const views = Math.round(
      Math.exp(7.9 + gaussian() * 0.8) *
        person.level *
        REACH[platform] *
        recency,
    );
    const reactions = Math.round(
      views * REACTION_RATE[platform] * (0.7 + rand() * 0.6),
    );

    return buildVideo(employee, index, {
      platform,
      daysAgo,
      status,
      views: Math.max(views, 40),
      reactions: Math.max(reactions, 3),
      title: rand() < 0.85 ? pick(TITLES) : null,
      rejectionReason: pick(REJECTION_REASONS),
    });
  });
}

export const MOCK_VIDEOS: Video[] = MOCK_EMPLOYEES.flatMap((employee, i) =>
  generateVideos(employee, PEOPLE[i]!),
);
