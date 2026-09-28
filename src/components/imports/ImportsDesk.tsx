'use client';

/**
 * Operations › **Imports** (`/operations/imports`) — the import record: what
 * each import brought in, order by order (handoff 2026-09-28). Two views on
 * the To-ship triage face, filtered from the contextual sidebar (the sidebar
 * writes the URL; the lists forward it to the API verbatim): Runs (bare
 * `?view`) and Orders (`?view=rows`).
 */

import { useSearchParams } from 'next/navigation';
import { ImportRowsList } from './ImportRowsList';
import { ImportRunsList } from './ImportRunsList';

export function ImportsDesk() {
  return useSearchParams().get('view') === 'rows' ? <ImportRowsList /> : <ImportRunsList />;
}
