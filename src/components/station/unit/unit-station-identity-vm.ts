/** Serial unit → station identity view model. */

import { conditionLabel } from '@/lib/conditions';
import { unitStatusBadgeClass, unitStatusDotClass } from '@/lib/unit-status';
import { normalizeCondition } from '@/components/tech/StationConditionEditor';

/** The intrinsic slice of `SerialUnitDetailPayload['serial_unit']` we read. */
export interface UnitIdentityInput {
  id: number;
  serial_number: string | null;
  unit_uid?: string | null;
  sku: string | null;
  product_title?: string | null;
  current_status: string | null;
  current_location?: string | null;
  condition_grade?: string | null;
}

/** Exactly the shape `CartonContextCard.lifecycle` expects. */
export interface UnitLifecycleFace {
  dotClass: string;
  pillClass: string;
  label: string;
  tip?: string | null;
}

export interface UnitStationIdentityVM {
  /** Lead identity text — the serial, else the minted uid, else a dash. */
  leadDisplay: string;
  /** True when `leadDisplay` came from `unit_uid` rather than a real serial. */
  leadIsMintedUid: boolean;
  /** Full serial for copy actions — never the truncated display. */
  serialValue: string;
  sku: string;
  productTitle: string;
  location: string;
  lifecycle: UnitLifecycleFace | null;
  /** Normalized grade code, or null when the unit is ungraded. */
  conditionGrade: string | null;
  conditionText: string;
}

/**
 * A status the state machine does not know is shown VERBATIM, not swallowed.
 * `unitStatusDotClass` already falls back on tone; the label must not silently
 * become "Unknown" and hide a real value an operator can act on.
 */
export function unitLifecycleFace(status: string | null | undefined): UnitLifecycleFace | null {
  const raw = String(status ?? '').trim();
  if (!raw) return null;
  return {
    dotClass: unitStatusDotClass(raw),
    pillClass: unitStatusBadgeClass(raw),
    label: raw.replace(/_/g, ' '),
    tip: null,
  };
}

export function buildUnitStationIdentityVM(unit: UnitIdentityInput): UnitStationIdentityVM {
  const serialValue = String(unit.serial_number ?? '').trim();
  const mintedUid = String(unit.unit_uid ?? '').trim();
  const leadIsMintedUid = !serialValue && Boolean(mintedUid);
  const leadDisplay = serialValue || mintedUid || '—';

  const rawGrade = String(unit.condition_grade ?? '').trim();
  const conditionGrade = rawGrade ? normalizeCondition(rawGrade) : null;

  return {
    leadDisplay,
    leadIsMintedUid,
    serialValue,
    sku: String(unit.sku ?? '').trim(),
    productTitle: String(unit.product_title ?? '').trim(),
    location: String(unit.current_location ?? '').trim(),
    lifecycle: unitLifecycleFace(unit.current_status),
    conditionGrade,
    // Ungraded is a real, common state on a unit that has not reached testing —
    // an em dash, never a fabricated grade.
    conditionText: conditionGrade ? conditionLabel(conditionGrade, 'pill') : '—',
  };
}
