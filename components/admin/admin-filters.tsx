"use client";

import { ChevronDown, Search, X } from "lucide-react";
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
import {
  type AdminPostsQuery,
  type CheckStatus,
  POST_FLAGS,
  RETIRED_FLAGS,
} from "@/lib/api/types";
import { CATEGORY_PLATFORMS, PLATFORM_IDS, PLATFORMS } from "@/lib/platforms";
import { platformForCategory } from "@/lib/url-state";
import { cn } from "@/lib/utils";

const CHECK_STATUSES: CheckStatus[] = [
  "passed",
  "failed",
  "error",
  "queued",
  "running",
];

function FilterMenu<T extends string>({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: T | "all";
  options: readonly { value: T; label: string }[];
  onChange: (value: T | "all") => void;
}) {
  const active = value !== "all";
  const current = options.find((option) => option.value === value)?.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MotionButton
          variant="secondary"
          size="sm"
          aria-label={`${label}: ${current ?? allLabel}`}
          className={cn(
            "group/filter h-9 rounded-full font-medium data-[state=open]:border-brand/50",
            active && "border-brand/50 bg-brand/10 text-brand-text",
          )}
        >
          <span className="max-w-40 truncate">{active ? current : label}</span>
          <ChevronDown
            className="size-4 opacity-60 transition-[rotate] duration-(--dur-base) motion-safe:group-data-[state=open]/filter:rotate-180"
            aria-hidden="true"
          />
        </MotionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (next === "all") return onChange("all");
            const option = options.find(
              (candidate) => candidate.value === next,
            );
            if (option) onChange(option.value);
          }}
        >
          <DropdownMenuRadioItem value="all">{allLabel}</DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Filters = Omit<AdminPostsQuery, "status" | "q">;

export const DEFAULT_ADMIN_FILTERS: Filters = {
  check: "all",
  flag: "all",
  category: "all",
  platform: "all",
};

export function AdminFilters({
  filters,
  onChange,
  search,
  onSearchChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  search: string;
  onSearchChange: (search: string) => void;
}) {
  const { t } = useI18n();
  const copy = t.admin.filters;
  const platforms =
    filters.category === "all"
      ? PLATFORM_IDS
      : CATEGORY_PLATFORMS[filters.category];
  const anyActive =
    Object.entries(filters).some(([, value]) => value !== "all") ||
    search !== "";

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="group/search relative lg:w-80">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label={copy.search}
          placeholder={copy.search}
          value={search}
          maxLength={100}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-10 pl-10"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterMenu
          label={copy.category}
          allLabel={copy.allCategories}
          value={filters.category}
          options={[
            { value: "video" as const, label: t.categories.video },
            { value: "static" as const, label: t.categories.static },
          ]}
          onChange={(category) =>
            onChange({
              ...filters,
              category,
              platform:
                category === "all"
                  ? filters.platform
                  : platformForCategory(filters.platform, category),
            })
          }
        />
        <FilterMenu
          label={copy.platform}
          allLabel={copy.allPlatforms}
          value={filters.platform}
          options={platforms.map((id) => ({
            value: id,
            label: PLATFORMS[id].name,
          }))}
          onChange={(platform) => onChange({ ...filters, platform })}
        />
        <FilterMenu
          label={copy.check}
          allLabel={copy.allChecks}
          value={filters.check}
          options={CHECK_STATUSES.map((status) => ({
            value: status,
            label: t.admin.checkStatus[status],
          }))}
          onChange={(check) => onChange({ ...filters, check })}
        />
        <FilterMenu
          label={copy.flag}
          allLabel={copy.allFlags}
          value={filters.flag}
          options={POST_FLAGS.filter(
            (flag) => !RETIRED_FLAGS.includes(flag),
          ).map((flag) => ({
            value: flag,
            label: t.admin.flags[flag],
          }))}
          onChange={(flag) => onChange({ ...filters, flag })}
        />
        {anyActive && (
          <MotionButton
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(DEFAULT_ADMIN_FILTERS);
              onSearchChange("");
            }}
            className="h-9 text-muted-foreground"
          >
            <X aria-hidden="true" />
            {copy.clear}
          </MotionButton>
        )}
      </div>
    </div>
  );
}
