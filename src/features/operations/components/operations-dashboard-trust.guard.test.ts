/**
 * Guard — Ops dashboard trust & finish (H1 Phases A + B).
 *
 * A) Honest realtime: the Live pill derives from the shared connection store,
 *    never a hardcoded `ablyStatus="connected"` (which lied while realtime was
 *    down). The mapping is a thin adapter over `useRealtimeLink()`.
 * B) Four settled states: the snapshot hook surfaces `isError` + `refetch`, and
 *    the dashboard paints a localized degraded band with Retry instead of blank
 *    KPI tiles that read as a quiet warehouse.
 *
 * Run: `tsx --test src/features/operations/components/operations-dashboard-trust.guard.test.ts`
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { realtimeLinkToAblyStatus } from '@/features/operations/components/operations-live-status';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('Ops dashboard trust & finish', () => {
  it('A — realtimeLinkToAblyStatus never claims Live unless genuinely healthy', () => {
    assert.equal(realtimeLinkToAblyStatus({ health: 'healthy', degraded: false }), 'connected');
    assert.equal(realtimeLinkToAblyStatus({ health: 'wobbling', degraded: false }), 'connecting');
    assert.equal(realtimeLinkToAblyStatus({ health: 'unknown', degraded: false }), 'connecting');
    assert.equal(realtimeLinkToAblyStatus({ health: 'degraded', degraded: false }), 'disconnected');
    // The debounced degraded flag wins even if the raw health lags.
    assert.equal(realtimeLinkToAblyStatus({ health: 'healthy', degraded: true }), 'disconnected');
  });

  it('A — the dashboard wires the mapping and drops the hardcoded literal', () => {
    const dash = read('src/features/operations/components/OperationsDashboard.tsx');
    assert.doesNotMatch(dash, /ablyStatus="connected"/, 'no hardcoded Live pill');
    assert.match(dash, /ablyStatus=\{realtimeLinkToAblyStatus\(realtimeLink\)\}/);
    assert.match(dash, /useRealtimeLink\(\)/);
  });

  it('B — the snapshot hook surfaces isError + refetch (no error-swallow)', () => {
    const hook = read('src/features/operations/components/useOperationsDashboardData.ts');
    assert.match(hook, /const \{ data, isLoading, isError, refetch \} = useQuery/);
    assert.match(hook, /return \{ data, isLoading, isError, refetch \}/);
    // Bounded so a hung snapshot can't pin the Monitor.
    assert.match(hook, /AbortSignal\.timeout\(OPERATIONS_DASHBOARD_FETCH_TIMEOUT_MS\)/);
  });

  it('B — the dashboard paints a retryable degraded band on error', () => {
    const dash = read('src/features/operations/components/OperationsDashboard.tsx');
    assert.match(dash, /isError \?/);
    assert.match(dash, /<GridDegradedBox[\s\S]*?onRetry=\{\(\) => \{[\s\S]*?refetch\(\)/);
  });

  it('B — zero KPI tiles are suppressed when error and no cached data', () => {
    const dash = read('src/features/operations/components/OperationsDashboard.tsx');
    assert.match(dash, /snapshotEmpty = isError && !data/);
    assert.match(dash, /!snapshotEmpty \?[\s\S]*?<PrimaryKpiGrid/);
  });
});
