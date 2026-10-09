/**
 * Platform returns sync — one provider, one window, for one org:
 *
 *   fetcher (eBay returns API / Amazon returns reports) → `ReturnReportFile`s →
 *   each file through `runPoCsvImport` (the uploaded-report path, so the one
 *   inbound writer lands every return and its reason) → one import run
 *   (`order_import_runs` → one step per file, `import-record.ts`).
 *
 * Two shapes of window:
 *   - incremental (no `window`): from the org+provider cursor
 *     (`sync_cursors`, resource `returns:<provider>`) minus an overlap, or a
 *     bounded lookback on the first run; at most one chunk per run so a stale
 *     cursor catches up run by run. The cursor advances to the window's end
 *     only when every file landed without a failed order, and never on a dry
 *     run.
 *   - explicit (`window` given — a backfill chunk): read as is; the
 *     incremental cursor is never touched.
 *
 * A provider the org has not connected is a `not_connected` skip, not a
 * failure. All I/O lives behind {@link ReturnsSyncDeps}
 * (`returns-sync-load.ts`), so this module stays DB- and network-free.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { ImportRunTrigger } from '@/lib/imports/types';
import type { PoCsvImportInput, PoCsvOrderSummary } from '@/lib/inbound/po-csv-import';
import type { ImportRunMeta, ImportRunRecorder } from '@/lib/sync/import-record';
import type { ReturnReportFile, ReturnWindow, ReturnsProvider } from './return-files';

/** Thrown by a returns fetcher when the org holds no credentials for its provider. */
export class ReturnsNotConnectedError extends Error {
  constructor(readonly provider: ReturnsProvider) {
    super(`${provider} is not connected`);
    this.name = 'ReturnsNotConnectedError';
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** First incremental run reads this far back; older history is the backfill's. */
export const RETURNS_FIRST_RUN_LOOKBACK_DAYS = 30;
/** Each incremental run re-reads this much before the cursor: reports land late, and re-imports are unchanged by content hash. */
export const RETURNS_CURSOR_OVERLAP_DAYS = 2;
/** The widest window one incremental run reads (the providers' per-request range). */
export const RETURNS_MAX_WINDOW_DAYS = 30;

/** The org+provider incremental watermark (`sync_cursors.resource`). */
export function returnsCursorResource(provider: ReturnsProvider): string {
  return `returns:${provider}`;
}

/**
 * The incremental window: [cursor − overlap, …) or [now − lookback, …) on the
 * first run, ending at now or `RETURNS_MAX_WINDOW_DAYS` later, whichever is
 * first.
 */
export function incrementalReturnsWindow(cursor: Date | null, now: Date): ReturnWindow {
  const since = cursor
    ? new Date(Math.min(cursor.getTime(), now.getTime()) - RETURNS_CURSOR_OVERLAP_DAYS * DAY_MS)
    : new Date(now.getTime() - RETURNS_FIRST_RUN_LOOKBACK_DAYS * DAY_MS);
  const until = new Date(Math.min(now.getTime(), since.getTime() + RETURNS_MAX_WINDOW_DAYS * DAY_MS));
  return { since, until };
}

/** What `runPoCsvImport` returned for one file, as this module reads it. */
export interface ReturnsFileImport {
  /** `inbound_import_batch.id`; null on a dry run or when nothing could be grouped. */
  batchId: number | null;
  summary: PoCsvOrderSummary;
  /** Required import fields the file's headers did not map — nothing was imported. */
  missingRequired: string[];
}

export interface ReturnsSyncDeps {
  fetchFiles(orgId: OrgId, provider: ReturnsProvider, window: ReturnWindow): Promise<ReturnReportFile[]>;
  importFile(orgId: OrgId, input: PoCsvImportInput): Promise<ReturnsFileImport>;
  getCursor(orgId: OrgId, resource: string): Promise<Date | null>;
  updateCursor(orgId: OrgId, resource: string, at: Date): Promise<void>;
  /** Open the run's import record (never throws). */
  startImportRun(orgId: OrgId, meta: ImportRunMeta): Promise<ImportRunRecorder>;
  now(): Date;
}

export interface ReturnsSyncOpts {
  provider: ReturnsProvider;
  /** Absent = incremental from the cursor; given = exactly this window, cursor untouched. */
  window?: ReturnWindow;
  dryRun: boolean;
  trigger: ImportRunTrigger;
  /** Manual runs: the operator. */
  staffId?: number | null;
  /** The `cron_runs` row driving this run. */
  cronRunId?: number | null;
}

export interface ReturnsFileResult {
  fileName: string;
  preset: ReturnReportFile['preset'];
  rows: number;
  ok: boolean;
  error?: string;
  batchId: number | null;
  summary: PoCsvOrderSummary;
}

export interface ReturnsSyncResult {
  provider: ReturnsProvider;
  /** `synced` and `not_connected` are ok; `failed` names its error. */
  status: 'synced' | 'failed' | 'not_connected';
  ok: boolean;
  window: { since: string; until: string };
  dryRun: boolean;
  files: ReturnsFileResult[];
  error?: string;
  /** The incremental cursor moved to `window.until`. */
  cursorAdvanced: boolean;
  /** `order_import_runs.id`; null when nothing was recorded. */
  importRunId: number | null;
}

const EMPTY_SUMMARY: Readonly<PoCsvOrderSummary> = Object.freeze({
  orders: 0,
  new: 0,
  updated: 0,
  unchanged: 0,
  needsFix: 0,
  landed: 0,
  failed: 0,
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One file's verdict: it lands clean unless it threw, mapped no required column, or an order failed to write. */
function fileVerdict(file: ReturnReportFile, imported: ReturnsFileImport): ReturnsFileResult {
  const base = { fileName: file.fileName, preset: file.preset, rows: file.rows.length, batchId: imported.batchId, summary: imported.summary };
  if (imported.missingRequired.length > 0) {
    return { ...base, ok: false, error: `unmapped required columns: ${imported.missingRequired.join(', ')}` };
  }
  if (imported.summary.failed > 0) {
    return { ...base, ok: false, error: `${imported.summary.failed} order(s) failed to write` };
  }
  return { ...base, ok: true };
}

export async function runReturnsSync(
  orgId: OrgId,
  opts: ReturnsSyncOpts,
  deps: ReturnsSyncDeps,
): Promise<ReturnsSyncResult> {
  const { provider, dryRun } = opts;
  const resource = returnsCursorResource(provider);
  const incremental = !opts.window;
  const window = opts.window ?? incrementalReturnsWindow(await deps.getCursor(orgId, resource), deps.now());
  const result: ReturnsSyncResult = {
    provider,
    status: 'synced',
    ok: true,
    window: { since: window.since.toISOString(), until: window.until.toISOString() },
    dryRun,
    files: [],
    cursorAdvanced: false,
    importRunId: null,
  };
  const meta: ImportRunMeta = {
    kind: 'provider',
    trigger: opts.trigger,
    staffId: opts.staffId ?? null,
    cronRunId: opts.cronRunId ?? null,
  };

  const fetchStartedAt = deps.now();
  let files: ReturnReportFile[];
  try {
    files = await deps.fetchFiles(orgId, provider, window);
  } catch (error) {
    if (error instanceof ReturnsNotConnectedError) return { ...result, status: 'not_connected' };
    const message = errorMessage(error);
    // A failed fetch is recorded so the import history shows it; a dry run records nothing.
    if (!dryRun) {
      const record = await deps.startImportRun(orgId, meta);
      await record.step({ step: resource, ok: false, error: message, startedAt: fetchStartedAt, finishedAt: deps.now() });
      await record.finish();
      result.importRunId = record.runId;
    }
    return { ...result, status: 'failed', ok: false, error: message };
  }

  const record = !dryRun && files.length > 0 ? await deps.startImportRun(orgId, meta) : null;
  result.importRunId = record?.runId ?? null;
  for (const file of files) {
    const startedAt = deps.now();
    let fileResult: ReturnsFileResult;
    try {
      const imported = await deps.importFile(orgId, {
        fileName: file.fileName,
        headers: file.headers,
        rows: file.rows,
        preset: file.preset,
        dryRun,
        staffId: opts.staffId ?? null,
        label: `${provider} returns ${window.since.toISOString().slice(0, 10)}..${window.until.toISOString().slice(0, 10)}`,
      });
      fileResult = fileVerdict(file, imported);
    } catch (error) {
      fileResult = {
        fileName: file.fileName,
        preset: file.preset,
        rows: file.rows.length,
        ok: false,
        error: errorMessage(error),
        batchId: null,
        summary: { ...EMPTY_SUMMARY },
      };
    }
    result.files.push(fileResult);
    await record?.step({
      step: file.preset,
      ok: fileResult.ok,
      error: fileResult.error ?? null,
      imported: fileResult.summary.new,
      updated: fileResult.summary.updated,
      startedAt,
      finishedAt: deps.now(),
    });
  }
  await record?.finish();

  const failed = result.files.filter((f) => !f.ok);
  if (failed.length > 0) {
    return {
      ...result,
      status: 'failed',
      ok: false,
      error: failed.map((f) => `${f.fileName}: ${f.error}`).join(' · '),
    };
  }
  if (incremental && !dryRun) {
    await deps.updateCursor(orgId, resource, window.until);
    result.cursorAdvanced = true;
  }
  return result;
}
