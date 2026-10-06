import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type {
  ChallengeInput,
  ChallengeWindow,
  Round,
  RoundInput,
  RoundPatch,
  RoundsResponse,
} from "@/lib/api/types";
import type { CampaignWindow } from "@/lib/periods";
import {
  dayRange,
  generateRounds,
  rangeDates,
  ROUND_KINDS,
  ROUND_PROBLEM_CODES,
  type RoundKind,
  type RoundProblem,
  roundProblem,
  type RoundRange,
  toChallengeWindow,
  toRoundsResponse,
} from "@/lib/rounds";
import type { ServerConfig } from "@/lib/server/config";
import type { Db } from "@/lib/server/db/client";
import {
  challengeSettings,
  type EmployeeRow,
  leaderboardRounds,
  type RoundRow,
} from "@/lib/server/db/schema";
import { HttpError } from "@/lib/server/http";

/** Serializes round and challenge edits, so two admins can't create overlapping rounds. */
const LOCK_KEY = 7_412_026_102;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const roundName = z
  .string()
  .trim()
  .max(60)
  .nullable()
  .transform((value) => value || null);

export const roundInputSchema = z
  .object({
    kind: z.enum(ROUND_KINDS),
    name: roundName.default(null),
    startDate: isoDate,
    endDate: isoDate,
  })
  .strict();

export const roundPatchSchema = z
  .object({
    name: roundName.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .strict();

export const challengeInputSchema = z
  .object({ startDate: isoDate, endDate: isoDate })
  .strict();

export const generateSchema = z.object({ kind: z.enum(ROUND_KINDS) }).strict();

const MESSAGES: Record<RoundProblem, string> = {
  invalid_dates: "The end date must be on or after the start date",
  outside_challenge: "The round must be inside the challenge",
  overlap: "It overlaps another round of the same kind",
};

function fail(problem: RoundProblem): never {
  throw new HttpError(422, ROUND_PROBLEM_CODES[problem], MESSAGES[problem]);
}

// ----------------------------------------------------------- the challenge

/** The challenge window: set in the admin panel, else from the server settings. */
export async function loadCampaign(
  db: Db,
  config: ServerConfig,
): Promise<{ campaign: CampaignWindow; source: ChallengeWindow["source"] }> {
  const [row] = await db.select().from(challengeSettings).limit(1);
  return row
    ? {
        campaign: {
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          timeZone: config.campaign.timeZone,
        },
        source: "admin",
      }
    : { campaign: config.campaign, source: "default" };
}

/** The configuration with the challenge window as admins set it. */
export async function withCampaign(
  db: Db,
  config: ServerConfig,
): Promise<ServerConfig> {
  const { campaign } = await loadCampaign(db, config);
  return { ...config, campaign };
}

// ------------------------------------------------------------------ rounds

function toRange(row: RoundRow): RoundRange {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

/** Every round (or every round of one kind), by start. */
export async function loadRounds(
  db: Db,
  kind?: RoundKind,
): Promise<RoundRange[]> {
  const rows = await db
    .select()
    .from(leaderboardRounds)
    .where(kind ? eq(leaderboardRounds.kind, kind) : undefined)
    .orderBy(asc(leaderboardRounds.startsAt));
  return rows.map(toRange);
}

export async function getRounds(
  db: Db,
  config: ServerConfig,
): Promise<RoundsResponse> {
  const [{ campaign, source }, rounds] = await Promise.all([
    loadCampaign(db, config),
    loadRounds(db),
  ]);
  return toRoundsResponse(rounds, campaign, source);
}

async function lock(tx: Pick<Db, "execute">) {
  await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`);
}

async function roundById(db: Db, config: ServerConfig, roundId: string) {
  const { rounds } = await getRounds(db, config);
  const round = rounds.find((candidate) => candidate.id === roundId);
  if (!round) throw new HttpError(404, "not_found", "Round not found");
  return round;
}

export async function createRound(
  db: Db,
  config: ServerConfig,
  actor: EmployeeRow,
  input: RoundInput,
): Promise<Round> {
  const range = dayRange(
    input.startDate,
    input.endDate,
    config.campaign.timeZone,
  );
  if (!range) fail("invalid_dates");
  const id = await db.transaction(async (tx) => {
    await lock(tx);
    const { campaign } = await loadCampaign(tx as unknown as Db, config);
    const problem = roundProblem(
      { kind: input.kind, ...range },
      await loadRounds(tx as unknown as Db, input.kind),
      campaign,
    );
    if (problem) fail(problem);
    const [row] = await tx
      .insert(leaderboardRounds)
      .values({
        kind: input.kind,
        name: input.name,
        ...range,
        createdBy: actor.id,
      })
      .returning({ id: leaderboardRounds.id });
    return row!.id;
  });
  return roundById(db, config, id);
}

export async function updateRound(
  db: Db,
  config: ServerConfig,
  roundId: string,
  patch: RoundPatch,
): Promise<Round> {
  await db.transaction(async (tx) => {
    await lock(tx);
    const [row] = await tx
      .select()
      .from(leaderboardRounds)
      .where(eq(leaderboardRounds.id, roundId));
    if (!row) throw new HttpError(404, "not_found", "Round not found");
    const { timeZone } = config.campaign;
    const current = rangeDates(row.startsAt, row.endsAt, timeZone);
    const range = dayRange(
      patch.startDate ?? current.startDate,
      patch.endDate ?? current.endDate,
      timeZone,
    );
    if (!range) fail("invalid_dates");
    const { campaign } = await loadCampaign(tx as unknown as Db, config);
    const problem = roundProblem(
      { id: row.id, kind: row.kind, ...range },
      await loadRounds(tx as unknown as Db, row.kind),
      campaign,
    );
    if (problem) fail(problem);
    await tx
      .update(leaderboardRounds)
      .set({
        ...range,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
      })
      .where(eq(leaderboardRounds.id, row.id));
  });
  return roundById(db, config, roundId);
}

export async function deleteRound(db: Db, roundId: string): Promise<void> {
  const deleted = await db
    .delete(leaderboardRounds)
    .where(eq(leaderboardRounds.id, roundId))
    .returning({ id: leaderboardRounds.id });
  if (deleted.length === 0)
    throw new HttpError(404, "not_found", "Round not found");
}

/** Rounds of one kind for the whole challenge: 7-day weeks or calendar months. */
export async function generateRoundsFor(
  db: Db,
  config: ServerConfig,
  actor: EmployeeRow,
  kind: RoundKind,
): Promise<RoundsResponse> {
  await db.transaction(async (tx) => {
    await lock(tx);
    if ((await loadRounds(tx as unknown as Db, kind)).length > 0)
      throw new HttpError(
        409,
        "rounds_exist",
        "Rounds of this kind already exist",
      );
    const { campaign } = await loadCampaign(tx as unknown as Db, config);
    const generated = generateRounds(kind, campaign);
    if (generated.length > 0)
      await tx
        .insert(leaderboardRounds)
        .values(generated.map((round) => ({ ...round, createdBy: actor.id })));
  });
  return getRounds(db, config);
}

export async function updateChallenge(
  db: Db,
  config: ServerConfig,
  actor: EmployeeRow,
  input: ChallengeInput,
): Promise<ChallengeWindow> {
  const range = dayRange(
    input.startDate,
    input.endDate,
    config.campaign.timeZone,
  );
  if (!range || !(range.endsAt > range.startsAt)) fail("invalid_dates");
  await db.transaction(async (tx) => {
    await lock(tx);
    await tx
      .insert(challengeSettings)
      .values({ id: 1, ...range, updatedBy: actor.id })
      .onConflictDoUpdate({
        target: challengeSettings.id,
        set: { ...range, updatedBy: actor.id },
      });
  });
  return toChallengeWindow(
    { ...range, timeZone: config.campaign.timeZone },
    "admin",
  );
}
