"use client";

import { useId } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import type { MetricSnapshot } from "@/lib/api/types";

const WIDTH = 240;
const HEIGHT = 56;
const PAD = 4;

/** One metric over time as an inline SVG line; manual entries get a dot. */
function Line({
  label,
  points,
  color,
}: {
  label: string;
  points: { at: number; value: number; manual: boolean }[];
  color: string;
}) {
  const { formatCompact } = useI18n();
  const gradientId = useId();
  if (points.length === 0) return null;

  const first = points[0]!.at;
  const last = points.at(-1)!.at;
  const max = Math.max(...points.map((point) => point.value), 1);
  const x = (at: number) =>
    last === first
      ? WIDTH / 2
      : PAD + ((at - first) / (last - first)) * (WIDTH - PAD * 2);
  const y = (value: number) =>
    HEIGHT - PAD - (value / max) * (HEIGHT - PAD * 2);
  const path = points
    .map(
      (point, index) => `${index ? "L" : "M"}${x(point.at)},${y(point.value)}`,
    )
    .join(" ");
  const area = `${path} L${x(last)},${HEIGHT} L${x(first)},${HEIGHT} Z`;

  return (
    <figure className="min-w-0 flex-1">
      <figcaption className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-semibold text-foreground tabular-nums">
          {formatCompact(points.at(-1)!.value)}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-1 h-14 w-full overflow-visible"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points
          .filter((point) => point.manual)
          .map((point) => (
            <circle
              key={point.at}
              cx={x(point.at)}
              cy={y(point.value)}
              r="3"
              fill="var(--bg-elevated)"
              stroke={color}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
      </svg>
    </figure>
  );
}

/** Views (video only) and reactions from the post's snapshots. */
export function MetricSparklines({
  snapshots,
  showViews,
}: {
  snapshots: readonly MetricSnapshot[];
  showViews: boolean;
}) {
  const { t } = useI18n();
  const series = (pick: (snapshot: MetricSnapshot) => number | null) =>
    snapshots.flatMap((snapshot) => {
      const value = pick(snapshot);
      return value === null
        ? []
        : [
            {
              at: Date.parse(snapshot.fetchedAt),
              value,
              manual: snapshot.source === "manual",
            },
          ];
    });

  return (
    <div className="flex gap-4">
      {showViews && (
        <Line
          label={t.metrics.views}
          points={series((snapshot) => snapshot.views)}
          color="var(--brand-primary)"
        />
      )}
      <Line
        label={t.metrics.reactions}
        points={series((snapshot) => snapshot.reactions)}
        color="var(--medal-gold)"
      />
    </div>
  );
}
