import { createLucideIcon } from "lucide-react";

// Lucide v1 removed brand icons. These keep the Lucide stroke style and API
// (size, strokeWidth, className, ...) so they sit next to the rest of the
// icon set. Instagram, Facebook and LinkedIn are the original Lucide shapes
// (ISC license); TikTok is drawn to match.

export const InstagramIcon = createLucideIcon("instagram", [
  [
    "rect",
    {
      width: "20",
      height: "20",
      x: "2",
      y: "2",
      rx: "5",
      ry: "5",
      key: "ig-frame",
    },
  ],
  [
    "path",
    { d: "M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z", key: "ig-lens" },
  ],
  ["line", { x1: "17.5", x2: "17.51", y1: "6.5", y2: "6.5", key: "ig-dot" }],
]);

export const FacebookIcon = createLucideIcon("facebook", [
  [
    "path",
    {
      d: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",
      key: "fb-f",
    },
  ],
]);

export const TikTokIcon = createLucideIcon("tiktok", [
  ["path", { d: "M12.5 2.5v12.25a3.75 3.75 0 1 1-3.75-3.75", key: "tt-note" }],
  ["path", { d: "M12.5 2.5c0 3.3 2.7 6 6 6", key: "tt-flag" }],
]);

export const LinkedInIcon = createLucideIcon("linkedin", [
  [
    "path",
    {
      d: "M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z",
      key: "li-n",
    },
  ],
  ["rect", { width: "4", height: "12", x: "2", y: "9", key: "li-i" }],
  ["circle", { cx: "4", cy: "4", r: "2", key: "li-dot" }],
]);
