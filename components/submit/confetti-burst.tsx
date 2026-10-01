"use client";

import { motion } from "motion/react";
import { EASE_OUT_SOFT } from "@/lib/motion";

const COLORS = [
  "var(--brand-primary)",
  "var(--brand-primary-bright)",
  "var(--medal-gold)",
  "var(--text-primary)",
  "var(--brand-primary-deep)",
];

const COUNT = 28;

// Deterministic "random" spread so render stays pure.
const PARTICLES = Array.from({ length: COUNT }, (_, i) => {
  const jitter = ((i * 37) % 11) / 11;
  const angle = (i / COUNT) * Math.PI * 2 + jitter * 0.6;
  const distance = 72 + ((i * 53) % 7) * 13;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance * 0.85,
    rotate: ((i * 71) % 360) - 180,
    color: COLORS[i % COLORS.length],
    round: i % 3 === 0,
    delay: (i % 5) * 0.02,
  };
});

/** A light, one-shot confetti burst from the center of its parent. Not rendered with reduced motion. */
export function ConfettiBurst() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 size-0"
    >
      {PARTICLES.map((particle, i) => (
        <motion.span
          key={i}
          className={
            particle.round
              ? "absolute size-2 rounded-full"
              : "absolute h-2.5 w-1.5 rounded-[2px]"
          }
          style={{ backgroundColor: particle.color, left: -3, top: -4 }}
          initial={{ x: 0, y: 0, scale: 0.4, opacity: 1, rotate: 0 }}
          animate={{
            x: particle.x,
            y: [0, particle.y, particle.y + 36],
            scale: [0.4, 1, 0.9],
            opacity: [1, 1, 0],
            rotate: particle.rotate,
          }}
          transition={{
            duration: 1.15,
            delay: 0.38 + particle.delay,
            ease: EASE_OUT_SOFT,
            times: [0, 0.55, 1],
          }}
        />
      ))}
    </span>
  );
}
