/**
 * AI design system — tokens (the SoT for every AI surface: `/ai-chat` today,
 * any assistant surface that mounts `<AiSurface>` tomorrow).
 *
 * Personality (operator interview 2026-09-26): CALM & PREMIUM — whitespace,
 * soft neutrals, one sparing accent. Trust comes from restraint plus visible
 * work, so:
 *
 * - Every surface is NEUTRAL and follows the app theme (light, dark and every
 *   other palette): the AI neutrals alias the theme's `--ds-color-*` roles.
 * - The accent is an IRIDESCENT gradient used ONLY while the AI is working —
 *   the live step's indicator, the active step row's shimmer, the composer's
 *   edge. Never static chrome.
 * - Corners are soft (12–16px, the composer 20px) — the opposite of the flush
 *   triage ladder.
 *
 * Values here are the ONLY place the look is set; components compose the
 * utilities `tailwind.config.mjs` binds to these vars (`bg-ai-surface`,
 * `rounded-ai-card`, `text-ai-prose`, `max-w-ai-column`, …) or the recipes in
 * `./classes`, and never type a hex, a px radius or a px size.
 *
 * ## Mechanism
 *
 * {@link aiSystemCssText} renders these as CSS custom properties, injected
 * ONCE by `app/layout.tsx` as `<style id="app-ai-system">`. The neutral aliases
 * are declared on `:root` AND on `[data-ai-surface]` (stamped by `AiSurface`):
 * a `var()` inside a custom property resolves where it is declared, so the
 * second declaration is what makes an AI surface follow a task-mode region's
 * remapped neutrals rather than the page root's.
 */

// ── Colour: neutrals (follow the app theme) ─────────────────────────────────

/** AI neutral role → the theme var it aliases. `--ai-<key>` · Tailwind `*-ai-<key>`. */
export const AI_NEUTRALS = {
  /** The page ground the column sits on (and the composer dock's fade). */
  canvas: 'var(--ds-color-background-surface)',
  /** Composer, cards, the side panel. */
  surface: 'var(--ds-color-background-surface)',
  /** Wells — code, skeleton bars, the user bubble. */
  sunken: 'var(--ds-color-surface-sunken)',
  /** Interaction wash (hover / pressed / the open card). */
  hover: 'var(--ds-color-surface-hover)',
  /** Primary ink — the answer prose. */
  ink: 'var(--ds-color-text-primary)',
  /** Secondary ink — the thinking row, card meta. */
  muted: 'var(--ds-color-text-secondary)',
  /** Tertiary ink — kind labels, timings. */
  faint: 'var(--ds-color-text-soft)',
  /** Hairline — card edge, composer edge. */
  line: 'var(--ds-color-border-subtle)',
  /** Emphasis line — control edge, hovered / open card. */
  'line-strong': 'var(--ds-color-border-default)',
  /** The one solid action (send): inverse fill. */
  solid: 'var(--ds-color-surface-inverse)',
  'solid-ink': 'var(--ds-color-text-inverse)',
  /** The operator's own turn — a soft neutral bubble. */
  user: 'var(--ds-color-surface-sunken)',
  'user-ink': 'var(--ds-color-text-primary)',
} as const;

export type AiNeutralKey = keyof typeof AI_NEUTRALS;

// ── Colour: the iridescent accent (AI activity only) ────────────────────────

/**
 * Four hues, violet → blue → teal → pink. Dark lifts them so the shimmer still
 * reads on a dark plane. `--ai-iris-<n>`; composed into the gradient vars
 * below — components use the gradients (`bg-ai-iris`, `AiIrisRing`,
 * `AiIrisSpinner`), never a single stop.
 */
export const AI_IRIS = {
  light: { 1: '#8b5cf6', 2: '#3b82f6', 3: '#14b8a6', 4: '#ec4899' },
  dark: { 1: '#a78bfa', 2: '#60a5fa', 3: '#2dd4bf', 4: '#f472b6' },
} as const;

/** Gradient shapes built from the iris stops (theme-independent structure). */
export const AI_IRIS_GRADIENTS = {
  /** Linear sweep — the active step row's shimmer band. */
  sweep: 'linear-gradient(90deg, transparent 0%, var(--ai-iris-1) 20%, var(--ai-iris-2) 40%, var(--ai-iris-3) 60%, var(--ai-iris-4) 80%, transparent 100%)',
  /** Conic loop — the composer edge and the live-step spinner (rotated). */
  conic: 'conic-gradient(from 0deg, var(--ai-iris-1), var(--ai-iris-2), var(--ai-iris-3), var(--ai-iris-4), var(--ai-iris-1))',
  /** Flat blend — static fills (the live dot). */
  linear: 'linear-gradient(120deg, var(--ai-iris-1), var(--ai-iris-2) 35%, var(--ai-iris-3) 65%, var(--ai-iris-4))',
} as const;

/** Scrim behind the panel when it overlays a narrow viewport. */
export const AI_SCRIM = { light: 'rgb(2 6 23 / 0.28)', dark: 'rgb(0 0 0 / 0.55)' } as const;

// ── Corner radius ───────────────────────────────────────────────────────────

/** Soft 12–16px, the composer 20px. `--ai-radius-<key>` · Tailwind `rounded-ai-<key>`. */
export const AI_RADIUS = {
  /** Inline code, glyph wells. */
  control: '0.5rem',
  /** Chips, icon buttons, step rows. */
  chip: '0.75rem',
  step: '0.75rem',
  /** Cards, panels, the user bubble. */
  card: '1rem',
  panel: '1rem',
  bubble: '1rem',
  /** The composer shell — the softest object on screen. */
  composer: '1.25rem',
} as const;

// ── Type ────────────────────────────────────────────────────────────────────

/**
 * Chat prose type scale. Rem-based (respects the reader's font size); NOT
 * density-scaled — prose is read, not scanned. `--ai-text-<key>` (+ leading /
 * tracking / weight) · Tailwind `text-ai-<key>`.
 */
export const AI_TYPE = {
  /** The one-line empty-state greeting. */
  greeting: { size: '1.625rem', leading: '1.25', tracking: '-0.02em', weight: '600' },
  /** Answer + user prose. */
  prose: { size: '0.9375rem', leading: '1.7', tracking: '0', weight: '400' },
  /** Headings inside an answer; card and panel titles. */
  title: { size: '0.9375rem', leading: '1.4', tracking: '-0.005em', weight: '600' },
  /** Secondary prose — thinking steps, helper copy. */
  'prose-sm': { size: '0.8125rem', leading: '1.55', tracking: '0', weight: '400' },
  /** Chips, kind labels, buttons. */
  label: { size: '0.75rem', leading: '1.35', tracking: '0.01em', weight: '500' },
} as const;

// ── Space + geometry ────────────────────────────────────────────────────────

/**
 * The fixed geometry every AI surface is built on. `--ai-<key>` · Tailwind
 * `max-w-ai-column`, `px-ai-gutter`, `gap-ai-turn`, `w-ai-panel`.
 */
export const AI_SPACE = {
  /** The conversation column's width — one fixed measure, empty or chatting. */
  column: '46rem',
  /** Horizontal padding inside the column. */
  gutter: '1.5rem',
  /** Vertical rhythm between transcript turns. */
  turn: '1.75rem',
  /** Docked side-panel width. */
  panel: 'clamp(24rem, 34vw, 38rem)',
} as const;

// ── Elevation ───────────────────────────────────────────────────────────────

/** Soft ambient + long cast; dark raises alpha. `--ai-shadow-<key>` · `shadow-ai-<key>`. */
export const AI_ELEVATION = {
  light: {
    card: '0 1px 2px rgb(2 6 23 / 0.04)',
    'card-hover': '0 1px 2px rgb(2 6 23 / 0.05), 0 8px 20px -10px rgb(2 6 23 / 0.16)',
    composer: '0 1px 2px rgb(2 6 23 / 0.04), 0 10px 30px -14px rgb(2 6 23 / 0.2)',
    panel: '0 1px 2px rgb(2 6 23 / 0.05), 0 18px 48px -18px rgb(2 6 23 / 0.24)',
  },
  dark: {
    card: '0 1px 2px rgb(0 0 0 / 0.4)',
    'card-hover': '0 1px 2px rgb(0 0 0 / 0.45), 0 10px 24px -10px rgb(0 0 0 / 0.6)',
    composer: '0 1px 2px rgb(0 0 0 / 0.4), 0 12px 34px -14px rgb(0 0 0 / 0.7)',
    panel: '0 1px 2px rgb(0 0 0 / 0.45), 0 20px 56px -18px rgb(0 0 0 / 0.75)',
  },
} as const;

// ── CSS generation ──────────────────────────────────────────────────────────

function schemeDeclarations(scheme: 'light' | 'dark'): string[] {
  return [
    ...Object.entries(AI_IRIS[scheme]).map(([n, value]) => `  --ai-iris-${n}: ${value};`),
    `  --ai-scrim: ${AI_SCRIM[scheme]};`,
    ...Object.entries(AI_ELEVATION[scheme]).map(([key, value]) => `  --ai-shadow-${key}: ${value};`),
  ];
}

function geometryDeclarations(): string[] {
  const lines = Object.entries(AI_IRIS_GRADIENTS).map(([key, value]) => `  --ai-iris-${key}: ${value};`);
  for (const [key, value] of Object.entries(AI_RADIUS)) lines.push(`  --ai-radius-${key}: ${value};`);
  for (const [key, spec] of Object.entries(AI_TYPE)) {
    lines.push(
      `  --ai-text-${key}: ${spec.size};`,
      `  --ai-leading-${key}: ${spec.leading};`,
      `  --ai-tracking-${key}: ${spec.tracking};`,
      `  --ai-weight-${key}: ${spec.weight};`,
    );
  }
  for (const [key, value] of Object.entries(AI_SPACE)) lines.push(`  --ai-${key}: ${value};`);
  return lines;
}

/**
 * The streamed answer's per-block entrance: each new paragraph / list item /
 * heading fades up 2px as it lands (a chunk arriving, never a typewriter).
 * Reduced motion keeps the fade and drops the travel.
 */
const STREAM_KEYFRAMES = `@keyframes ai-chunk-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes ai-chunk-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}`;

/** The generated AI stylesheet — injected by `app/layout.tsx` as `<style id="app-ai-system">`. */
export function aiSystemCssText(): string {
  const neutrals = Object.entries(AI_NEUTRALS).map(([key, value]) => `  --ai-${key}: ${value};`);
  return [
    `:root {\n${[...schemeDeclarations('light'), ...geometryDeclarations()].join('\n')}\n}`,
    `html[data-color-scheme='dark'] {\n${schemeDeclarations('dark').join('\n')}\n}`,
    `:root,\n[data-ai-surface] {\n${neutrals.join('\n')}\n}`,
    STREAM_KEYFRAMES,
  ].join('\n\n');
}

export const aiSystemStyleText = aiSystemCssText();
