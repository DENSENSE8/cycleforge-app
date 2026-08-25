/**
 *   node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     --test src/lib/assistant/tools/session-tools.test.ts
 *
 * (The shim is what `scripts/run-unit-tests.mjs` uses; `./index` reaches
 * `@/lib/tenancy/db` → `@/lib/db`, which carries `import 'server-only'`.)
 *
 * DB-free: the rollup reader is injected through the standard deps extension
 * slot, so these assert the two things the adapter layer is actually
 * responsible for — WHOSE sessions it reads (never the model's choice), and
 * that it hands the duration flags through instead of flattening them.
 *
 * The metric arithmetic itself is pinned next door in
 * `src/lib/sessions/session-metrics.test.ts`; re-asserting it here would only
 * pin it twice.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runAssistantTool } from './index';
import type { AssistantToolCtx, AssistantToolDeps } from './types';
import type { SessionToolDeps } from './session-tools';

const ORG = '11111111-2222-3333-4444-555555555555';

function ctxWith(perms: string[], staffId: number | null = 7): AssistantToolCtx {
  return { organizationId: ORG, staffId, permissions: new Set(perms) };
}

const RUNNING = {
  ms: 3_600_000,
  provisional: true,
  measured: true,
} as const;
const UNMEASURED = { ms: 0, provisional: false, measured: false } as const;

function seriesResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sessions: [
      {
        session: {
          id: 41,
          organizationId: ORG,
          kind: 'scan' as const,
          scanType: 'unbox' as const,
          armed: true,
          surfaceKey: 'unbox',
          status: 'open' as const,
          version: 3,
          staffId: 7,
          claimedByStaffId: null,
          claimExpiresAt: null,
          deviceId: null,
          clientEventId: 'ce-1',
          startedAt: '2026-08-22T09:00:00.000Z',
          endedAt: null,
          state: {},
        },
        metric: {
          sessionId: 41,
          status: 'open' as const,
          startedAt: '2026-08-22T09:00:00.000Z',
          endedAt: null,
          staffId: 7,
          active: RUNNING,
          parked: UNMEASURED,
          wall: RUNNING,
          gapBefore: {
            from: '2026-08-22T07:30:00.000Z',
            to: '2026-08-22T09:00:00.000Z',
            ms: 5_400_000,
            classification: 'unknown' as const,
          },
          workedByStaffIds: [7],
        },
      },
    ],
    totals: {
      sessionCount: 1,
      active: RUNNING,
      parked: UNMEASURED,
      idleBetween: UNMEASURED,
      offClockBetween: UNMEASURED,
      unknownBetween: { ms: 5_400_000, provisional: false, measured: true },
    },
    dbNow: '2026-08-22T10:00:00.000Z',
    truncated: false,
    cap: 200,
    ...overrides,
  } as never;
}

function fakes(overrides: Partial<SessionToolDeps> = {}) {
  const calls: Array<{ fn: string; args: readonly unknown[] }> = [];
  const sessions: SessionToolDeps = {
    listSessionsForStaff: async (orgId, staffId, range, filters) => {
      calls.push({ fn: 'listSessionsForStaff', args: [orgId, staffId, range, filters] });
      return seriesResult();
    },
    listSessionsForOrg: async (orgId, range, filters) => {
      calls.push({ fn: 'listSessionsForOrg', args: [orgId, range, filters] });
      return seriesResult();
    },
    sessionContents: async (orgId, sessionId) => {
      calls.push({ fn: 'sessionContents', args: [orgId, sessionId] });
      return {
        sessionId,
        entities: [
          { type: 'serial_unit' as const, id: '9041', firstAt: 'a', lastAt: 'b', eventCount: 3, created: true },
        ],
        createdCount: 12,
        updatedCount: 40,
        scans: { total: 52, byEventType: { unbox_scan: 52 } },
        exceptionCount: 2,
        photoCount: 18,
        truncated: false,
        caps: { events: 2000, entities: 500 },
      };
    },
    ...overrides,
  };
  const rows: Array<Record<string, unknown>> = [];
  const deps = {
    query: async (_orgId: unknown, _sql: string, params?: readonly unknown[]) => {
      calls.push({ fn: 'query', args: [params ?? []] });
      return { rows };
    },
    sessions,
  } as unknown as AssistantToolDeps;
  return { deps, calls, rows, first: (fn: string) => calls.find((c) => c.fn === fn) };
}

describe('get_my_session_stats', () => {
  it('reads the CALLER\'s sessions — staffId comes from ctx, never the model', async () => {
    const f = fakes();
    const out = await runAssistantTool(
      'get_my_session_stats',
      // A model asking about someone else must not be able to get it here.
      { hours: 8, staffId: 999 },
      ctxWith(['assistant.chat']),
      f.deps,
    );
    assert.equal(out.ok, true);
    const args = f.first('listSessionsForStaff')?.args;
    assert.equal(args?.[0], ORG);
    assert.equal(args?.[1], 7, 'ctx.staffId wins; the model-supplied 999 is ignored');
  });

  it('hands the duration FLAGS through instead of flattening them to a number', async () => {
    const f = fakes();
    const out = await runAssistantTool(
      'get_my_session_stats',
      {},
      ctxWith(['assistant.chat']),
      f.deps,
    );
    const data = out.ok ? (out.data as Record<string, never>) : null;
    const first = (data?.sessions as unknown as Array<Record<string, unknown>>)[0];
    assert.deepEqual(first.active, RUNNING, 'a running session must stay provisional');
    assert.deepEqual(first.parked, UNMEASURED, 'unmeasured is not zero');
    // The clock every provisional number was measured to travels with them.
    assert.equal(data?.dbNow, '2026-08-22T10:00:00.000Z');
  });

  it('keeps a gap\'s classification — "unknown" must never arrive as idle', async () => {
    const f = fakes();
    const out = await runAssistantTool('get_my_session_stats', {}, ctxWith(['assistant.chat']), f.deps);
    const data = out.ok ? (out.data as Record<string, never>) : null;
    const first = (data?.sessions as unknown as Array<Record<string, unknown>>)[0];
    assert.equal((first.gapBefore as { classification: string }).classification, 'unknown');
  });

  it('defaults the window and passes the filters through', async () => {
    const f = fakes();
    await runAssistantTool(
      'get_my_session_stats',
      { kind: 'scan', sessionType: 'unbox', status: 'ended', limit: 25 },
      ctxWith(['assistant.chat']),
      f.deps,
    );
    const args = f.first('listSessionsForStaff')?.args;
    const range = args?.[2] as { from: string; to: string };
    assert.equal(
      Math.round((Date.parse(range.to) - Date.parse(range.from)) / 3_600_000),
      12,
      'default window is 12h',
    );
    assert.deepEqual(args?.[3], {
      kind: 'scan',
      sessionType: 'unbox',
      status: 'ended',
      limit: 25,
    });
  });

  it('says so when the caller has no staff identity, rather than reading the org', async () => {
    const f = fakes();
    const out = await runAssistantTool(
      'get_my_session_stats',
      {},
      ctxWith(['assistant.chat'], null),
      f.deps,
    );
    assert.equal(out.ok, true);
    assert.equal((out.ok && (out.data as { found: boolean }).found) as boolean, false);
    assert.equal(f.first('listSessionsForStaff'), undefined);
  });

  it('is refused without the permission, by the one execution chokepoint', async () => {
    const f = fakes();
    const out = await runAssistantTool('get_my_session_stats', {}, ctxWith([]), f.deps);
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.code, 'forbidden');
  });

  it('rejects a window outside the schema instead of scanning a year', async () => {
    const f = fakes();
    const out = await runAssistantTool(
      'get_my_session_stats',
      { hours: 100000 },
      ctxWith(['assistant.chat']),
      f.deps,
    );
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.code, 'invalid_input');
  });
});

describe('get_session_throughput', () => {
  const OWN_ROW = {
    id: 41,
    kind: 'scan',
    scan_type: 'unbox',
    surface_key: 'unbox',
    status: 'ended',
    staff_id: 7,
    started_at: '2026-08-22T09:00:00.000Z',
    ended_at: '2026-08-22T10:00:00.000Z',
  };

  it('returns created and updated as SEPARATE facts', async () => {
    const f = fakes();
    f.rows.push({ ...OWN_ROW });
    const out = await runAssistantTool(
      'get_session_throughput',
      { sessionId: 41 },
      ctxWith(['assistant.chat']),
      f.deps,
    );
    assert.equal(out.ok, true);
    const data = out.ok ? (out.data as Record<string, unknown>) : {};
    assert.equal(data.createdCount, 12);
    assert.equal(data.updatedCount, 40);
    assert.deepEqual(data.scans, { total: 52, byEventType: { unbox_scan: 52 } });
    assert.equal(data.truncated, false);
  });

  it('scopes the ownership probe by org, from ctx', async () => {
    const f = fakes();
    f.rows.push({ ...OWN_ROW });
    await runAssistantTool('get_session_throughput', { sessionId: 41 }, ctxWith(['assistant.chat']), f.deps);
    assert.deepEqual(f.first('query')?.args[0], [ORG, 41]);
  });

  it('refuses someone else\'s session without dashboard.view', async () => {
    const f = fakes();
    f.rows.push({ ...OWN_ROW, staff_id: 99 });
    const out = await runAssistantTool(
      'get_session_throughput',
      { sessionId: 41 },
      ctxWith(['assistant.chat']),
      f.deps,
    );
    assert.equal(out.ok, true);
    assert.equal((out.ok && (out.data as { found: boolean }).found) as boolean, false);
    assert.equal(f.first('sessionContents'), undefined, 'nothing is read for a refused session');
  });

  it('allows someone else\'s session WITH dashboard.view', async () => {
    const f = fakes();
    f.rows.push({ ...OWN_ROW, staff_id: 99 });
    const out = await runAssistantTool(
      'get_session_throughput',
      { sessionId: 41 },
      ctxWith(['assistant.chat', 'dashboard.view']),
      f.deps,
    );
    assert.equal((out.ok && (out.data as { found: boolean }).found) as boolean, true);
    assert.deepEqual(f.first('sessionContents')?.args, [ORG, 41]);
  });

  it('reports a session that does not exist as not found, not as an error', async () => {
    const f = fakes();
    const out = await runAssistantTool(
      'get_session_throughput',
      { sessionId: 999 },
      ctxWith(['assistant.chat']),
      f.deps,
    );
    assert.equal(out.ok, true);
    assert.equal((out.ok && (out.data as { found: boolean }).found) as boolean, false);
  });
});

describe('get_team_session_stats', () => {
  it('reads the whole org and needs the stronger permission', async () => {
    const f = fakes();
    const denied = await runAssistantTool('get_team_session_stats', {}, ctxWith(['assistant.chat']), f.deps);
    assert.equal(denied.ok, false);
    assert.equal(denied.ok === false && denied.code, 'forbidden');

    const out = await runAssistantTool(
      'get_team_session_stats',
      { hours: 24 },
      ctxWith(['dashboard.view']),
      f.deps,
    );
    assert.equal(out.ok, true);
    assert.equal(f.first('listSessionsForOrg')?.args[0], ORG);
    assert.equal(
      f.first('listSessionsForStaff'),
      undefined,
      'the team view must not be a per-staff read in disguise',
    );
  });
});
