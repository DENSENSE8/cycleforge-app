'use client';

/** Procedure-gate write waist — optimistic apply → durable persist → revert on failure, with an operator-legible reason. */

import { toast } from '@/lib/toast';

/** Operator-facing failure copy: what did not save, why, and what to do. */
type GateWriteFailure = { title: string; description: string };

/** Resolve the operator message for a failed gate write. */
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
  /** Restore the prior value for **only the items whose write failed**. */
  revert: (failed: readonly T[]) => void;
  request: (item: T) => { url: string; init?: RequestInit };
};

/** The N-writes twin of {@link persistGateWrite} — the "All units" / qty-split / bulk-waiver pickers, which fan one operator tap out to one… */
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
