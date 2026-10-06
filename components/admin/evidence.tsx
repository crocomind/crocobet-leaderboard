"use client";

import {
  AtSign,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CircleAlert,
  CircleCheck,
  Hash,
  LoaderCircle,
  TriangleAlert,
  CircleX,
} from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { type PostCheck, type PostFlag, RETIRED_FLAGS } from "@/lib/api/types";
import { tagParts } from "@/lib/campaign-tag";
import { cn } from "@/lib/utils";

/** The check result as a badge: what matched, what's missing, unreadable or running. */
export function CheckBadge({
  check,
  className,
}: {
  check: PostCheck;
  className?: string;
}) {
  const { t } = useI18n();
  const [variant, icon, label] =
    check.status === "passed"
      ? ([
          "success",
          <CircleCheck key="icon" aria-hidden="true" />,
          t.admin.checkStatus.passed,
        ] as const)
      : check.status === "failed"
        ? ([
            "warning",
            <TriangleAlert key="icon" aria-hidden="true" />,
            t.admin.checkStatus.failed,
          ] as const)
        : check.status === "error"
          ? ([
              "danger",
              <CircleAlert key="icon" aria-hidden="true" />,
              check.error
                ? t.admin.checkErrors[check.error]
                : t.admin.checkStatus.error,
            ] as const)
          : ([
              "neutral",
              <LoaderCircle
                key="icon"
                className="animate-spin"
                aria-hidden="true"
              />,
              t.admin.checkStatus[check.status],
            ] as const);
  return (
    // Long labels truncate in narrow layouts; the full text is in the tooltip.
    <Badge
      variant={variant}
      title={check.matched.length > 0 ? check.matched.join(" ") : label}
      className={cn("max-w-full", className)}
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
    </Badge>
  );
}

function Line({
  icon,
  tone,
  children,
}: {
  icon: ReactNode;
  tone: "ok" | "bad" | "unknown";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs [&_svg]:size-3.5 [&_svg]:shrink-0",
        tone === "ok" && "text-success-text",
        tone === "bad" && "text-danger-text",
        tone === "unknown" && "text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Hashtag, Croco Squad tag and window evidence, one line each. */
export function CheckEvidence({
  check,
  className,
}: {
  check: PostCheck;
  className?: string;
}) {
  const { t } = useI18n();
  const { evidence } = t.admin;
  // Only once the check has read the post.
  const found = check.tagFound === null ? null : tagParts(check.matched);
  return (
    <span className={cn("flex flex-col gap-1", className)}>
      {/* What was found (either one is enough), or that neither was. */}
      {found?.hashtag && (
        <Line icon={<Hash aria-hidden="true" />} tone="ok">
          {evidence.hashtag}
        </Line>
      )}
      {found?.mention && (
        <Line icon={<AtSign aria-hidden="true" />} tone="ok">
          {evidence.mention}
        </Line>
      )}
      {found && !found.hashtag && !found.mention && (
        <Line icon={<CircleX aria-hidden="true" />} tone="bad">
          {evidence.none}
        </Line>
      )}
      {check.publishedInWindow === true ? (
        <Line icon={<CalendarCheck aria-hidden="true" />} tone="ok">
          {evidence.inWindow}
        </Line>
      ) : check.publishedInWindow === false ? (
        <Line icon={<CalendarX aria-hidden="true" />} tone="bad">
          {evidence.outsideWindow}
        </Line>
      ) : (
        <Line icon={<CalendarClock aria-hidden="true" />} tone="unknown">
          {evidence.windowUnknown}
        </Line>
      )}
    </span>
  );
}

const SERIOUS_FLAGS = new Set<PostFlag>([
  "suspicious_growth",
  "unavailable",
  "tag_removed",
]);
const INFO_FLAGS = new Set<PostFlag>([
  "category_reclassified",
  "published_date_uncertain",
]);

export function FlagBadges({
  flags,
  className,
}: {
  flags: readonly PostFlag[];
  className?: string;
}) {
  const { t } = useI18n();
  const shown = flags.filter((flag) => !RETIRED_FLAGS.includes(flag));
  if (shown.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((flag) => (
        <Badge
          key={flag}
          title={t.admin.flags[flag]}
          variant={
            SERIOUS_FLAGS.has(flag)
              ? "danger"
              : INFO_FLAGS.has(flag)
                ? "neutral"
                : "warning"
          }
          className="max-w-full px-2"
        >
          <span className="truncate">{t.admin.flags[flag]}</span>
        </Badge>
      ))}
    </span>
  );
}
