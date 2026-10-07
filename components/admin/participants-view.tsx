"use client";

import {
  ArrowDownUp,
  ChevronDown,
  Search,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import { Crossfade } from "@/components/common/crossfade";
import { EmployeeAvatar } from "@/components/common/employee-avatar";
import { GlowBackdrop } from "@/components/common/glow-backdrop";
import { PlatformLogos } from "@/components/common/platform-logos";
import { ErrorState, StatePanel } from "@/components/common/state-panel";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MotionButton } from "@/components/ui/motion-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useParticipantsQuery } from "@/lib/api/queries";
import type { BoardResult, ParticipantSummary } from "@/lib/api/types";
import { useAppUrlState } from "@/lib/hooks/use-app-url-state";
import { useNow } from "@/lib/hooks/use-now";
import { enterUp, STAGGER } from "@/lib/motion";
import { cn, normalizeForSearch } from "@/lib/utils";

const SORTS = ["recent", "name", "posts", "video", "static"] as const;
type Sort = (typeof SORTS)[number];

/** Ranked first, best rank first; the unranked after, by name. */
const byRank =
  (board: "video" | "static") =>
  (a: ParticipantSummary, b: ParticipantSummary) =>
    (a.challenge[board].rank ?? Infinity) -
      (b.challenge[board].rank ?? Infinity) ||
    a.employee.name.localeCompare(b.employee.name);

const COMPARE: Record<
  Sort,
  ((a: ParticipantSummary, b: ParticipantSummary) => number) | null
> = {
  // The server sends the most recent submission first.
  recent: null,
  name: (a, b) => a.employee.name.localeCompare(b.employee.name),
  posts: (a, b) =>
    b.posts.total - a.posts.total ||
    a.employee.name.localeCompare(b.employee.name),
  video: byRank("video"),
  static: byRank("static"),
};

/** Desktop columns: the person, then posts, both boards and the latest post. */
const ROW_GRID =
  "lg:grid-cols-[minmax(0,2.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]";

/** Everyone who has submitted a post. Each row opens their profile (admin). */
export default function ParticipantsView() {
  const { t, format, plural } = useI18n();
  const copy = t.participants;
  const participants = useParticipantsQuery();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  const shown = useMemo(() => {
    const all = participants.data?.participants ?? [];
    const query = normalizeForSearch(search.trim());
    const matching = query
      ? all.filter((person) =>
          normalizeForSearch(
            [
              person.employee.name,
              person.employee.email,
              person.employee.department,
            ].join(" "),
          ).includes(query),
        )
      : all;
    const compare = COMPARE[sort];
    return compare ? [...matching].sort(compare) : matching;
  }, [participants.data, search, sort]);

  const total = participants.data?.participants.length ?? 0;

  return (
    <div className="relative isolate">
      <GlowBackdrop className="-top-28 opacity-70 md:-top-36" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
          {copy.title}
        </h1>
        {participants.data && (
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium text-muted-foreground tabular-nums">
            <Users className="size-3.5 text-brand-text" aria-hidden="true" />
            {plural(copy.count, total)}
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchField value={search} onChange={setSearch} />
        <SortMenu value={sort} onChange={setSort} />
      </div>

      <Crossfade
        className="mt-5"
        stateKey={
          participants.isPending
            ? "loading"
            : participants.isError
              ? "error"
              : total === 0
                ? "empty"
                : "content"
        }
      >
        {participants.isPending ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-2">
            <span className="sr-only">{t.leaderboard.updating}</span>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-card" />
            ))}
          </div>
        ) : participants.isError ? (
          <ErrorState
            title={copy.error}
            retryLabel={t.common.retry}
            onRetry={() => void participants.refetch()}
            retrying={participants.isFetching}
            retryingLabel={t.leaderboard.updating}
          />
        ) : total === 0 ? (
          <StatePanel icon={<Users />} title={copy.empty} />
        ) : (
          <>
            <div
              aria-hidden="true"
              className={cn(
                "hidden gap-4 px-4 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid",
                ROW_GRID,
              )}
            >
              <span>{copy.columns.person}</span>
              <span>{copy.columns.posts}</span>
              <span>{copy.columns.video}</span>
              <span>{copy.columns.static}</span>
              <span>{copy.columns.lastPost}</span>
            </div>
            {shown.length === 0 ? (
              <p className="rounded-card border border-border bg-surface/70 p-6 text-center text-sm text-muted-foreground">
                {format(copy.noMatch, { query: search.trim() })}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {shown.map((person, index) => (
                  <motion.li
                    key={person.employee.id}
                    {...enterUp(Math.min(index, 12), STAGGER.rows)}
                  >
                    <ParticipantRow person={person} />
                  </motion.li>
                ))}
              </ul>
            )}
          </>
        )}
      </Crossfade>
    </div>
  );
}

function isPlainLeftClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/** One person: a link to their profile (new tab with a modifier key). */
function ParticipantRow({ person }: { person: ParticipantSummary }) {
  const { t, format, plural, formatRelativeTime, formatDateTime } = useI18n();
  const copy = t.participants;
  const now = useNow();
  const { openProfile } = useAppUrlState();
  const { employee, posts } = person;
  const breakdown = [
    posts.approved > 0 && format(copy.approved, { count: posts.approved }),
    posts.pending > 0 && format(copy.pending, { count: posts.pending }),
    posts.rejected + posts.disqualified > 0 &&
      format(copy.rejected, { count: posts.rejected + posts.disqualified }),
  ].filter(Boolean);

  return (
    <a
      href={`/?view=profile&employee=${encodeURIComponent(employee.id)}`}
      aria-label={format(copy.openProfile, { name: employee.name })}
      onClick={(event) => {
        if (!isPlainLeftClick(event)) return;
        event.preventDefault();
        openProfile(employee.id);
      }}
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-3 rounded-card border border-border bg-surface/80 p-4 shadow-soft backdrop-blur motion-colors hover:border-brand/30 hover:bg-surface lg:items-center lg:py-3",
        ROW_GRID,
      )}
    >
      <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
        <EmployeeAvatar employee={employee} size="md" />
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 font-semibold">
            <span className="truncate">{employee.name}</span>
            <PlatformLogos platforms={person.platforms} />
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[employee.email, employee.department].filter(Boolean).join(" · ")}
          </p>
          {person.removedFromChallenge && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-warning-text">
              <UserMinus className="size-3.5" aria-hidden="true" />
              {copy.removed}
            </p>
          )}
        </div>
      </div>

      <Cell label={copy.columns.posts}>
        <span className="font-semibold">{plural(copy.posts, posts.total)}</span>
        {breakdown.length > 0 && (
          <span className="block text-xs text-muted-foreground lg:truncate">
            {breakdown.join(" · ")}
          </span>
        )}
      </Cell>
      <Cell label={copy.columns.video}>
        <BoardCell result={person.challenge.video} />
      </Cell>
      <Cell label={copy.columns.static}>
        <BoardCell result={person.challenge.static} />
      </Cell>
      <Cell label={copy.columns.lastPost}>
        <time
          dateTime={person.lastSubmittedAt}
          title={formatDateTime(person.lastSubmittedAt)}
          className="text-sm"
        >
          {now > 0
            ? (formatRelativeTime(person.lastSubmittedAt, now) ??
              t.common.justNow)
            : formatDateTime(person.lastSubmittedAt)}
        </time>
      </Cell>
    </a>
  );
}

/** A value with its label above it on phones (desktop has the header row). */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="mb-0.5 text-xs font-medium text-muted-foreground lg:sr-only">
        {label}
      </p>
      {children}
    </div>
  );
}

function BoardCell({ result }: { result: BoardResult }) {
  const { t, format, formatNumber, plural } = useI18n();
  if (result.rank === null)
    return (
      <span className="text-muted-foreground">{t.participants.notRanked}</span>
    );
  return (
    <>
      <span className="font-semibold tabular-nums">
        {format(t.participants.rank, {
          rank: formatNumber(result.rank),
          total: formatNumber(result.totalParticipants),
        })}
      </span>
      <span className="block text-xs text-muted-foreground tabular-nums">
        {plural(t.metrics.units.score, result.score)}
      </span>
    </>
  );
}

function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const copy = t.participants;
  return (
    <div className="group/search relative flex-1 sm:max-w-sm">
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-muted-foreground motion-colors group-focus-within/search:text-brand-text"
        aria-hidden="true"
      />
      <Input
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        aria-label={copy.searchLabel}
        placeholder={copy.searchPlaceholder}
        value={value}
        maxLength={100}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
        className="h-10 pr-10 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <MotionButton
          variant="icon"
          size="icon-sm"
          aria-label={copy.clearSearch}
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1 z-10 size-8 -translate-y-1/2 rounded-xl text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden="true" />
        </MotionButton>
      )}
    </div>
  );
}

function SortMenu({
  value,
  onChange,
}: {
  value: Sort;
  onChange: (value: Sort) => void;
}) {
  const { t } = useI18n();
  const copy = t.participants;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MotionButton
          variant="secondary"
          aria-label={`${copy.sortLabel}: ${copy.sort[value]}`}
          className="group/sort h-10 self-start rounded-full px-4 font-medium data-[state=open]:border-brand/50 sm:self-auto"
        >
          <ArrowDownUp className="size-4 text-brand-text" aria-hidden="true" />
          {copy.sort[value]}
          <ChevronDown
            className="size-4 opacity-60 transition-[rotate] duration-(--dur-base) ease-(--ease-in-out-soft) motion-safe:group-data-[state=open]/sort:rotate-180"
            aria-hidden="true"
          />
        </MotionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{copy.sortLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            const option = SORTS.find((candidate) => candidate === next);
            if (option) onChange(option);
          }}
        >
          {SORTS.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {copy.sort[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
