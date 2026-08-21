/**
 * Pure field math for {@link UniversalLoader} — no React, no DOM, no motion.
 *
 * Split out so the branchy half (color parsing, the CSS lattice) is unit
 * testable without mounting a canvas, and so a test importing it does not drag
 * the motion engine into a node runner.
 */

/** Idle dot radius, in CSS px. Fine grain: the field is chrome, not texture. */
export const BASE_RADIUS = 0.75;

/**
 * Idle dot opacity. Not the 0.2 this pattern usually ships with: against the
 * canvas plane (`#eef2f7` in light) a 0.2 slate dot resolves to about a five-
 * value delta — measured invisible, not subtle.
 *
 * It rose again with {@link BASE_RADIUS}: a 1px dot covers under half the area
 * of the 1.5px one this started at, and antialiasing eats the edge of a circle
 * that small, so the same alpha would have re-lost the field the moment the
 * dots shrank. Opacity buys back what radius gave up.
 */
export const IDLE_ALPHA = 0.6;

export type RGB = readonly [number, number, number];

/** Slate-400 / blue-600 — used only if a theme var is unresolvable. */
export const FALLBACK_IDLE: RGB = [148, 163, 184];
export const FALLBACK_ACTIVE: RGB = [37, 99, 235];

/**
 * Parse a **resolved** CSS color to RGB. `getComputedStyle` hands back whatever
 * the theme literally wrote, which across our palettes is `#rgb` / `#rrggbb` /
 * `rgb()` / `rgba()`. Anything else falls back rather than painting NaN.
 */
export function parseCssColor(raw: string, fallback: RGB): RGB {
  const value = raw.trim();
  if (!value) return fallback;

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      const [r, g, b] = [...hex].map((c) => Number.parseInt(c + c, 16));
      return [r, g, b] as RGB;
    }
    // 8-digit hex: the alpha byte is dropped — the field owns its own alpha.
    if (hex.length === 6 || hex.length === 8) {
      const parsed = [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ];
      return parsed.some(Number.isNaN) ? fallback : (parsed as unknown as RGB);
    }
    return fallback;
  }

  const numbers = value.match(/-?\d*\.?\d+/g);
  if (!numbers || numbers.length < 3) return fallback;
  return [
    Math.round(Number(numbers[0])),
    Math.round(Number(numbers[1])),
    Math.round(Number(numbers[2])),
  ] as RGB;
}

/** Dot alpha at a given interaction intensity (0 = idle, 1 = full). */
export function dotAlpha(intensity: number): number {
  return IDLE_ALPHA + intensity * (1 - IDLE_ALPHA);
}

/** Blend idle → active by intensity, as an `rgba()` string. */
export function dotFill(idle: RGB, active: RGB, intensity: number): string {
  if (intensity <= 0) {
    return `rgba(${idle[0]}, ${idle[1]}, ${idle[2]}, ${IDLE_ALPHA})`;
  }
  const [r, g, b] = [0, 1, 2].map((i) =>
    Math.round(idle[i] + (active[i] - idle[i]) * intensity),
  );
  return `rgba(${r}, ${g}, ${b}, ${dotAlpha(intensity)})`;
}

/**
 * The JS-free twin of the canvas lattice — one dot per `spacing` cell, straight
 * off the theme token, so the server HTML already carries the field. See the
 * pre-hydration note on {@link UniversalLoader}.
 */
export function latticeStyle(spacing: number): {
  backgroundImage: string;
  backgroundSize: string;
} {
  const dot = `color-mix(in oklab, var(--ds-color-text-faint) ${IDLE_ALPHA * 100}%, transparent)`;
  return {
    backgroundImage: `radial-gradient(circle, ${dot} ${BASE_RADIUS}px, transparent ${BASE_RADIUS + 0.5}px)`,
    backgroundSize: `${spacing}px ${spacing}px`,
  };
}
