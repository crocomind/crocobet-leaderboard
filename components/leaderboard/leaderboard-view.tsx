"use client";

import { Clapperboard, ImageIcon, Plus, SearchX } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Crossfade } from "@/components/common/crossfade";
import { GlowBackdrop } from "@/components/common/glow-backdrop";
import { ErrorState, StatePanel } from "@/components/common/state-panel";
import { EmployeeSheet } from "@/components/leaderboard/employee-sheet";
import { BoardDates, LastUpdated } from "@/components/leaderboard/last-updated";
import { LeaderboardList } from "@/components/leaderboard/leaderboard-list";
import {
  ListSkeleton,
  PodiumSkeleton,
} from "@/components/leaderboard/leaderboard-skeleton";
import { LeaderboardToolbar } from "@/components/leaderboard/leaderboard-toolbar";
import {
  MyStandingBar,
  type StandingAction,
} from "@/components/leaderboard/my-standing-bar";
import { Podium } from "@/components/leaderboard/podium";
import { useRoundLabel } from "@/components/leaderboard/use-round-label";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useI18n } from "@/components/providers/i18n-provider";
import { useSubmitPost } from "@/components/submit/submit-post-provider";
import { MotionButton } from "@/components/ui/motion-button";
import { useLeaderboardQuery, useRoundsQuery } from "@/lib/api/queries";
import type { LeaderboardEntry, LeaderboardQuery } from "@/lib/api/types";
import { useAppUrlState } from "@/lib/hooks/use-app-url-state";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useViewportPosition } from "@/lib/hooks/use-viewport-position";
import { platformForCategory } from "@/lib/url-state";

export function LeaderboardView() {
  const { t, format } = useI18n();
  const { state, update } = useAppUrlState();
  const currentUser = useCurrentUser();
  const { openSubmit } = useSubmitPost();
  const reduceMotion = useReducedMotion();

  // The input updates instantly; the query and URL follow after a short pause.
  const [searchText, setSearchText] = useState(state.q);
  const search = useDebouncedValue(searchText.trim(), 300);
  useEffect(() => {
    update({ q: search });
  }, [search, update]);

  const query = useMemo<LeaderboardQuery>(
    () => ({
      category: state.category,
      platform: state.platform,
      period: state.period,
      round: state.round || null,
      search,
    }),
    [state.category, state.platform, state.period, state.round, search],
  );
  const rounds = useRoundsQuery();
  const roundLabel = useRoundLabel();
  const leaderboard = useLeaderboardQuery(query);
  const { data } = leaderboard;
  // While new filters load, the previous result stays on screen; render it
  // with the query it was fetched for so numbers and ordering agree.
  const shown = data?.query ?? query;
  const searching = shown.search !== "";
  const userId = currentUser.user?.id;

  // Stable arrays so the memoized podium and list skip re-renders (and
  // layout measurement) while the user types.
  const podiumEntries = useMemo(
    () => (searching ? [] : (data?.entries.filter((e) => e.rank <= 3) ?? [])),
    [data, searching],
  );
  const listEntries = useMemo(
    () =>
      searching
        ? (data?.entries ?? [])
        : (data?.entries.filter((e) => e.rank > 3) ?? []),
    [data, searching],
  );

  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const openEntry = useCallback((entry: LeaderboardEntry) => {
    setSelected(entry);
    setSheetOpen(true);
  }, []);

  // Track the signed-in user's row (or podium card). The cleanup only clears
  // the element it set, so a row fading out can't erase a card fading in.
  const [myEntryElement, setMyEntryElement] = useState<HTMLElement | null>(
    null,
  );
  const myEntryRef = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    setMyEntryElement(element);
    return () =>
      setMyEntryElement((current) => (current === element ? null : current));
  }, []);
  const position = useViewportPosition(myEntryElement);

  const standing = data?.myStanding ?? null;
  const rowRendered = myEntryElement !== null;
  let standingAction: StandingAction = "submit";
  if (standing) {
    if (!rowRendered)
      standingAction = searching ? "clear-search" : "scroll-down";
    else standingAction = position === "above" ? "scroll-up" : "scroll-down";
  }
  const showStanding =
    data !== undefined &&
    currentUser.status === "signed-in" &&
    (standing === null ||
      !rowRendered ||
      position === "above" ||
      position === "below");

  const handleStandingAction = (action: StandingAction) => {
    if (action === "submit") return openSubmit();
    if (action === "clear-search") return setSearchText("");
    myEntryElement?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    myEntryElement?.focus({ preventScroll: true });
  };

  // A chosen past round is named after itself; the current one is "This week".
  const periodLabel =
    shown.round && data?.period.round
      ? roundLabel(data.period.round, data.period.start, data.period.timeZone)
      : t.periods[shown.period];
  const announcement =
    data && !leaderboard.isPlaceholderData
      ? [
          format(t.leaderboard.announce, {
            category: t.categories[shown.category],
            period: periodLabel,
            count: data.totalParticipants,
          }),
          standing
            ? format(t.leaderboard.announceStanding, {
                rank: standing.entry.rank,
              })
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  return (
    <div className="relative isolate">
      <GlowBackdrop className="-top-28 md:-top-36" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-balance md:text-4xl">
            {t.leaderboard.title}
          </h1>
          <p className="mt-1.5 max-w-xl text-pretty text-muted-foreground">
            {t.leaderboard.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:justify-end sm:self-auto">
          <BoardDates period={data?.period} />
          <LastUpdated
            syncedAt={data?.lastSyncedAt}
            updating={leaderboard.isFetching}
          />
        </div>
      </div>

      <div className="mt-6">
        <LeaderboardToolbar
          category={state.category}
          platform={state.platform}
          period={state.period}
          round={state.round}
          rounds={rounds.data}
          search={searchText}
          onCategoryChange={(category) =>
            update({
              category,
              platform: platformForCategory(state.platform, category),
            })
          }
          onPlatformChange={(platform) => update({ platform })}
          onPeriodChange={(period, round) => update({ period, round })}
          onSearchChange={setSearchText}
        />
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Crossfade
        className="mt-8"
        stateKey={
          leaderboard.isPending
            ? "loading"
            : !data
              ? "error"
              : data.entries.length === 0
                ? searching
                  ? "empty-search"
                  : "empty"
                : "content"
        }
      >
        {leaderboard.isPending ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">{t.leaderboard.updating}</span>
            <PodiumSkeleton />
            <div className="mt-8">
              <ListSkeleton />
            </div>
          </div>
        ) : !data ? (
          <ErrorState
            title={t.leaderboard.error.title}
            description={t.leaderboard.error.description}
            retryLabel={t.common.retry}
            onRetry={() => void leaderboard.refetch()}
            retrying={leaderboard.isFetching}
            retryingLabel={t.leaderboard.updating}
          />
        ) : data.entries.length === 0 ? (
          searching ? (
            <StatePanel
              role="status"
              icon={<SearchX />}
              title={format(t.leaderboard.empty.searchTitle, {
                query: shown.search,
              })}
              description={t.leaderboard.empty.searchDescription}
              action={
                <MotionButton
                  variant="secondary"
                  onClick={() => setSearchText("")}
                >
                  {t.leaderboard.clearSearch}
                </MotionButton>
              }
            />
          ) : (
            <StatePanel
              role="status"
              icon={
                shown.category === "video" ? <Clapperboard /> : <ImageIcon />
              }
              title={t.leaderboard.empty.title}
              description={t.leaderboard.empty.description}
              action={
                <MotionButton onClick={openSubmit}>
                  <Plus aria-hidden="true" />
                  {t.header.submitPost}
                </MotionButton>
              }
            />
          )
        ) : (
          <div className="flex flex-col gap-8">
            {podiumEntries.length > 0 && (
              <Podium
                // A new board (category, platform or period) brings its cards in fresh.
                boardKey={`${shown.category}|${shown.platform}|${shown.period}|${data.period.start}`}
                entries={podiumEntries}
                currentUserId={userId}
                onSelect={openEntry}
                myEntryRef={myEntryRef}
              />
            )}
            {listEntries.length > 0 && (
              <LeaderboardList
                entries={listEntries}
                category={shown.category}
                currentUserId={userId}
                onSelect={openEntry}
                myEntryRef={myEntryRef}
                dimmed={leaderboard.isPlaceholderData}
              />
            )}
          </div>
        )}
      </Crossfade>

      <EmployeeSheet
        entry={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        category={shown.category}
        platform={shown.platform}
        period={shown.period}
        round={shown.round}
        periodLabel={periodLabel}
        isMe={selected?.employee.id === userId}
      />

      <MyStandingBar
        visible={showStanding}
        user={currentUser.user}
        standing={standing}
        action={standingAction}
        onAction={handleStandingAction}
      />
    </div>
  );
}
