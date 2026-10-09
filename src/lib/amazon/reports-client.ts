/**
 * SP-API Reports API (2021-06-30) — request a report, poll it to a terminal
 * status, download its (optionally GZIP) document and parse a TAB-delimited
 * flat file into headers + rows. Calls go through `callSpApi` (LWA token from
 * the vault, 429/503 retry, audit); the report document is a presigned S3 URL
 * fetched without SP-API auth.
 */
import { gunzipSync } from 'node:zlib';
import type { AmazonCredentials } from '@/lib/integrations/credentials';
import { callSpApi, type AmazonAccount } from './client';

const REPORTS_PATH = '/reports/2021-06-30';

export type ReportProcessingStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED' | 'FATAL';

export interface CreateReportSpec {
  reportType: string;
  marketplaceIds: readonly string[];
  dataStartTime: Date;
  dataEndTime: Date;
}

/** `getReport` response (subset we read). */
export interface SpApiReport {
  reportId: string;
  reportType: string;
  processingStatus: ReportProcessingStatus;
  reportDocumentId?: string;
  dataStartTime?: string;
  dataEndTime?: string;
}

/** `getReportDocument` response. */
export interface SpApiReportDocument {
  reportDocumentId: string;
  url: string;
  compressionAlgorithm?: 'GZIP';
}

/** A parsed flat-file report: the raw header strings + one record per data line. */
export interface FlatFileTable {
  headers: string[];
  rows: Record<string, string>[];
}

/** One SP-API call already bound to an account + its vault credentials. */
export type SpApiCall = <T>(opts: Parameters<typeof callSpApi>[2]) => Promise<T>;

export interface ReportsClientDeps {
  call: SpApiCall;
  /** GET a presigned report-document URL (no SP-API auth headers). */
  download: (url: string) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface ReportsClientOptions {
  /** First `getReport` poll delay; grows ×1.5 per poll up to `pollMaxMs`. */
  pollInitialMs?: number;
  pollMaxMs?: number;
  /** Budget for one report: create → poll → download, throttle waits included. */
  timeoutMs?: number;
  /** First wait after `callSpApi` gives up on a 429; doubles up to `throttleMaxMs`. */
  throttleInitialMs?: number;
  throttleMaxMs?: number;
}

const DEFAULT_OPTIONS: Required<ReportsClientOptions> = {
  pollInitialMs: 5_000,
  pollMaxMs: 60_000,
  timeoutMs: 20 * 60_000,
  // createReport / getReportDocument restore at 1 request per minute.
  throttleInitialMs: 15_000,
  throttleMaxMs: 60_000,
};

/** The report finished FATAL; `detail` is Amazon's error document text, when it gave one. */
export class AmazonReportFatalError extends Error {
  constructor(readonly reportType: string, readonly reportId: string, readonly detail: string | null) {
    super(`Amazon report ${reportType} (${reportId}) failed: FATAL${detail ? ` — ${detail}` : ''}`);
    this.name = 'AmazonReportFatalError';
  }
}

export class AmazonReportTimeoutError extends Error {
  constructor(readonly reportType: string, readonly reportId: string | null, lastStatus: string) {
    super(`Amazon report ${reportType}${reportId ? ` (${reportId})` : ''} timed out (last status ${lastStatus})`);
    this.name = 'AmazonReportTimeoutError';
  }
}

/** Split [since, until) into consecutive windows of at most `maxDays`. */
export function splitReportWindow(since: Date, until: Date, maxDays: number): Array<{ since: Date; until: Date }> {
  const span = maxDays * 86_400_000;
  const out: Array<{ since: Date; until: Date }> = [];
  for (let start = since.getTime(); start < until.getTime(); start += span) {
    out.push({ since: new Date(start), until: new Date(Math.min(start + span, until.getTime())) });
  }
  return out;
}

/** WHATWG encoding label for a `charset=` value (Amazon flat files may be Cp1252). */
function encodingLabel(contentType: string | null | undefined): string {
  const charset = /charset=["']?([^;"'\s]+)/i.exec(contentType ?? '')?.[1]?.toLowerCase();
  if (!charset) return 'utf-8';
  return charset === 'cp1252' ? 'windows-1252' : charset;
}

/** Report-document bytes → text: gunzip when the document says GZIP, decode by the response charset. */
export function decodeReportDocument(
  bytes: Uint8Array,
  compressionAlgorithm?: string | null,
  contentType?: string | null,
): string {
  const raw = compressionAlgorithm === 'GZIP' ? gunzipSync(bytes) : bytes;
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(encodingLabel(contentType));
  } catch {
    decoder = new TextDecoder('utf-8');
  }
  // TextDecoder drops a leading UTF-8 BOM itself.
  return decoder.decode(raw);
}

/**
 * Parse a TAB-delimited flat-file report. The first non-blank line is the
 * header row (kept as Amazon writes it); blank lines are skipped; a short line
 * leaves its missing cells empty and cells past the header row are dropped.
 */
export function parseFlatFileReport(text: string): FlatFileTable {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  let i = 0;
  while (i < lines.length && !lines[i]!.trim()) i++;
  if (i >= lines.length) return { headers: [], rows: [] };

  const headerCells = lines[i]!.split('\t').map((h) => h.trim());
  const headers = headerCells.filter(Boolean);
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(i + 1)) {
    if (!line.trim()) continue;
    const cells = line.split('\t');
    const row: Record<string, string> = {};
    headerCells.forEach((h, c) => {
      if (h) row[h] = (cells[c] ?? '').trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

/**
 * Merge flat files of one report type (several accounts / windows): headers
 * in first-seen order, identical rows (overlapping windows) kept once.
 */
export function mergeFlatFileTables(tables: readonly FlatFileTable[]): FlatFileTable {
  const headers: string[] = [];
  for (const t of tables) for (const h of t.headers) if (!headers.includes(h)) headers.push(h);
  const seen = new Set<string>();
  const rows: Record<string, string>[] = [];
  for (const t of tables) {
    for (const r of t.rows) {
      const row = Object.fromEntries(headers.map((h) => [h, r[h] ?? '']));
      const key = JSON.stringify(headers.map((h) => row[h]));
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return { headers, rows };
}

export interface ReportsClient {
  createReport(spec: CreateReportSpec): Promise<string>;
  getReport(reportId: string): Promise<SpApiReport>;
  getReportDocument(reportDocumentId: string): Promise<string>;
  /** Poll until DONE / CANCELLED (returned) or FATAL / timeout (thrown). */
  waitForReport(reportId: string, reportType: string, deadline: number): Promise<SpApiReport>;
  /** create → wait → download. `null` = CANCELLED (Amazon had no data for the window). */
  runReport(spec: CreateReportSpec): Promise<string | null>;
}

export function createReportsClient(deps: ReportsClientDeps, options: ReportsClientOptions = {}): ReportsClient {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  /** Retry an SP-API call past `callSpApi`'s own retries while it is throttled and the deadline allows. */
  async function throttled<T>(fn: () => Promise<T>, deadline: number): Promise<T> {
    let wait = opts.throttleInitialMs;
    for (;;) {
      try {
        return await fn();
      } catch (err) {
        // `callSpApi` throws `SP-API <op> failed: HTTP 429 …` once its own short retries are spent.
        const throttledErr = err instanceof Error && /\bHTTP 429\b/.test(err.message);
        if (!throttledErr || deps.now() + wait > deadline) throw err;
        await deps.sleep(wait);
        wait = Math.min(wait * 2, opts.throttleMaxMs);
      }
    }
  }

  async function createReportBy(spec: CreateReportSpec, deadline: number): Promise<string> {
    const res = await throttled(
      () =>
        deps.call<{ reportId?: string }>({
          operation: 'createReport',
          path: `${REPORTS_PATH}/reports`,
          body: {
            reportType: spec.reportType,
            marketplaceIds: spec.marketplaceIds,
            dataStartTime: spec.dataStartTime.toISOString(),
            dataEndTime: spec.dataEndTime.toISOString(),
          },
        }),
      deadline,
    );
    if (!res.reportId) throw new Error(`SP-API createReport ${spec.reportType} returned no reportId`);
    return res.reportId;
  }

  function getReportBy(reportId: string, deadline: number): Promise<SpApiReport> {
    return throttled(
      () =>
        deps.call<SpApiReport>({
          operation: 'getReport',
          path: `${REPORTS_PATH}/reports/${encodeURIComponent(reportId)}`,
        }),
      deadline,
    );
  }

  async function getReportDocumentBy(reportDocumentId: string, deadline: number): Promise<string> {
    const doc = await throttled(
      () =>
        deps.call<SpApiReportDocument>({
          operation: 'getReportDocument',
          path: `${REPORTS_PATH}/documents/${encodeURIComponent(reportDocumentId)}`,
        }),
      deadline,
    );
    if (!doc.url) throw new Error(`SP-API getReportDocument ${reportDocumentId} returned no url`);
    const res = await deps.download(doc.url);
    if (!res.ok) throw new Error(`Amazon report document ${reportDocumentId} download failed: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return decodeReportDocument(bytes, doc.compressionAlgorithm, res.headers.get('content-type'));
  }

  async function waitForReport(reportId: string, reportType: string, deadline: number): Promise<SpApiReport> {
    let delay = opts.pollInitialMs;
    for (;;) {
      const report = await getReportBy(reportId, deadline);
      switch (report.processingStatus) {
        case 'DONE':
        case 'CANCELLED':
          return report;
        case 'FATAL': {
          // A FATAL report may carry an error document explaining why.
          let detail: string | null = null;
          if (report.reportDocumentId) {
            detail = await getReportDocumentBy(report.reportDocumentId, deadline)
              .then((t) => t.trim().slice(0, 500) || null)
              .catch(() => null);
          }
          throw new AmazonReportFatalError(reportType, reportId, detail);
        }
        default:
          if (deps.now() + delay > deadline) {
            throw new AmazonReportTimeoutError(reportType, reportId, report.processingStatus);
          }
          await deps.sleep(delay);
          delay = Math.min(Math.round(delay * 1.5), opts.pollMaxMs);
      }
    }
  }

  return {
    createReport: (spec) => createReportBy(spec, deps.now() + opts.timeoutMs),
    getReport: (reportId) => getReportBy(reportId, deps.now() + opts.timeoutMs),
    getReportDocument: (id) => getReportDocumentBy(id, deps.now() + opts.timeoutMs),
    waitForReport,
    async runReport(spec) {
      const deadline = deps.now() + opts.timeoutMs;
      const reportId = await createReportBy(spec, deadline);
      const report = await waitForReport(reportId, spec.reportType, deadline);
      if (report.processingStatus === 'CANCELLED') return null;
      if (!report.reportDocumentId) {
        throw new Error(`Amazon report ${spec.reportType} (${reportId}) is DONE without a document`);
      }
      return getReportDocumentBy(report.reportDocumentId, deadline);
    },
  };
}

/** The Reports client for one connected account (token via the vault, through `callSpApi`). */
export function reportsClientForAccount(
  account: AmazonAccount,
  creds: AmazonCredentials,
  options?: ReportsClientOptions,
): ReportsClient {
  return createReportsClient(
    {
      call: (callOpts) => callSpApi(account, creds, callOpts),
      download: (url) => fetch(url),
      sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
      now: Date.now,
    },
    options,
  );
}
