/** Ready slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import {
  ALLOCATION_REASON_LABELS,
  CHANNEL_DISPOSITION_LABELS,
  type AllocationHit,
  type ReadyAllocationState,
} from '@/lib/channel-allocation/types';
import { conditionLabel } from '@/lib/conditions';
import { serialStatusLabel } from '@/lib/inventory/serial-status-display';
import { formatDateKeyShort } from '@/utils/date';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

const ALLOCATION_STATE_LABEL: Record<ReadyAllocationState, string> = {
  READY: 'Ready',
  FBA_STAGED: 'In FBA',
  ORDER_ALLOCATED: 'Order allocated',
  NOT_READY: 'Not ready',
};

/** The verdict face — what the test SAID, in one word. */
export function readyVerdictLabel(verdict: string | null): string {
  if (verdict === 'PASS') return 'Passed';
  if (verdict === 'TEST_AGAIN') return 'Retest';
  if (verdict === 'TESTING_FAILED') return 'Failed';
  return 'Recorded';
}

/** Destination label when a hit has no channel-allocation disposition. */
export function readyFallbackStateLabel(hit: AllocationHit): string {
  return hit.allocationState === 'NOT_READY'
    ? serialStatusLabel(hit.unitStatus)
    : ALLOCATION_STATE_LABEL[hit.allocationState];
}

/** What the destination column SHOWS — disposition, else the allocation state. */
export function readyDestinationLabel(hit: AllocationHit): string {
  return hit.disposition
    ? CHANNEL_DISPOSITION_LABELS[hit.disposition]
    : readyFallbackStateLabel(hit);
}

/** The unit a hit is about — title, else SKU, else the bare entity id. */
export function readyHitTitle(hit: AllocationHit): string {
  return hit.title || hit.sku || `Unit #${hit.entityId}`;
}

/**
 * The unit's primary IDENTIFIER handle — the first token of the trail the
 * Product cell paints (SKU · serial · FNSKU · ASIN). This is the `ready.unit`
 * identity fact; the trail is how the structural title track renders it.
 */
function readyUnitHandle(hit: AllocationHit): string {
  return str(hit.sku) ?? str(hit.serialNumber) ?? str(hit.fnsku) ?? str(hit.asin) ?? `id ${hit.entityId}`;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings, so this is
 * defense in depth, not a code path a valid layout reaches.
 */
export function resolveReadySlotValue(
  hit: AllocationHit,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'ready.unit':
      return { kind: 'value', text: readyUnitHandle(hit) };
    case 'ready.verdict':
      return { kind: 'value', text: readyVerdictLabel(hit.verdict) };
    case 'ready.destination':
      return { kind: 'value', text: readyDestinationLabel(hit) };
    case 'ready.reasons':
      return {
        kind: 'value',
        text: hit.reasons.length
          ? hit.reasons.map((r) => ALLOCATION_REASON_LABELS[r]).join(' · ')
          : null,
      };
    case 'ready.velocity':
      return { kind: 'value', text: str(hit.velocityTier) };
    case 'ready.condition': {
      const grade = str(hit.conditionGrade);
      return { kind: 'value', text: grade ? conditionLabel(grade, 'compact') : null };
    }
    case 'ready.tested': {
      const raw = str(hit.testedAt);
      return { kind: 'value', text: raw ? formatDateKeyShort(raw.slice(0, 10)) : null };
    }
    default:
      return null;
  }
}
