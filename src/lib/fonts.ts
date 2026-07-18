import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

/**
 * Kinetic Ledger type — IBM Plex (Carbon-adjacent) for dense ops rows.
 * CSS vars are stamped on `<html>` from `app/layout.tsx`; stacks live in
 * `design-system/tokens/typography/families.ts`.
 */
export const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});
