/**
 * AI design system — class recipes.
 *
 * Every recipe is a static string of AI utilities (`tailwind.config.mjs` binds
 * them to the vars in `./tokens`), so Tailwind's scanner sees each class and a
 * surface composes a ROLE instead of re-typing a corner, a colour and a size.
 * Compose with `cn()`; add layout (margin, flex) at the call site, never a
 * second colour / radius / type size.
 *
 * Static chrome is NEUTRAL. The iridescent accent appears only through the
 * activity primitive (`AiTextShimmer`, the live thinking line).
 */

/** Root plane of an AI surface — `AiSurface` wears it. */
export const AI_SURFACE_CLASS = 'bg-ai-canvas text-ai-ink';

/**
 * The conversation column: one fixed measure, centred in whatever width the
 * surface leaves it. No chrome — the page itself is the frame; the transcript
 * scrolls with the page area and the composer docks to its bottom.
 */
export const AI_COLUMN_CLASS = 'mx-auto w-full max-w-ai-column px-ai-gutter';

/**
 * The composer's bottom dock while chatting: sticky to the foot of the scrolling
 * page area over a canvas fade, so text scrolling under it stays legible. Not a
 * box — no border, no shadow; the composer shell is the only surface in it.
 */
export const AI_COMPOSER_DOCK_CLASS = 'sticky bottom-0 bg-gradient-to-t from-ai-canvas from-70% to-transparent';

/** Answer prose. */
export const AI_PROSE_CLASS = 'text-ai-prose text-ai-ink';

/** Quiet meta label — kind, count, provenance. */
export const AI_LABEL_CLASS = 'text-ai-label text-ai-faint';

/** The operator's own turn: a soft right-aligned neutral bubble. */
export const AI_USER_BUBBLE_CLASS =
  'ml-auto w-fit max-w-[85%] rounded-ai-bubble bg-ai-user px-4 py-2.5 text-ai-prose text-ai-user-ink';

/** Focus ring — neutral; the accent is reserved for AI activity. */
export const AI_FOCUS_CLASS =
  'outline-none focus-visible:ring-2 focus-visible:ring-ai-line-strong focus-visible:ring-offset-2 focus-visible:ring-offset-ai-canvas';

/** The composer shell. Focus is shown on the shell, not the textarea. */
export const AI_COMPOSER_SHELL_CLASS =
  'rounded-ai-composer border border-ai-line bg-ai-surface shadow-ai-composer transition-[border-color,box-shadow] duration-200 focus-within:border-ai-line-strong';

/** A quiet suggestion chip (empty state only, three at most). */
export const AI_CHIP_CLASS =
  'inline-flex items-center rounded-ai-chip border border-ai-line bg-ai-surface px-3.5 py-1.5 text-ai-label text-ai-muted transition-colors duration-150 hover:border-ai-line-strong hover:bg-ai-hover hover:text-ai-ink';

/** Icon button — quiet by default. */
export const AI_ICON_BUTTON_CLASS =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ai-chip text-ai-muted transition-colors duration-150 hover:bg-ai-hover hover:text-ai-ink disabled:pointer-events-none disabled:opacity-40';

/** The one solid action (send) — inverse neutral, never the accent. */
export const AI_PRIMARY_BUTTON_CLASS =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ai-chip bg-ai-solid text-ai-solid-ink transition-opacity duration-150 hover:opacity-90 disabled:pointer-events-none disabled:opacity-40';

/**
 * Stop — the send slot while a turn runs: a square stop key a size up from
 * send, surface fill with the danger edge and a danger square, so it reads as
 * the one thing to press without shouting in the accent.
 */
export const AI_STOP_BUTTON_CLASS =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ai-chip border-[1.5px] border-border-danger bg-ai-surface text-text-danger transition-colors duration-150 hover:bg-surface-danger';

/** A click-to-copy identifier (SKU, FNSKU, bin) — mono face, quiet edge. */
export const AI_ID_CHIP_CLASS =
  'inline-flex max-w-full items-center gap-1 rounded-ai-control border border-ai-line bg-ai-surface px-1.5 py-px align-baseline font-mono text-[0.875em] leading-snug text-ai-ink transition-colors duration-150 hover:border-ai-line-strong hover:bg-ai-hover';

/** Small solid pill — the one affirmative action in a notice. */
export const AI_ACTION_CLASS =
  'inline-flex items-center rounded-ai-chip bg-ai-solid px-3 py-1 text-ai-label text-ai-solid-ink transition-opacity duration-150 hover:opacity-90';

/** Compact artifact card in the transcript. */
export const AI_CARD_CLASS =
  'rounded-ai-card border border-ai-line bg-ai-surface shadow-ai-card transition-[border-color,box-shadow,background-color] duration-200 hover:border-ai-line-strong hover:shadow-ai-card-hover';

/** The card that is open in the side panel. */
export const AI_CARD_SELECTED_CLASS = 'border-ai-line-strong bg-ai-hover';

/** Glyph well on a card / panel header — the kind's icon sits in it. */
export const AI_CARD_GLYPH_CLASS =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-ai-control bg-ai-sunken text-ai-muted';

/** A skeleton bar (pending card, pending panel body). */
export const AI_SKELETON_BAR_CLASS = 'block rounded-full bg-ai-sunken';

/** The side panel sheet (docked or overlaid). */
export const AI_PANEL_CLASS = 'rounded-ai-panel border border-ai-line bg-ai-surface shadow-ai-panel';

/** Inline notice band in the column (CSV offer, stale answer). */
export const AI_NOTICE_CLASS = 'rounded-ai-card border border-ai-line bg-ai-sunken px-3.5 py-2.5';
