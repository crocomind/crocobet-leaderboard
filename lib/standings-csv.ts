/**
 * CSV standings export, shared by the server and the mock API. Excel opens
 * the file correctly thanks to the BOM (Georgian names), and cells that a
 * spreadsheet would run as formulas are neutralized.
 */

export interface StandingsRow {
  rank: number;
  name: string;
  email: string;
  department: string;
  posts: number;
  /** null on the static board. */
  views: number | null;
  reactions: number;
  score: number;
  urls: readonly string[];
}

export const STANDINGS_HEADER = [
  "rank",
  "name",
  "email",
  "department",
  "posts",
  "views",
  "reactions",
  "score",
  "post_urls",
] as const;

function cell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  // CSV injection: a leading =, +, - or @ would run as a formula.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function standingsCsv(rows: readonly StandingsRow[]): string {
  const lines = [
    STANDINGS_HEADER.join(","),
    ...rows.map((row) =>
      [
        row.rank,
        row.name,
        row.email,
        row.department,
        row.posts,
        row.views,
        row.reactions,
        row.score,
        row.urls.join(" "),
      ]
        .map(cell)
        .join(","),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** e.g. "croco-standings-video-week-2026-10-12.csv". */
export function standingsFilename(
  category: string,
  period: string,
  startDate: string,
): string {
  return `croco-standings-${category}-${period}-${startDate}.csv`;
}
