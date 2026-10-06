import { Inter } from 'next/font/google';

/**
 * CycleForge type — Inter is the only family (operator ruling 2026-10-04).
 * Exact identifiers (SKU, serial, tracking and order numbers) wear the `mono`
 * token, which resolves to this same Inter stack with tabular figures and no
 * ligatures (src/app/globals.css `.font-mono`).
 */
export const cfSans = Inter({
  subsets: ['latin'],
  // Inter's variable normal face is one `next/font` request. Asking the Google
  // loader for normal + italic generated multiple virtual font entries, which
  // Turbopack 16.3 rejected while resolving its internal font module.
  // Italic text uses the browser's synthesized italic face from this one family.
  variable: '--font-cf-sans',
  display: 'swap',
});
