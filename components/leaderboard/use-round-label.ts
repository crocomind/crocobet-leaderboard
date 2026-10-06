"use client";

import { useI18n } from "@/components/providers/i18n-provider";
import type { RoundRef } from "@/lib/api/types";

/** A round's name, or its automatic label: "Week 3", or the month ("October"). */
export function useRoundLabel() {
  const { t, format, formatMonth } = useI18n();
  return (round: RoundRef, startIso: string, timeZone: string) =>
    round.name ??
    (round.kind === "week"
      ? format(t.rounds.week, { number: round.number })
      : formatMonth(startIso, timeZone));
}
