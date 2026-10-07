/**
 * Unbox next action (operator 2026-10-07). Unbox is inbound: carrier racks
 * belong to Packing, never here. The carton's Type pill decides, live as the
 * operator changes it — an unfound carton follows whatever its pill says:
 *   Return   → Place on the Return rack
 *   Trade-in → Place on a rack
 *   anything else (PO, unset) → Scan the location it goes to
 * When the org has linked a rack or shelf to that type (directed putaway,
 * `locations.putaway_intake_kind`), its code rides the arrow row.
 */

import type {
  PutawayIntakeKind,
  PutawayTargets,
} from '@/lib/receiving/putaway-targets-contract';
import type { StationNextAction } from './types';

export type UnboxNextActionKind = 'location' | 'return' | 'trade_in';

/** The putaway type a Type pill value answers to — anything unrecognised is a PO. */
export function putawayKindForType(receivingType: string | null | undefined): PutawayIntakeKind {
  const type = (receivingType ?? '').trim().toUpperCase();
  return type === 'RETURN' || type === 'TRADE_IN' ? type : 'PO';
}

const UNBOX_STEP: Record<PutawayIntakeKind, { kind: UnboxNextActionKind; headline: string; label: string }> = {
  RETURN: { kind: 'return', headline: 'Place on the Return rack', label: 'Return rack' },
  TRADE_IN: { kind: 'trade_in', headline: 'Place on a rack', label: 'Rack' },
  PO: { kind: 'location', headline: 'Scan the location it goes to', label: 'Location' },
};

/**
 * `receivingType` — the Type pill's value (`useUnboxLineController().receivingType`);
 * `targets` — the org's linked putaway locations (null while loading / none linked).
 */
export function unboxNextAction(
  receivingType: string | null | undefined,
  targets: PutawayTargets | null = null,
): StationNextAction<UnboxNextActionKind> {
  const putaway = putawayKindForType(receivingType);
  const step = UNBOX_STEP[putaway];
  const linked = targets?.[putaway] ?? null;
  return {
    kind: step.kind,
    headline: step.headline,
    destination: { label: step.label, code: linked?.code ?? null },
    tone: 'default',
  };
}
