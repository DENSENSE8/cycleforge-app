/**
 * Session-reflection read tools — "how long did this take, what can I improve".
 *
 * The other half of the assistant's Warehouse OS job. The workspace verbs
 * (`workspace-tools.ts`) arrange the operator's day; these three read it back
 * afterwards. THE ASSISTANT IS NEVER IN THE SCAN PATH — it does not see scans
 * as they happen and must not try to. It reads what the session already
 * recorded, once the work is done.
 *
 * ## Thin adapters over `@/lib/sessions`, with NO arithmetic of their own
 *
 * `session-metrics.ts` already encodes five rules that took a while to get
 * right, and every one of them is a rule a language model would otherwise
 * break by rounding a number in prose:
 *
 *   1. an OPEN session has no duration, only an elapsed-so-far (`provisional`);
 *   2. there is no gap before the first session of a shift (`gapBefore: null`);
 *   3. a gap that spans a shift boundary is OFF-CLOCK, not idle — and a gap
 *      with no payroll context is `unknown`, never `idle`, because the
 *      defaulting direction is an accusation about a person;
 *   4. DB clock and client clock never mix;
 *   5. UNMEASURED IS NOT ZERO (`measured: false` alongside `ms: 0`).
 *
 * So these tools compute nothing. They call `listSessionsForStaff` /
 * `listSessionsForOrg` / `sessionContents`, hand the flags STRAIGHT through to
 * the model, and the system prompt tells it to respect them. A tool here that
 * flattened `{ms, provisional, measured}` into a single number would be the one
 * place all five rules are silently discarded.
 *
 * ## Whose sessions
 *
 * `staffId` comes from `ctx`, NEVER from model input — the same law as `orgId`.
 * There is deliberately no `staffId` parameter on the personal tool: a
 * parameter the model can set is a parameter it can set to someone else, and
 * "how did Dave do today" is a different question with a different permission
 * (`get_team_session_stats`, gated on `dashboard.view`).
 *
 * DB-free unit tests: `SessionToolDeps` is injected through the standard
 * `AssistantToolDeps` extension slot, same shape as `OperationsJourneyDeps`.
 */

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import type { SessionEventType } from '@/lib/sessions/attribution';
import type {
  SessionContents,
  SessionListFilters,
  SessionRange,
  SessionSeriesResult,
} from '@/lib/sessions/session-rollup';
import type { AssistantToolDef, AssistantToolDeps } from './types';

/* ── Injected collaborators ──────────────────────────────────────────────── */

/**
 * The rollup reader, injected.
 *
 * Lazy-loaded by default: `session-rollup.ts` reaches `@/lib/tenancy/db`, which
 * is `server-only`, and the assistant tool registry is imported from
 * `node:test`. Same trick `domain-read-tools.ts` uses for the journey reader.
 */
export interface SessionToolDeps {
  listSessionsForStaff: (
    orgId: OrgId,
    staffId: number,
    range: SessionRange,
    filters?: SessionListFilters,
  ) => Promise<SessionSeriesResult>;
  listSessionsForOrg: (
    orgId: OrgId,
    range: SessionRange,
    filters?: SessionListFilters,
  ) => Promise<SessionSeriesResult>;
  sessionContents: (orgId: OrgId, sessionId: number) => Promise<SessionContents>;
}

async function loadDefaultSessionDeps(): Promise<SessionToolDeps> {
  const rollup = await import('@/lib/sessions/session-rollup');
  return {
    listSessionsForStaff: (orgId, staffId, range, filters) =>
      rollup.listSessionsForStaff(orgId, staffId, range, filters),
    listSessionsForOrg: (orgId, range, filters) =>
      rollup.listSessionsForOrg(orgId, range, filters),
    sessionContents: (orgId, sessionId) => rollup.sessionContents(orgId, sessionId),
  };
}

function sessionDepsFrom(deps: AssistantToolDeps): Promise<SessionToolDeps> {
  const injected = (deps as AssistantToolDeps & { sessions?: SessionToolDeps }).sessions;
  return injected ? Promise.resolve(injected) : loadDefaultSessionDeps();
}

/* ── Range ───────────────────────────────────────────────────────────────── */

/**
 * How far back to read, in hours. A WINDOW, not a "since my last session":
 * the operator's question ("how long was I stopped between those two") needs
 * the session BEFORE the one they are asking about, or `gapBefore` on the
 * first row is null by rule 2 and the answer disappears.
 *
 * 336h = two weeks, which is where `SESSION_LIST_CAP` starts truncating for a
 * busy bench anyway.
 */
const hoursBack = z.number().int().min(1).max(336).default(12);

/**
 * The window, anchored on the APP SERVER's clock.
 *
 * Deliberately not `dbNow`: this is a query bound, not a measurement. Every
 * duration in the result is measured against the `dbNow` the rollup itself
 * reads inside its transaction (rule 4), and the result carries that value so
 * the model can see which clock the numbers came from.
 */
function windowOf(hours: number): SessionRange {
  const to = Date.now();
  return {
    from: new Date(to - hours * 3_600_000).toISOString(),
    to: new Date(to).toISOString(),
  };
}

/* ── Shaping ─────────────────────────────────────────────────────────────── */

/**
 * Trim a series for the context window WITHOUT flattening the flags.
 *
 * `ms` travels with `provisional` and `measured` every time. A model handed a
 * bare number will report a running session's elapsed-so-far as a final
 * duration, and a supervisor comparing it against a finished session would be
 * comparing a measurement to a guess.
 */
function shapeSeries(result: SessionSeriesResult) {
  return {
    sessions: result.sessions.map(({ session, metric }) => ({
      sessionId: session.id,
      kind: session.kind,
      scanType: session.scanType,
      surfaceKey: session.surfaceKey,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      staffId: session.staffId,
      /** Time actually worked — parked stretches excluded, not subtracted. */
      active: metric.active,
      /** Time this session sat parked. NOT subtracted from `active`. */
      parked: metric.parked,
      /** started→ended wall clock, parks included. The checkable one. */
      wall: metric.wall,
      /**
       * The span before this session began, and what it MEANS. `null` on the
       * first row (rule 2). `classification: 'unknown'` means payroll was not
       * consulted — it does NOT mean idle.
       */
      gapBefore: metric.gapBefore,
      /** More than one id = the session was handed over mid-stream. */
      workedByStaffIds: metric.workedByStaffIds,
    })),
    totals: result.totals,
    /** The server clock every provisional duration above was measured to. */
    dbNow: result.dbNow,
    truncated: result.truncated,
    cap: result.cap,
  };
}

const seriesFilters = {
  hours: hoursBack,
  kind: z.enum(['scan', 'task']).optional(),
  sessionType: z
    .enum(['unbox', 'triage', 'pickup', 'test', 'pack', 'outbound', 'task'])
    .optional(),
  status: z.enum(['open', 'parked', 'ended']).optional(),
  limit: z.number().int().min(1).max(200).optional(),
} as const;

function filtersFrom(input: {
  kind?: 'scan' | 'task';
  sessionType?: string;
  status?: 'open' | 'parked' | 'ended';
  limit?: number;
}): SessionListFilters {
  const filters: SessionListFilters = {};
  if (input.kind) filters.kind = input.kind;
  if (input.sessionType) filters.sessionType = input.sessionType as SessionEventType;
  if (input.status) filters.status = input.status;
  if (input.limit) filters.limit = input.limit;
  return filters;
}

/* ── get_my_session_stats ────────────────────────────────────────────────── */

const myStatsInput = z.object(seriesFilters);

export const getMySessionStats: AssistantToolDef<typeof myStatsInput> = {
  name: 'get_my_session_stats',
  description:
    'How the CALLER\'s own recent work sessions went: how long each took (active time, parks excluded), how long each sat parked, and the gap before each one started. Use for "how long did that take", "how long was I stopped", "how am I doing today", "when did I last work an unbox session". Whose sessions is fixed to the person asking — there is no parameter for someone else. Every duration comes back as {ms, provisional, measured}: provisional=true means the session is STILL RUNNING and ms is elapsed-so-far, not a final number — say "so far". measured=false means nothing instrumented that span; report it as unknown, never as 0. A gap carries a classification: "idle" (they were on the clock and not in a session), "off-clock" (the gap spans time they were not working — NEVER call this idle), or "unknown" (payroll was not consulted, so you do not know — say so).',
  permission: 'assistant.chat',
  inputSchema: myStatsInput,
  run: async (input, ctx, deps) => {
    // staffId from ctx, never from input — the same law as orgId.
    if (ctx.staffId == null) {
      return {
        found: false as const,
        reason:
          'This caller has no staff identity, so there are no personal sessions to read. Ask about the team instead.',
      };
    }
    const sessions = await sessionDepsFrom(deps);
    const range = windowOf(input.hours);
    const result = await sessions.listSessionsForStaff(
      ctx.organizationId,
      ctx.staffId,
      range,
      filtersFrom(input),
    );
    return { found: true as const, staffId: ctx.staffId, range, ...shapeSeries(result) };
  },
};

/* ── get_session_throughput ──────────────────────────────────────────────── */

const throughputInput = z.object({
  sessionId: z.number().int().positive(),
});

export const getSessionThroughput: AssistantToolDef<typeof throughputInput> = {
  name: 'get_session_throughput',
  description:
    'What ONE session actually got through: how many scans (broken down by scan event type), which entities it touched, how many of those it CREATED versus merely updated, how many photos it captured and how many exceptions it hit. Use after get_my_session_stats gives you a sessionId, for "what did I get done in that session" or "why did that one take so long". Created and updated are different facts — "you received 40 units" and "you moved 40 units" are the same row count and completely different work, so never add them together. truncated=true means a cap stopped the read short: say "1000+", never "1000". Only sessions the caller worked are readable unless they also hold dashboard.view.',
  permission: 'assistant.chat',
  inputSchema: throughputInput,
  run: async (input, ctx, deps) => {
    // The ownership probe is a permission decision, so it runs against the
    // tenant pool here rather than being inferred from the rollup — a session
    // the caller did not work is a refusal, not an empty result.
    const { rows } = await deps.query(
      ctx.organizationId,
      `SELECT id, kind, scan_type, surface_key, status, staff_id, started_at, ended_at
         FROM work_sessions
        WHERE organization_id = $1 AND id = $2`,
      [ctx.organizationId, input.sessionId],
    );
    const row = rows[0];
    if (!row) return { found: false as const, sessionId: input.sessionId };

    const ownerId = row.staff_id == null ? null : Number(row.staff_id);
    const isOwn = ctx.staffId != null && ownerId === ctx.staffId;
    if (!isOwn && !ctx.permissions.has('dashboard.view')) {
      return {
        found: false as const,
        sessionId: input.sessionId,
        reason:
          'That session belongs to someone else, and this caller cannot read other people\'s sessions.',
      };
    }

    const sessions = await sessionDepsFrom(deps);
    const contents = await sessions.sessionContents(ctx.organizationId, input.sessionId);
    return {
      found: true as const,
      session: {
        id: Number(row.id),
        kind: row.kind,
        scanType: row.scan_type ?? null,
        surfaceKey: row.surface_key ?? null,
        status: row.status,
        staffId: ownerId,
        startedAt: row.started_at,
        endedAt: row.ended_at ?? null,
      },
      scans: contents.scans,
      createdCount: contents.createdCount,
      updatedCount: contents.updatedCount,
      photoCount: contents.photoCount,
      exceptionCount: contents.exceptionCount,
      // Capped for the context window; `truncated` already says a cap fired.
      entities: contents.entities.slice(0, 60),
      entityCount: contents.entities.length,
      truncated: contents.truncated,
      caps: contents.caps,
    };
  },
};

/* ── get_team_session_stats ──────────────────────────────────────────────── */

const teamStatsInput = z.object(seriesFilters);

export const getTeamSessionStats: AssistantToolDef<typeof teamStatsInput> = {
  name: 'get_team_session_stats',
  description:
    'Every session in the ORG for a window, with the same durations as get_my_session_stats. Use for "how did the shift go", "which bench is slow today", "who is still in a session". IMPORTANT: gaps come back classified "unknown" here BY DESIGN — an idle-time number computed across different people\'s shifts is not a measurement of anything, so do not present org-wide gaps as idle time or use them to compare staff. Compare active durations and throughput instead. Same {ms, provisional, measured} contract as the personal tool.',
  permission: 'dashboard.view',
  inputSchema: teamStatsInput,
  run: async (input, ctx, deps) => {
    const sessions = await sessionDepsFrom(deps);
    const range = windowOf(input.hours);
    const result = await sessions.listSessionsForOrg(
      ctx.organizationId,
      range,
      filtersFrom(input),
    );
    return { range, ...shapeSeries(result) };
  },
};
