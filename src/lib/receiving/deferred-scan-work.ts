/**
 * After-response work for a scan route.
 *
 * A scan answers as soon as the carton is on its rail; the rest of what the
 * scan does (ops events, STN link, classification, priority, exceptions …)
 * registers here as independent steps. ONE scheduled task runs every step —
 * concurrently, each isolated so one failure skips nothing else — and only
 * after all of them settle runs the `whenSettled` hooks (cache invalidation,
 * realtime publish). Listeners told to refetch therefore never read state the
 * deferred writes have not reached yet.
 *
 * `schedule` is Next's `after()` in a route; nothing runs until the scheduled
 * task does, so steps registered any time before the response are included.
 */
export interface DeferredScanWork {
  step(label: string, receivingId: number, run: () => Promise<unknown>): void;
  whenSettled(run: () => Promise<void>): void;
}

export function createDeferredScanWork(
  schedule: (task: () => Promise<void>) => void,
  onStepError: (label: string, receivingId: number, err: unknown) => void,
): DeferredScanWork {
  const steps: Array<{ label: string; receivingId: number; run: () => Promise<unknown> }> = [];
  const settled: Array<() => Promise<void>> = [];
  let scheduled = false;
  const ensureScheduled = () => {
    if (scheduled) return;
    scheduled = true;
    schedule(async () => {
      await Promise.all(
        steps.map(async ({ label, receivingId, run }) => {
          try {
            await run();
          } catch (err) {
            onStepError(label, receivingId, err);
          }
        }),
      );
      for (const hook of settled) await hook();
    });
  };
  return {
    step(label, receivingId, run) {
      steps.push({ label, receivingId, run });
      ensureScheduled();
    },
    whenSettled(run) {
      settled.push(run);
      ensureScheduled();
    },
  };
}
