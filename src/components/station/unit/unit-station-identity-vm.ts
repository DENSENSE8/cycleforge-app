/**
 * Serial unit → station identity view model. Pure, no React, no JSX.
 *
 * The identity row on a station is the SAME card everywhere
 * (`CartonContextCard` — root `AGENTS.md`: "the carton header has no read-only
 * twin"). What differs per entity is the MAPPING, and for a unit that mapping
 * is worth isolating and testing on its own, because it resolves three separate
 * SoTs and gets them wrong silently if it guesses:
 *
 *   • status  → `unitStatusDotClass` / `unitStatusBadgeClass` (`@/lib/unit-status`)
 *   • grade   → `normalizeCondition` + `conditionLabel` (`@/lib/conditions`)
 *   • lead id → serial number, falling back to the minted `unit_uid`
 *
 * **Intrinsic facts only.** Everything here is a property OF the unit. Its
 * relationships (carton, order, repairs, warranty …) are Displays leaves, not
 * identity — a unit's identity must not change because an allocation did.
 *
 * The card's `lifecycle` slot takes a RESOLVED `{dotClass, pillClass, label}`;
 * it never maps a status itself. This module is that resolver for units.
 */

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
