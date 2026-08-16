/**
 * Frame-budgeted apply for live NDJSON / Ably bursts.
 *
 * A 400-line exceptions stream or a reconnect flood of `order.changed`
 * messages must not `setState` per line on the same task — that is the
 * Speed Index + INP cliff on Incoming / Unshipped during import. This
 * helper:
 *
 *  • flushes control events (`phase` / `result` / `error`) immediately so
 *    the decaying-timestamp status label stays honest
 *  • batches row events up to `batchSize` or `timeBudgetMs`
 *  • yields to input between batches so a wedge scan can land mid-stream
 *
 * Orthogonal exception dimensions (SCANNED + PROBLEM) ride along as row
 * payloads — this module never collapses them to pass/fail.
 */

import { yieldToInput, type YieldToInputDeps } from '@/lib/perf/yield-to-input';

export const STREAM_APPLY_BATCH_SIZE = 16;
/** ~half a 16ms frame — leave the rest for input + paint. */
export const STREAM_APPLY_TIME_BUDGET_MS = 8;

export interface ApplyStreamBudgetOptions<T> {
  apply: (batch: T[]) => void;
  isControl?: (event: T) => boolean;
  batchSize?: number;
  timeBudgetMs?: number;
  yieldToInput?: (deps?: YieldToInputDeps) => Promise<void>;
  now?: () => number;
}

export function isSyncControlEvent(event: { type?: string }): boolean {
  return event.type === 'phase' || event.type === 'result' || event.type === 'error';
}

/**
 * Apply `events` in input-yielding batches. Control events flush any
 * pending rows first, then apply as a singleton so status text paints
 * without waiting for the next row window.
 */
export async function applyStreamBudget<T>(
  events: readonly T[],
  opts: ApplyStreamBudgetOptions<T>,
): Promise<void> {
  const batchSize = opts.batchSize ?? STREAM_APPLY_BATCH_SIZE;
  const timeBudgetMs = opts.timeBudgetMs ?? STREAM_APPLY_TIME_BUDGET_MS;
  const isControl =
    opts.isControl ?? ((event: T) => isSyncControlEvent(event as { type?: string }));
  const yieldFn = opts.yieldToInput ?? yieldToInput;
  const now = opts.now ?? (() => performance.now());

  let batch: T[] = [];
  let startedAt = now();

  const flush = () => {
    if (batch.length === 0) return;
    const outgoing = batch;
    batch = [];
    opts.apply(outgoing);
    startedAt = now();
  };

  for (const event of events) {
    if (isControl(event)) {
      flush();
      opts.apply([event]);
      await yieldFn();
      startedAt = now();
      continue;
    }
    batch.push(event);
    const overCount = batch.length >= batchSize;
    const overTime = now() - startedAt >= timeBudgetMs;
    if (overCount || overTime) {
      flush();
      await yieldFn();
    }
  }
  flush();
}
