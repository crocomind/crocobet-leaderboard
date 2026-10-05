"use client";

import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  TriangleAlert,
  UserCheck,
  UserRound,
  UserX,
} from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { PostCheck, PostFlag } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** The check result as a badge: tag found (with the token), missing, unreadable or running. */
export function CheckBadge({ check }: { check: PostCheck }) {
  const { t } = useI18n();
  switch (check.status) {
    case "passed":
      return (
        <Badge variant="success" title={check.matched.join(", ")}>
          <CircleCheck aria-hidden="true" />
          {check.matched[0] ?? t.admin.checkStatus.passed}
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="warning">
          <TriangleAlert aria-hidden="true" />
          {t.admin.checkStatus.failed}
        </Badge>
      );
    case "error":
      return (
        <Badge variant="danger">
          <CircleAlert aria-hidden="true" />
          {check.error
            ? t.admin.checkErrors[check.error]
            : t.admin.checkStatus.error}
        </Badge>
      );
    default:
      return (
        <Badge>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          {t.admin.checkStatus[check.status]}
        </Badge>
      );
  }
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

/** Owner and window evidence, one line each. */
export function CheckEvidence({
  check,
  className,
}: {
  check: PostCheck;
  className?: string;
}) {
  const { t } = useI18n();
  const { evidence } = t.admin;
  return (
    <span className={cn("flex flex-col gap-1", className)}>
      {check.ownerMatch === true ? (
        <Line icon={<UserCheck aria-hidden="true" />} tone="ok">
          {evidence.owner}
          {check.authorHandle && (
            <span className="break-all text-muted-foreground">
              @{check.authorHandle}
            </span>
          )}
        </Line>
      ) : check.ownerMatch === false ? (
        <Line icon={<UserX aria-hidden="true" />} tone="bad">
          {evidence.ownerMismatch}
          {check.authorHandle && (
            <span className="break-all">@{check.authorHandle}</span>
          )}
        </Line>
      ) : (
        <Line icon={<UserRound aria-hidden="true" />} tone="unknown">
          {check.authorHandle
            ? `@${check.authorHandle}`
            : evidence.ownerUnknown}
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
  "handle_claimed_by_other",
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
  if (flags.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {flags.map((flag) => (
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
