"use client";

import {
  CalendarDays,
  ChevronDown,
  Clapperboard,
  ImageIcon,
  Search,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CategoryLabel } from "@/components/common/category-label";
import { PlatformBadge } from "@/components/common/platform-badge";
import { useRoundLabel } from "@/components/leaderboard/use-round-label";
import { useI18n } from "@/components/providers/i18n-provider";
import { type ChipOption, ChipGroup } from "@/components/ui/chip-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MotionButton } from "@/components/ui/motion-button";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui/segmented-control";
import {
  type ContentCategory,
  LEADERBOARD_PERIODS,
  type LeaderboardPeriod,
  type PlatformFilter,
  type RoundKind,
  type RoundsResponse,
} from "@/lib/api/types";
import { useNow } from "@/lib/hooks/use-now";
import { DURATION, exitTween, tween } from "@/lib/motion";
import { CATEGORY_PLATFORMS, PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

interface LeaderboardToolbarProps {
  category: ContentCategory;
  platform: PlatformFilter;
  period: LeaderboardPeriod;
  round: string;
  rounds: RoundsResponse | undefined;
  search: string;
  onCategoryChange: (category: ContentCategory) => void;
  onPlatformChange: (platform: PlatformFilter) => void;
  onPeriodChange: (period: LeaderboardPeriod, round: string) => void;
  onSearchChange: (search: string) => void;
}

export function LeaderboardToolbar({
  category,
  platform,
  period,
  round,
  rounds,
  search,
  onCategoryChange,
  onPlatformChange,
  onPeriodChange,
  onSearchChange,
}: LeaderboardToolbarProps) {
  const { t } = useI18n();

  const categoryOptions: SegmentedOption<ContentCategory>[] = [
    {
      value: "video",
      label: <CategoryLabel category="video" />,
      icon: <Clapperboard className="size-4" aria-hidden="true" />,
    },
    {
      value: "static",
      label: <CategoryLabel category="static" />,
      icon: <ImageIcon className="size-4" aria-hidden="true" />,
    },
  ];

  // Only the platforms that can appear on this board.
  const platformOptions: ChipOption<PlatformFilter>[] = [
    { value: "all", label: t.leaderboard.allPlatforms },
    ...CATEGORY_PLATFORMS[category].map((id) => ({
      value: id,
      label: PLATFORMS[id].name,
      icon: <PlatformBadge platform={id} size="xs" />,
    })),
  ];

  return (
    <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
      <SegmentedControl
        label={t.leaderboard.categoryLabel}
        value={category}
        onValueChange={onCategoryChange}
        options={categoryOptions}
        className="order-2 w-full md:order-1 md:w-auto [&>button]:px-3 sm:[&>button]:px-4"
      />

      <div className="order-1 flex gap-2 md:order-2 md:justify-self-end">
        <PeriodMenu
          period={period}
          round={round}
          rounds={rounds}
          onPeriodChange={onPeriodChange}
          // As tall as the search field next to it.
          className="hidden md:inline-flex md:h-11"
        />
        <SearchField
          value={search}
          onChange={onSearchChange}
          className="w-full md:w-72"
        />
      </div>

      {/* On mobile the period and platform filters share one swipeable row. */}
      <div className="order-3 -mx-4 no-scrollbar overflow-x-auto fade-x px-4 py-1 md:col-span-2 md:mx-0 md:overflow-visible md:[mask-image:none] md:px-0">
        <div className="flex w-max items-center gap-2">
          <PeriodMenu
            period={period}
            round={round}
            rounds={rounds}
            onPeriodChange={onPeriodChange}
            className="md:hidden"
          />
          <ChipGroup
            key={category}
            label={t.leaderboard.platformLabel}
            value={platform}
            onValueChange={onPlatformChange}
            options={platformOptions}
          />
        </div>
      </div>
    </div>
  );
}

function PeriodMenu({
  period,
  round,
  rounds,
  onPeriodChange,
  className,
}: {
  period: LeaderboardPeriod;
  round: string;
  rounds: RoundsResponse | undefined;
  onPeriodChange: (period: LeaderboardPeriod, round: string) => void;
  className?: string;
}) {
  const { t, formatDateRange } = useI18n();
  const roundLabel = useRoundLabel();
  const now = useNow();
  const timeZone = rounds?.challenge.timeZone ?? "Asia/Tbilisi";

  // Rounds that have started, most recent first.
  const started = (kind: RoundKind) =>
    (rounds?.rounds ?? [])
      .filter(
        (item) =>
          item.kind === kind && now > 0 && Date.parse(item.startsAt) <= now,
      )
      .reverse();
  const chosen = round
    ? rounds?.rounds.find((item) => item.id === round && item.kind === period)
    : undefined;
  const label = chosen
    ? roundLabel(chosen, chosen.startsAt, timeZone)
    : t.periods[period];

  const group = (kind: RoundKind, title: string) => {
    const items = started(kind);
    if (items.length === 0) return null;
    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        {items.map((item) => (
          <DropdownMenuRadioItem key={item.id} value={`${kind}:${item.id}`}>
            <span className="flex min-w-0 flex-col">
              <span className="truncate">
                {roundLabel(item, item.startsAt, timeZone)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDateRange(item.startsAt, item.endsAt, timeZone)}
                {now < Date.parse(item.endsAt) && <> · {t.rounds.now}</>}
              </span>
            </span>
          </DropdownMenuRadioItem>
        ))}
      </>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MotionButton
          variant="secondary"
          aria-label={`${t.leaderboard.periodLabel}: ${label}`}
          className={cn(
            "group/period h-10 rounded-full px-4 font-medium data-[state=open]:border-brand/50",
            className,
          )}
        >
          <CalendarDays className="size-4 text-brand-text" aria-hidden="true" />
          <span className="max-w-44 truncate">{label}</span>
          <ChevronDown
            className="size-4 opacity-60 transition-[rotate] duration-(--dur-base) ease-(--ease-in-out-soft) motion-safe:group-data-[state=open]/period:rotate-180"
            aria-hidden="true"
          />
        </MotionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[min(32rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto"
      >
        <DropdownMenuLabel>{t.leaderboard.periodLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={chosen ? `${period}:${chosen.id}` : period}
          onValueChange={(value) => {
            const [kind, id = ""] = value.split(":");
            const next = LEADERBOARD_PERIODS.find((option) => option === kind);
            if (next) onPeriodChange(next, id);
          }}
        >
          {LEADERBOARD_PERIODS.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {t.periods[option]}
            </DropdownMenuRadioItem>
          ))}
          {group("week", t.rounds.weekly)}
          {group("month", t.rounds.monthly)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SearchField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div className={cn("group/search relative", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-muted-foreground motion-colors group-focus-within/search:text-brand-text"
        aria-hidden="true"
      />
      <Input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        aria-label={t.leaderboard.searchLabel}
        placeholder={t.leaderboard.searchPlaceholder}
        value={value}
        maxLength={100}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
        className="h-11 pr-11 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
      />
      <AnimatePresence initial={false}>
        {value && (
          <motion.span
            key="clear"
            className="absolute top-1/2 right-1.5 z-10 -translate-y-1/2"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, transition: tween(DURATION.fast) }}
            exit={{
              opacity: 0,
              scale: 0.8,
              transition: exitTween(DURATION.fast),
            }}
          >
            <MotionButton
              variant="icon"
              size="icon-sm"
              aria-label={t.leaderboard.clearSearch}
              onClick={() => onChange("")}
              className="size-8 rounded-xl text-muted-foreground hover:text-foreground"
            >
              <X aria-hidden="true" />
            </MotionButton>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
