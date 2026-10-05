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
import { PlatformBadge } from "@/components/common/platform-badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { type ChipOption, ChipGroup } from "@/components/ui/chip-group";
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
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui/segmented-control";
import {
  type ContentCategory,
  LEADERBOARD_PERIODS,
  type LeaderboardPeriod,
  type PlatformFilter,
} from "@/lib/api/types";
import { DURATION, exitTween, tween } from "@/lib/motion";
import { CATEGORY_PLATFORMS, PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

interface LeaderboardToolbarProps {
  category: ContentCategory;
  platform: PlatformFilter;
  period: LeaderboardPeriod;
  search: string;
  onCategoryChange: (category: ContentCategory) => void;
  onPlatformChange: (platform: PlatformFilter) => void;
  onPeriodChange: (period: LeaderboardPeriod) => void;
  onSearchChange: (search: string) => void;
}

export function LeaderboardToolbar({
  category,
  platform,
  period,
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
      label: t.categories.video,
      icon: <Clapperboard className="size-4" aria-hidden="true" />,
    },
    {
      value: "static",
      label: t.categories.static,
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
          onPeriodChange={onPeriodChange}
          className="hidden md:inline-flex"
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
  onPeriodChange,
  className,
}: {
  period: LeaderboardPeriod;
  onPeriodChange: (period: LeaderboardPeriod) => void;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MotionButton
          variant="secondary"
          aria-label={`${t.leaderboard.periodLabel}: ${t.periods[period]}`}
          className={cn(
            "group/period h-10 rounded-full px-4 font-medium data-[state=open]:border-brand/50",
            className,
          )}
        >
          <CalendarDays className="size-4 text-brand-text" aria-hidden="true" />
          {t.periods[period]}
          <ChevronDown
            className="size-4 opacity-60 transition-[rotate] duration-(--dur-base) ease-(--ease-in-out-soft) motion-safe:group-data-[state=open]/period:rotate-180"
            aria-hidden="true"
          />
        </MotionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t.leaderboard.periodLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={period}
          onValueChange={(value) => {
            const next = LEADERBOARD_PERIODS.find((option) => option === value);
            if (next) onPeriodChange(next);
          }}
        >
          {LEADERBOARD_PERIODS.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {t.periods[option]}
            </DropdownMenuRadioItem>
          ))}
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
