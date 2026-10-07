/**
 * Shared shapes for the Records sheet's writes (`src/lib/records/sheet-actions/*`).
 * Every write names LINES (see sheet-actions-contract.ts), runs in one tenant
 * transaction, audits each line it changes on that transaction, and answers
 * one result per target in target order.
 */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  recordTargetKey,
  type RecordActionResponse,
  type RecordActionResult,
  type RecordTarget,
} from '@/lib/records/sheet-actions-contract';

/** The tenant transaction a write runs on (`withTenantTransaction`'s client). */
export type Tx = PoolClient;

/** One audit_logs row, before/after for one line. */
export interface RecordAuditEntry {
  action: string;
  entityType: string;
  entityId: number;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  extra?: Record<string, unknown>;
}

/** Who writes, and how their audit rows land (on the write's own transaction). */
export interface RecordWriteActor {
  orgId: OrgId;
  staffId: number | null;
  audit: (tx: Tx, entry: RecordAuditEntry) => Promise<void>;
}

/** The answer plus what changed, for the route's realtime / cache side-effects. */
export interface RecordWriteOutcome extends RecordActionResponse {
  /** `orders.id` rows written (publishOrderChanged). */
  changedOrderIds: number[];
  /** `receiving_line.id` rows written (publishReceivingLogChanged). */
  changedReceivingLineIds: number[];
}

/** Runs `fn` inside one tenant transaction. */
export type RunInTx = <T>(orgId: OrgId, fn: (tx: Tx) => Promise<T>) => Promise<T>;

/** The targets split by direction, ids de-duplicated (a target named twice is acted on once). */
export function splitTargets(targets: readonly RecordTarget[]): { outboundIds: number[]; inboundIds: number[] } {
  const outbound = new Set<number>();
  const inbound = new Set<number>();
  for (const t of targets) (t.direction === 'outbound' ? outbound : inbound).add(t.id);
  return { outboundIds: [...outbound], inboundIds: [...inbound] };
}

const NOT_FOUND_REASON = 'Not found — it may have been deleted';

/**
 * Per-line answers, keyed `out:<id>` / `in:<id>`. Every line starts `done`;
 * a refusal sticks (the first reason wins).
 */
export class RecordResults {
  private readonly refusals = new Map<string, string>();
  private readonly targets: readonly RecordTarget[];

  constructor(targets: readonly RecordTarget[]) {
    this.targets = targets;
  }

  refuse(direction: RecordTarget['direction'], id: number, reason: string): void {
    const key = recordTargetKey({ direction, id });
    if (!this.refusals.has(key)) this.refusals.set(key, reason);
  }

  isRefused(direction: RecordTarget['direction'], id: number): boolean {
    return this.refusals.has(recordTargetKey({ direction, id }));
  }

  /** Refuse every id the transaction could not find (other org, or deleted meanwhile). */
  refuseMissing(direction: RecordTarget['direction'], ids: readonly number[], found: ReadonlyArray<{ id: number }>): void {
    const present = new Set(found.map((l) => l.id));
    for (const id of ids) if (!present.has(id)) this.refuse(direction, id, NOT_FOUND_REASON);
  }

  outcome(changed: { orderIds: Iterable<number>; receivingLineIds: Iterable<number> }): RecordWriteOutcome {
    const results: RecordActionResult[] = this.targets.map((t) => {
      const key = recordTargetKey(t);
      const reason = this.refusals.get(key);
      return reason ? { key, outcome: 'refused', reason } : { key, outcome: 'done' };
    });
    return {
      results,
      changedOrderIds: [...new Set(changed.orderIds)],
      changedReceivingLineIds: [...new Set(changed.receivingLineIds)],
    };
  }
}
