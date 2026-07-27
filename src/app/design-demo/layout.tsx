import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Design-system showcase — **dev/preview only**.
 *
 * These six routes exist to exercise DS primitives in isolation (id chips, the
 * photo-peek fan, card fan, substitution flows). They are real dev tooling —
 * `tests/measure.mjs`, `tests/shot.mjs`, and `design-demo-showcase.spec.ts` all
 * drive them — so they are gated, not deleted.
 *
 * In a production build every `/design-demo/*` route 404s: the pages stay out of
 * the shipped route surface (and their component graphs out of the prod client
 * bundle) while remaining available on `next dev` and preview deploys.
 *
 * Page-count / IA context: `docs/todo/page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md`.
 */
export default function DesignDemoLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <>{children}</>;
}
