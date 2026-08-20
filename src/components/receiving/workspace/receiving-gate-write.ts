'use client';

/**
 * Procedure-gate write waist — optimistic apply → durable persist → revert on
 * failure, with an operator-legible reason.
 *
 * ## Why this module exists
 *
 * The Unbox capture steps settle off durable stamps that live on
 * `receiving_line_testing` / `receiving_line_unit`:
 * `condition_graded_at` · `label_printed_at` · `serial_absent`, plus their
 * per-unit twins. `derive-capture-step-states` reads exactly those columns to
 * decide which step is active, so a write that never lands does not merely
 * lose a field — it **advances the operator's step gate on a fact the database
 * never recorded**.
 *
 * Until 2026-08-16 every one of those writes was spelled:
 *
 * ```ts
 * dispatchLineUpdated({ id, condition_graded_at: new Date().toISOString() });
 * void fetch(url, init).catch(() => {});   // ← res.ok never read
 * ```
 *
 * The docblocks justified it as "fire-and-forget; the server COALESCE keeps the
 * first write." COALESCE makes a **duplicate** write harmless; it does nothing
 * for a write that never arrived. A 403, a tenant-scope 404, an RLS rejection
 * or a dropped connection painted the step green, the operator moved to the
 * next carton, and nothing — no toast, no log, no console warning — said
 * otherwise. That is the only failure shape on this bench that produces wrong
 * data with no signal at all.
 *
 * ## The contract
 *
 * Three closures, so the optimistic patch and its undo can never drift apart:
 *
 *   - `apply()`  — paint the optimistic value (also re-run on Retry)
 *   - `revert()` — restore the prior value when the write did not land
 *   - the request — fired once, and its **status is always inspected**
 *
 * `revert()` is what keeps the step gate honest: a failed condition write puts
 * the Condition step back to pending rather than leaving it settled on a lie.
 *
 * Reference sibling for the same discipline on serials:
 * `line-edit/hooks/useLineSerials.ts` (snapshot → POST → restore on every
 * failure branch). This module is that pattern, hoisted so the eight gate
 * helpers cannot each re-derive it.
 *
 * Guard: `receiving-gate-write.guard.test.ts`.
 */

import { toast } from '@/lib/toast';

/** Operator-facing failure copy: what did not save, why, and what to do. */
type GateWriteFailure = { title: string; description: string };

/**
 * Resolve the operator message for a failed gate write.
 *
 * Two invariants:
 *   1. **The title always states the fact was NOT saved.** The operator's next
 *      action depends on knowing the durable value diverged from what they saw,
 *      so that cannot live in a description they may not read.
 *   2. **The description always names a next step.** "Update failed" tells an
 *      operator holding a box nothing they can act on.
 *
 * `status === null` means the request never completed (offline / dropped), which
 * is a different remedy from any server answer and so is its own branch.
 *
 * Exported for the guard + unit tests.
 */
function describeGateWriteFailure(
  fact: string,
  status: number | null,
  serverMessage: string | null,
): GateWriteFailure {
  const title = `${fact} not saved`;
  const server = serverMessage?.trim() || null;

  if (status === null) {
    return {
      title,
      description: "Can't reach the server. Check the bench connection, then retry.",
    };
  }
  if (status === 401) {
    return { title, description: 'Your session expired. Sign in again, then retry.' };
  }
  if (status === 403) {
    return {
      title,
      description: "Your role can't change this. Ask an admin to grant it, then retry.",
    };
  }
  if (status === 404) {
    return {
      title,
      description: 'This line no longer exists — reopen the carton to see its current state.',
    };
  }
  if (status === 409) {
    return {
      title,
      description: 'Someone else changed it first. Reopen the carton, then reapply.',
    };
  }
  if (status >= 500) {
    return {
      title,
      description: server
        ? `Server error — ${server}. Retry; if it keeps failing, report it.`
        : 'Server error. Retry; if it keeps failing, report it.',
    };
  }
  return {
    title,
    description: server ?? 'The server rejected the change. Reopen the carton and try again.',
  };
}

/**
 * Read the server's own reason out of the house `{ success, error, message }`
 * envelope. `withAuth` sends the bare code `INTERNAL` on a 500 with the human
 * text in `message`, so `message` wins and a raw `INTERNAL` is never surfaced.
 */
async function readServerMessage(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => null)) as
    | { error?: unknown; message?: unknown }
    | null;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (message) return message;
  const error = typeof body?.error === 'string' ? body.error.trim() : '';
  if (error && error !== 'INTERNAL') return error;
  return null;
}

function reportFailure(
  fact: string,
  status: number | null,
  serverMessage: string | null,
  retry: () => void,
): void {
  const { title, description } = describeGateWriteFailure(fact, status, serverMessage);
  toast.error(title, { description, action: { label: 'Retry', onClick: retry } });
}

type GateWriteArgs = {
  /**
   * Operator-facing noun for the durable fact, capitalised and reading
   * naturally in `"{fact} not saved"` — e.g. `'Condition grade'`,
   * `'Print record'`, `'No-serial waiver'`.
   */
  fact: string;
  /** Paint the optimistic value. Re-run on Retry, so it must be idempotent. */
  apply: () => void;
  /** Restore the prior value. Runs only when the write did not land. */
  revert: () => void;
  url: string;
  init?: RequestInit;
};

/**
 * Optimistically apply a single durable gate write, then persist it and
 * **inspect the result**. On any non-2xx or network failure the optimistic
 * patch is reverted and the operator gets a reason plus a Retry action.
 */
export function persistGateWrite(args: GateWriteArgs): void {
  if (typeof window === 'undefined') return;
  const { fact, apply, revert, url, init } = args;
  apply();
  void (async () => {
    try {
      const res = await fetch(url, init);
      if (res.ok) return;
      const serverMessage = await readServerMessage(res);
      revert();
      reportFailure(fact, res.status, serverMessage, () => persistGateWrite(args));
    } catch {
      revert();
      reportFailure(fact, null, null, () => persistGateWrite(args));
    }
  })();
}

type GateWriteBatchArgs<T> = {
  /**
   * Singular operator-facing noun for ONE item's fact — the batch title is
   * built as `"{n} of {total} {fact}s not saved"`, e.g. `'unit grade'`.
   */
  fact: string;
  items: readonly T[];
  /** Paint the optimistic value for the whole set. */
  apply: (items: readonly T[]) => void;
  /**
   * Restore the prior value for **only the items whose write failed**.
   *
   * Reverting the whole set would be as wrong as reverting none: on a partial
   * failure the successes are durable, so a blanket revert would put the UI
   * back out of step with the database in the other direction.
   */
  revert: (failed: readonly T[]) => void;
  request: (item: T) => { url: string; init?: RequestInit };
};

/**
 * The N-writes twin of {@link persistGateWrite} — the "All units" / qty-split /
 * bulk-waiver pickers, which fan one operator tap out to one request per unit.
 *
 * Every request is settled and attributed back to its item, so a partial
 * failure reverts precisely the units that did not land and the Retry re-fires
 * only those.
 */
export function persistGateWriteBatch<T>(args: GateWriteBatchArgs<T>): void {
  if (typeof window === 'undefined') return;
  const { fact, items, apply, revert, request } = args;
  if (items.length === 0) return;
  apply(items);
  void (async () => {
    const outcomes = await Promise.all(
      items.map(async (item) => {
        const { url, init } = request(item);
        try {
          const res = await fetch(url, init);
          if (res.ok) return { item, failed: false as const };
          return {
            item,
            failed: true as const,
            status: res.status,
            serverMessage: await readServerMessage(res),
          };
        } catch {
          return { item, failed: true as const, status: null, serverMessage: null };
        }
      }),
    );
    const failures = outcomes.filter((o) => o.failed);
    if (failures.length === 0) return;
    const failed = failures.map((f) => f.item);
    revert(failed);
    // Report the first failure's cause — a mixed-cause batch is vanishingly
    // rare (one bench, one session, one permission set), and naming one real
    // remedy beats "some writes failed".
    const { status, serverMessage } = failures[0];
    const { description } = describeGateWriteFailure(fact, status, serverMessage);
    toast.error(`${failures.length} of ${items.length} ${fact}s not saved`, {
      description,
      action: {
        label: 'Retry',
        onClick: () => persistGateWriteBatch({ ...args, items: failed }),
      },
    });
  })();
}
