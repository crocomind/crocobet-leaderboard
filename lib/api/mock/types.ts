import type {
  CheckError,
  Employee,
  IsoDateTime,
  LinkedHandle,
  MetricSnapshot,
  MetricsSource,
  ModerationReason,
  PostCheck,
  PostFlag,
  PostStatus,
  PublishedAtSource,
  SyncRun,
} from "../types";
import type { ContentType, Platform } from "@/lib/platforms";
import type { MediaKind } from "@/lib/post-data";

export interface MockEmployee extends Employee {
  email: string;
  /** The employee's own accounts, used as the author of their posts. */
  handles: Record<Platform, string>;
}

/** What the mock "provider" sees when it fetches the post. */
export interface ProviderTruth {
  error: CheckError | null;
  caption: string | null;
  hashtags: string[];
  authorHandle: string | null;
  mediaKind: MediaKind;
  /** What the provider reports. null if it doesn't. */
  publishedAt: IsoDateTime | null;
  /** Totals the post approaches over time. */
  lifetimeViews: number | null;
  lifetimeReactions: number;
  growthDays: number;
  /** Growth is measured from here (the publish or submit time). */
  growthFrom: IsoDateTime;
}

export interface MockEvent {
  id: string;
  at: IsoDateTime;
  /** null for the system. */
  actorId: string | null;
  action: string;
  reason: ModerationReason | null;
  note: string | null;
}

export interface MockPost {
  id: string;
  employeeId: string;
  url: string;
  platform: Platform;
  contentType: ContentType;
  externalId: string | null;
  title: string | null;
  caption: string | null;
  authorHandle: string | null;
  authorName: string | null;
  publishedAt: IsoDateTime | null;
  publishedAtSource: PublishedAtSource | null;
  submittedPostedAt: string | null;
  submittedAt: IsoDateTime;
  status: PostStatus;
  statusReason: ModerationReason | null;
  statusNote: string | null;
  reviewedBy: string | null;
  reviewedAt: IsoDateTime | null;
  approvedAt: IsoDateTime | null;
  check: PostCheck;
  /** When a queued or running check finishes. */
  checkDueAt: IsoDateTime | null;
  lastRecheckAt: IsoDateTime | null;
  views: number | null;
  reactions: number;
  metricsSource: MetricsSource;
  metricsLocked: boolean;
  metricsUpdatedAt: IsoDateTime | null;
  flags: PostFlag[];
  consecutiveFetchFailures: number;
  thumbnailUrl: string | null;
  /** Oldest first. */
  snapshots: MetricSnapshot[];
  /** Oldest first. */
  events: MockEvent[];
  truth: ProviderTruth;
}

export interface MockRound {
  id: string;
  kind: "week" | "month";
  name: string | null;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
}

export interface MockState {
  version: number;
  generatedAt: IsoDateTime;
  campaign: { startsAt: IsoDateTime; endsAt: IsoDateTime; timeZone: string };
  /** "admin" once an admin saved the challenge dates. */
  campaignSource: "admin" | "default";
  rounds: MockRound[];
  posts: MockPost[];
  socialAccounts: LinkedHandle[];
  /** Newest first. */
  syncRuns: SyncRun[];
  nextId: number;
}
