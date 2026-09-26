'use client';

import type { SyncStreamEvent } from '@/lib/orders-sync/types';
import {
  consumeNdjsonBuffer,
  consumeNdjsonTrailing,
  malformedToErrorEvent,
} from '@/lib/orders-sync/parse-ndjson';
import {
  applyStreamBudget,
  STREAM_APPLY_BATCH_SIZE,
} from '@/lib/perf/stream-apply';
import { yieldToInput, type YieldToInputDeps } from '@/lib/perf/yield-to-input';

/** Fetches an NDJSON endpoint and invokes `onEvent` / `onBatch` for parsed events. */
export interface StreamNdjsonOptions<T> {
  onEvent?: (event: T) => void;
  /** Prefer this for React — one paint per budgeted window. */
  onBatch?: (events: T[]) => void;
  batchSize?: number;
  yieldBetweenBatches?: boolean;
  yieldToInput?: (deps?: YieldToInputDeps) => Promise<void>;
  fetch?: typeof fetch;
}

export type StreamNdjsonHandler<T> = ((event: T) => void) | StreamNdjsonOptions<T>;

function resolveHandler<T>(handler: StreamNdjsonHandler<T>): StreamNdjsonOptions<T> {
  return typeof handler === 'function' ? { onEvent: handler } : handler;
}

function dispatchBatch<T>(events: T[], opts: StreamNdjsonOptions<T>): void {
  if (events.length === 0) return;
  if (opts.onBatch) opts.onBatch(events);
  if (opts.onEvent) {
    for (const event of events) opts.onEvent(event);
  }
}

export async function streamNdjson<T = SyncStreamEvent>(
  url: string,
  init: RequestInit,
  handler: StreamNdjsonHandler<T>,
): Promise<void> {
  const opts = resolveHandler(handler);
  const fetchImpl = opts.fetch ?? fetch;
  const response = await fetchImpl(url, init);
  if (!response.ok || !response.body) {
    // Surface server-side errors as a single `error` event so callers don't
    // need to special-case non-streaming failures.
    let text = '';
    try {
      text = await response.text();
    } catch {
      // ignore
    }
    dispatchBatch([{ type: 'error', error: text || `HTTP ${response.status}` } as T], opts);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const yieldFn =
    opts.yieldBetweenBatches === false
      ? async () => undefined
      : (opts.yieldToInput ?? yieldToInput);
  const batchSize = opts.batchSize ?? STREAM_APPLY_BATCH_SIZE;

  const emitParsed = async (parsed: T[], malformed: string[], trailing = false) => {
    const events: T[] = [...parsed];
    for (const line of malformed) {
      events.push(malformedToErrorEvent<T>(line, trailing));
    }
    if (events.length === 0) return;
    await applyStreamBudget(events, {
      apply: (batch) => dispatchBatch(batch, opts),
      batchSize,
      yieldToInput: yieldFn,
    });
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest, malformed } = consumeNdjsonBuffer<T>(buffer);
    buffer = rest;
    await emitParsed(events, malformed, false);
  }

  const trailing = consumeNdjsonTrailing<T>(buffer);
  await emitParsed(trailing.events, trailing.malformed, true);
}
