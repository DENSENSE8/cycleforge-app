/** Serial scan-commit queue — the INP waist between a HID wedge listener and React / routing / sink dispatch. */

import { yieldToInput, type YieldToInputDeps } from '@/lib/perf/yield-to-input';

interface ScanCommitQueue {
  enqueue: (value: string) => void;
  pendingCount: () => number;
  /** Test / shutdown — drain whatever is queued. */
  flush: () => Promise<void>;
}

interface ScanCommitQueueOptions {
  onScan: (value: string) => void;
  yieldToInput?: (deps?: YieldToInputDeps) => Promise<void>;
}

export function createScanCommitQueue(opts: ScanCommitQueueOptions): ScanCommitQueue {
  const pending: string[] = [];
  let drainPromise: Promise<void> | null = null;
  const yieldFn = opts.yieldToInput ?? yieldToInput;

  function drain(): Promise<void> {
    if (drainPromise) return drainPromise;
    drainPromise = (async () => {
      try {
        while (pending.length > 0) {
          await yieldFn();
          const next = pending.shift();
          if (next == null) continue;
          try {
            opts.onScan(next);
          } catch {
            /* caller errors must not stall later scans */
          }
        }
      } finally {
        drainPromise = null;
        if (pending.length > 0) await drain();
      }
    })();
    return drainPromise;
  }

  return {
    enqueue(value: string) {
      const trimmed = value.trim();
      if (!trimmed) return;
      pending.push(trimmed);
      void drain();
    },
    pendingCount: () => pending.length,
    flush: drain,
  };
}
