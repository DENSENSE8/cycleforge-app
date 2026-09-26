/** Bench session (the repair timer) — shared vocabulary and pure derivations for `/api/repair/bench-sessions`, the `/m/rs/[id]/work` timer,… */

export interface RepairBenchSessionRecord {
  id: number;
  repair_id: number;
  staff_id: number | null;
  staff_name: string | null;
  started_at: string;
  ended_at: string | null;
}

/** `GET /api/repair/bench-sessions?repairId=` */
export interface RepairBenchSessionsResponse {
  /** Newest first. */
  sessions: RepairBenchSessionRecord[];
  /** The caller's own open session on this repair, or null. */
  open: RepairBenchSessionRecord | null;
  /** Server clock at read time (ISO) — the reference for a running timer. */
  serverNow: string;
}

function ms(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Server-minus-client clock offset, taken when a read lands. Add it to the
 * client's `Date.now()` to get the server's "now".
 */
export function serverClockOffsetMs(serverNowIso: string, clientReceivedAtMs: number): number {
  const server = ms(serverNowIso);
  return Number.isFinite(server) ? server - clientReceivedAtMs : 0;
}

/**
 * Elapsed time of a session: `ended − started` once stopped, `serverNow −
 * started` while open. Never negative (a server clock hop reads as zero, not
 * as a countdown).
 */
export function benchSessionElapsedMs(
  session: Pick<RepairBenchSessionRecord, 'started_at' | 'ended_at'>,
  serverNowMs: number,
): number {
  const start = ms(session.started_at);
  const end = session.ended_at ? ms(session.ended_at) : serverNowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

/** Whole minutes for a stored/finished duration (rounded; a 40s session is 1 min, 0s is 0). */
export function benchMinutes(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.max(1, Math.round(elapsedMs / 60_000));
}

/** Running clock face: `12:05` under an hour, `1:02:05` after. */
export function formatBenchClock(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Operator duration words: `45 min`, `1 h 05 min`. */
export function formatBenchDuration(elapsedMs: number): string {
  const min = benchMinutes(elapsedMs);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, '0')} min`;
}

export interface BenchSessionSummary {
  /** Sessions counted (open ones included). */
  count: number;
  /** Sum of every session's elapsed time, open ones up to `serverNowMs`. */
  totalMs: number;
  /** Any session still running, by anyone. */
  runningCount: number;
}

/** Totals across every tech's sessions on one repair. */
export function summarizeBenchSessions(
  sessions: ReadonlyArray<Pick<RepairBenchSessionRecord, 'started_at' | 'ended_at'>>,
  serverNowMs: number,
): BenchSessionSummary {
  let totalMs = 0;
  let runningCount = 0;
  for (const s of sessions) {
    totalMs += benchSessionElapsedMs(s, serverNowMs);
    if (!s.ended_at) runningCount += 1;
  }
  return { count: sessions.length, totalMs, runningCount };
}

/**
 * The hub row's one line for the bench log: timer state first (it is the live
 * fact), then total bench time, then how much was logged.
 */
export function benchRowMeta(input: {
  open: Pick<RepairBenchSessionRecord, 'started_at' | 'ended_at'> | null;
  summary: BenchSessionSummary;
  actionCount: number;
  serverNowMs: number;
}): string {
  const parts: string[] = [];
  if (input.open) {
    parts.push(`Timer running · ${formatBenchClock(benchSessionElapsedMs(input.open, input.serverNowMs))}`);
  } else if (input.summary.runningCount > 0) {
    parts.push(`${input.summary.runningCount} timer${input.summary.runningCount === 1 ? '' : 's'} running`);
  }
  if (input.summary.count > 0 && !input.open) {
    parts.push(`${formatBenchDuration(input.summary.totalMs)} on the bench`);
  }
  parts.push(
    input.actionCount === 0
      ? 'Nothing logged yet'
      : `${input.actionCount} entr${input.actionCount === 1 ? 'y' : 'ies'} logged`,
  );
  return parts.join(' · ');
}
