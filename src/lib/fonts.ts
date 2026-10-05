import { Inter } from 'next/font/google';

/**
 * CycleForge type — Inter is the only family (operator ruling 2026-10-04).
 * Exact identifiers (SKU, serial, tracking and order numbers) wear the `mono`
 * token, which resolves to this same Inter stack with tabular figures and no
 * ligatures (src/app/globals.css `.font-mono`).
 */
export const cfSans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  // Normal AND italic in ONE query: a second Inter() call for the italic cut
  // made Turbopack's font import map carry two entries for the family and the
  // whole app failed to compile from a cold .next ("next/font/google queries
  // have exactly one entry", 2026-09-30).
  style: ['normal', 'italic'],
  variable: '--font-cf-sans',
  display: 'swap',
});

/** Kept as an alias: the italic cut now rides {@link cfSans}. */
export const cfSansItalic = cfSans;

/** ## The spine has no cut of its own */
