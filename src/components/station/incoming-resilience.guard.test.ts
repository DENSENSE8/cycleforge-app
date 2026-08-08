/**
 * Guard — /incoming loading resilience (the flagship "feels broken" fix).
 *
 * The Inbound desk used to gate a 12-row skeleton on a single un-timed,
 * un-retryable, error-swallowing client fetch with no SSR seed — so a slow or
 * failing `/api/receiving-lines` pinned the skeleton indefinitely. This pins the
 * four moving parts of the fix so they can't silently regress:
 *   1. the shared lines fetch is time-bounded (AbortSignal.timeout);
 *   2. the data hook surfaces isError + refetch (the fourth settled state);
 *   3. the incoming grid renders the retryable GridDegradedBox on error+empty;
 *   4. /incoming SSR-seeds its list so first paint is rows, not skeleton.
 *
 * Run: `tsx --test src/components/station/incoming-resilience.guard.test.ts`
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { RECEIVING_LINES_FETCH_TIMEOUT_MS } from '@/lib/queries/receiving-queries';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('/incoming loading resilience', () => {
  it('1 — the shared lines fetch is time-bounded so it can never hang forever', () => {
    const q = read('src/lib/queries/receiving-queries.ts');
    assert.match(q, /AbortSignal\.timeout\(RECEIVING_LINES_FETCH_TIMEOUT_MS\)/);
    assert.ok(
      Number.isFinite(RECEIVING_LINES_FETCH_TIMEOUT_MS) && RECEIVING_LINES_FETCH_TIMEOUT_MS > 0,
      'timeout must be a positive number of ms',
    );
  });

  it('2 — the data hook surfaces isError + refetch (no more error-swallow)', () => {
    const hook = read('src/components/station/useReceivingLinesData.ts');
    // Consumed from the query layer…
    assert.match(hook, /const \{ data, isLoading, isError, refetch \} = useReceivingLinesQuery/);
    // …and returned to the table.
    assert.match(hook, /return \{ data, isLoading, isError, refetch,/);
    assert.match(hook, /isError: boolean/);
  });

  it('3 — the incoming grid renders a retryable degraded state on error+empty', () => {
    const table = read('src/components/station/ReceivingLinesTable.tsx');
    assert.match(table, /import \{ GridDegradedBox \}/);
    // Gate: incoming + authoritative fetch failed + nothing to paint.
    assert.match(
      table,
      /incomingDegraded\s*=\s*isIncomingMode && isError && localRows\.length === 0/,
    );
    // Rendered with a retry wired to the hook's refetch.
    assert.match(table, /<GridDegradedBox onRetry=\{refetch\} \/>/);
  });

  it('4 — /incoming SSR-seeds its list so first paint is rows, not skeleton', () => {
    const page = read('src/app/incoming/page.tsx');
    assert.match(page, /seedIncomingLines/);
    assert.match(page, /<HydrationBoundary state=\{seed\.state\}>/);
    const seed = read('src/lib/queries/incoming-seed.server.ts');
    // Seeds the SAME key the client mounts (mode.queryKey), full phase.
    assert.match(seed, /RECEIVING_MODES\.incoming/);
    assert.match(seed, /queryClient\.setQueryData\(key, data\)/);
  });
});
