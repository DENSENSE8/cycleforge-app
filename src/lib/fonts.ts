import { IBM_Plex_Mono, IBM_Plex_Sans_Condensed, Inter } from 'next/font/google';

/**
 * Kinetic Ledger type — **Inter** for the sans cut, IBM Plex for the two
 * specialist cuts. CSS vars are stamped on `<html>` from `app/layout.tsx`;
 * stacks live in `design-system/tokens/typography/families.ts` and are mirrored
 * byte-for-byte in `styles/globals.css`.
 *
 *   Sans (Inter)          → display / title / body / data / caption
 *   Condensed (Plex)      → eyebrow / micro (dense chrome — 10–11px stays
 *                           legible without wrapping in a grid; bound
 *                           intrinsically by `text-role-*`)
 *   Mono (Plex)           → identifiers (serial / FNSKU / tracking / SKU)
 *
 * ## Why the sans cut changed (2026-08-02)
 *
 * This reverses the "one macro-family, three cuts" rule that stood here. It was
 * a deliberate product call, not drift: the spine and every dense row live at
 * 12–14px, and IBM Plex Sans has a comparatively small x-height at that size.
 * Inter was drawn for screen UI specifically — larger x-height, more open
 * apertures, tighter default spacing at small optical sizes — so the same 13px
 * row reads measurably better without any layout change.
 *
 * It is a SWAP, not a second language. There is still exactly one sans face;
 * every `text-role-*` still resolves through the same stack. Do not add a
 * second display / heading face on top of this — that is the thing the old rule
 * was protecting, and it still holds.
 *
 * ## Why the other two cuts stayed IBM Plex
 *
 * - **Condensed**: Inter ships no condensed cut on Google Fonts. That cut is
 *   load-bearing — `text-role-eyebrow` / `-micro` bind it so 10–11px chrome
 *   fits a grid column without wrapping. Swapping it for a normal-width face
 *   would widen every eyebrow in the app and wrap grid headers, which is a
 *   layout regression dressed as a font change.
 * - **Mono**: identifiers must be retypable and must never ligate (an `fi` in a
 *   serial produces a string the operator cannot key back in). Plex Mono is
 *   already tuned for that, and Inter has no monospace sibling.
 *
 * Both are flagged as follow-ups in the typography handoff, not as settled
 * forever.
 *
 * ## Weights stop at 600 on the sans and condensed cuts
 *
 * 700+ bleeds pixels at small sizes on the 1080p warehouse monitors this UI
 * lives on, and hierarchy here comes from colour contrast + tracking (Linear
 * discipline), not from ink. Loading the weight at all is what lets it drift
 * back in — so it is not loaded.
 *
 * **Exception — mono 700 (owner 2026-09-25, BRIEF §4 industrial):** industrial
 * labels and IDs are "mono heavy uppercase". With 600 the heaviest cut, the
 * record faces' `font-bold`/`extrabold`/`black` all rendered as the same 600
 * (measured: identical ink at 600–900). Plex Mono 700 costs one latin woff2
 * (14.9 KB; the 600 file is 15.6 KB). Inter stays capped at 600.
 *
 * NOTE: Inter is a variable font, and requesting it without an explicit
 * `weight` array would ship the whole 100–900 axis — which would make a stray
 * `font-bold` render at a real 700 and quietly defeat the cap that
 * `typography/weights.ts` + the guard exist to hold. Keep the discrete list.
 */
export const cfSans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-cf-sans',
  display: 'swap',
});

/**
 * Inter's REAL italic cut, loaded for ONE consumer: the kiosk attract wordmark,
 * which paints a tenant's logotype (`src/app/kiosk/AttractLoop.tsx`). Without it
 * the browser synthesises an oblique at an engine-dependent angle, which is not
 * good enough for a brand mark sitting on an always-on front-desk screen. This
 * is NOT a licence for italic app chrome — hierarchy here still comes from
 * colour and tracking, never from slant.
 *
 * `preload: false` and a SEPARATE call, not `style: ['normal','italic']` on the
 * cut above: next/font preloads every file a call produces, so folding italic
 * into the app's sans put three faces nothing outside the kiosk renders into the
 * `<head>` of every document, at the priority reserved for what paints first.
 * Split out, the browser fetches them when the kiosk actually asks.
 */
export const cfSansItalic = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['italic'],
  variable: '--font-cf-sans-italic',
  display: 'swap',
  preload: false,
});

export const ibmPlexSansCondensed = IBM_Plex_Sans_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-condensed',
  display: 'swap',
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

/**
 * ## The spine has no cut of its own
 *
 * It used to load **Overpass** — a highway-gothic face — for the master nav
 * alone, which put three sans faces in one column: Overpass for the rows, Plex
 * Condensed for the micro chrome inside them, Inter for everything the column
 * sat next to. A navigator that does not share the app's letterforms reads as a
 * different application bolted to the side of this one, and at 13px the
 * signage face's wider, flatter shapes were the least legible of the three.
 *
 * `font-spine` still exists as a Tailwind family so the spine keeps ONE place
 * to bind type — it resolves to the app sans (`--ds-font-sans` / Inter).
 * Condensed eyebrow / micro stay Plex unless a `.font-spine` override binds
 * them to the same sans. This also dropped a preloaded font file from every
 * document.
 */
