/**
 * Returns backfill pipeline — platform return history for one org, provider
 * by provider, in provider-sized windows (eBay and Amazon each read ≤ 30 days
 * per request), one window after the other through `runReturnsSync` (so every
 * chunk is an import run of its own and lands through the one inbound writer).
 *
 * The walk runs NEWEST → OLDEST, from `until` (default now) down to `since`
 * (default 18 months ago). Its resume point is a frontier per org+provider
 * (`sync_cursors`, resource `returns-backfill:<provider>`): history from the
 * frontier up to now has been walked without a gap. A run starts below the
 * frontier, and moves it down only by a chunk that touches it — so the
 * frontier never claims a window nobody read, whatever `since`/`until` the
 * caller picks — never on a dry run, and never past a failed chunk.
 *
 * Bounded per invocation (`maxChunks` per provider, optional `deadline`);
 * the next call resumes from the frontier. One provider failing never stops
 * the other; a provider the org has not connected is skipped.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { ImportRunTrigger } from '@/lib/imports/types';
import type { ReturnWindow, ReturnsProvider } from '@/lib/returns/return-files';
import type { ReturnsSyncOpts, ReturnsSyncResult } from '@/lib/returns/returns-sync';

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETURNS_PROVIDERS: readonly ReturnsProvider[] = ['ebay', 'amazon'];
/** Default history depth. */
export const RETURNS_BACKFILL_MONTHS = 18;
/** Widest window each provider reads per request. */
export const RETURNS_CHUNK_DAYS: Readonly<Record<ReturnsProvider, number>> = { ebay: 30, amazon: 30 };
/** Chunks per provider per invocation when the caller names none. */
export const RETURNS_BACKFILL_MAX_CHUNKS = 3;

/** The org+provider backfill frontier (`sync_cursors.resource`). */
export function returnsBackfillCursorResource(provider: ReturnsProvider): string {
  return `returns-backfill:${provider}`;
}

/** `window` cut into ≤ `chunkDays` windows, newest first; the oldest chunk is the short one. */
export function planReturnChunks(window: ReturnWindow, chunkDays: number): ReturnWindow[] {
  const step = Math.max(1, chunkDays) * DAY_MS;
  const floor = window.since.getTime();
  const chunks: ReturnWindow[] = [];
  for (let end = window.until.getTime(); end > floor; end -= step) {
    chunks.push({ since: new Date(Math.max(floor, end - step)), until: new Date(end) });
  }
  return chunks;
}

export interface ReturnsBackfillDeps {
  /** `runReturnsSync` for one explicit window. */
  sync(orgId: OrgId, opts: ReturnsSyncOpts): Promise<ReturnsSyncResult>;
  getCursor(orgId: OrgId, resource: string): Promise<Date | null>;
  updateCursor(orgId: OrgId, resource: string, at: Date): Promise<void>;
  now(): Date;
}

export interface ReturnsBackfillOpts {
  /** Default: every returns provider. */
  providers?: readonly ReturnsProvider[];
  /** Default: `RETURNS_BACKFILL_MONTHS` ago. */
  since?: Date;
  /** Default (and ceiling): now. */
  until?: Date;
  dryRun?: boolean;
  /** Default `cron`. */
  trigger?: ImportRunTrigger;
  staffId?: number | null;
  cronRunId?: number | null;
  /** Chunks per provider this invocation. Default `RETURNS_BACKFILL_MAX_CHUNKS`. */
  maxChunks?: number;
  /** No chunk starts at or after this instant. */
  deadline?: Date;
}

export interface ReturnsBackfillProviderResult {
  provider: ReturnsProvider;
  /** complete = nothing left in range · partial = bounded, resumes next call. */
  status: 'complete' | 'partial' | 'failed' | 'not_connected';
  ok: boolean;
  chunks: ReturnsSyncResult[];
  /** The frontier after this run (ISO), null when none was ever recorded. */
  frontier: string | null;
  /** Chunks left in range after this run. */
  remainingChunks: number;
  error?: string;
}

export interface ReturnsBackfillResult {
  ok: boolean;
  since: string;
  until: string;
  dryRun: boolean;
  providers: ReturnsBackfillProviderResult[];
}

async function backfillProvider(
  orgId: OrgId,
  provider: ReturnsProvider,
  range: ReturnWindow,
  runNow: Date,
  opts: ReturnsBackfillOpts,
  deps: ReturnsBackfillDeps,
): Promise<ReturnsBackfillProviderResult> {
  const dryRun = opts.dryRun ?? false;
  const resource = returnsBackfillCursorResource(provider);
  let frontier = await deps.getCursor(orgId, resource);
  // [frontier, now) is walked; only what lies below it is left.
  const top = frontier && frontier < range.until ? frontier : range.until;
  const plan = planReturnChunks({ since: range.since, until: top }, RETURNS_CHUNK_DAYS[provider]);
  const maxChunks = Math.max(1, opts.maxChunks ?? RETURNS_BACKFILL_MAX_CHUNKS);
  const chunks: ReturnsSyncResult[] = [];
  const done = (status: ReturnsBackfillProviderResult['status'], error?: string): ReturnsBackfillProviderResult => ({
    provider,
    status,
    ok: status !== 'failed',
    chunks,
    frontier: frontier?.toISOString() ?? null,
    remainingChunks: status === 'not_connected' ? plan.length : plan.length - chunks.filter((c) => c.ok).length,
    ...(error ? { error } : {}),
  });

  for (const chunk of plan) {
    if (chunks.length >= maxChunks) return done('partial');
    if (opts.deadline && deps.now() >= opts.deadline) return done('partial');
    const result = await deps.sync(orgId, {
      provider,
      window: chunk,
      dryRun,
      trigger: opts.trigger ?? 'cron',
      staffId: opts.staffId ?? null,
      cronRunId: opts.cronRunId ?? null,
    });
    if (result.status === 'not_connected') return done('not_connected');
    chunks.push(result);
    if (!result.ok) return done('failed', result.error ?? 'chunk failed');
    // A chunk touching the walked span extends it down; no frontier = the span starts at now.
    const reach = frontier ?? runNow;
    if (!dryRun && chunk.until >= reach && chunk.since < reach) {
      await deps.updateCursor(orgId, resource, chunk.since);
      frontier = chunk.since;
    }
  }
  return done('complete');
}

export async function runReturnsBackfillPipeline(
  orgId: OrgId,
  deps: ReturnsBackfillDeps,
  opts: ReturnsBackfillOpts = {},
): Promise<ReturnsBackfillResult> {
  const runNow = deps.now();
  const until = opts.until && opts.until < runNow ? opts.until : runNow;
  let since = opts.since;
  if (!since) {
    since = new Date(runNow);
    since.setUTCMonth(since.getUTCMonth() - RETURNS_BACKFILL_MONTHS);
  }
  const range: ReturnWindow = { since, until };
  const providers: ReturnsBackfillProviderResult[] = [];

  for (const provider of opts.providers ?? RETURNS_PROVIDERS) {
    try {
      providers.push(await backfillProvider(orgId, provider, range, runNow, opts, deps));
    } catch (error) {
      providers.push({
        provider,
        status: 'failed',
        ok: false,
        chunks: [],
        frontier: null,
        remainingChunks: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: providers.every((p) => p.ok),
    since: since.toISOString(),
    until: until.toISOString(),
    dryRun: opts.dryRun ?? false,
    providers,
  };
}

/** One line naming every failed provider — the run ledger's `error`. */
export function returnsBackfillFailure(result: ReturnsBackfillResult): string {
  return result.providers
    .filter((p) => !p.ok)
    .map((p) => `${p.provider}: ${p.error ?? 'failed'}`)
    .join(' · ');
}
