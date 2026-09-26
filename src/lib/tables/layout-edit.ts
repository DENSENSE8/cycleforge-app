/** Slot-layout EDITING — the pure half of the Fields picker. */

import { fieldAllowsSlot, type FieldCatalog, type FieldDef } from '@/lib/tables/field-catalog/types';
import {
  MAX_STATUS_SLOTS,
  MAX_SUBTITLE_SLOTS,
  slotLimitMessage,
  type SlotLayout,
} from '@/lib/tables/slot-layout-core';
import {
  isLineMoneyFieldId,
  LINE_MONEY_LOCKED_REASON,
  pinLineMoneySubtitleBindings,
} from '@/lib/tables/slot-table-line-money';
import {
  isLineQtyFieldId,
  LINE_QTY_LOCKED_REASON,
  pinLineQtySubtitleBindings,
} from '@/lib/tables/slot-table-line-qty';

function pinSubtitleIdentityBindings(layout: SlotLayout): SlotLayout {
  return pinLineMoneySubtitleBindings(pinLineQtySubtitleBindings(layout));
}

function isSubtitleIdentityFieldId(fieldId: string): boolean {
  return isLineQtyFieldId(fieldId) || isLineMoneyFieldId(fieldId);
}

/** One row of the Fields picker, as data. */
export interface SlotFieldOption {
  fieldId: string;
  label: string;
  /** The band this field occupies (bound) or would bind into (unbound). */
  band: 'status' | 'subtitle';
  bound: boolean;
  /** Set when unbound and the band is full — render disabled with this copy. */
  disabledReason?: string;
  /**
   * Bound rows only: this field's 0-based position in its band's binding
   * array, and whether an ↑/↓ move is possible. The menu draws the reorder
   * arrows from these instead of re-deriving band membership.
   */
  bindingIndex?: number;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

type ToggleBindingResult =
  | { ok: true; layout: SlotLayout }
  | { ok: false; reason: string };

function subtitleIdentityLockReason(fieldId: string): string | null {
  if (isLineQtyFieldId(fieldId)) return LINE_QTY_LOCKED_REASON;
  if (isLineMoneyFieldId(fieldId)) return LINE_MONEY_LOCKED_REASON;
  return null;
}

function bandFor(field: FieldDef): 'status' | 'subtitle' | null {
  // Qty / price are subtitle identity even when the catalog also allows status.
  if (isSubtitleIdentityFieldId(field.id) && fieldAllowsSlot(field, 'subtitle')) return 'subtitle';
  if (fieldAllowsSlot(field, 'status')) return 'status';
  if (fieldAllowsSlot(field, 'subtitle')) return 'subtitle';
  return null;
}

function isBoundIn(layout: SlotLayout, band: 'status' | 'subtitle', fieldId: string): boolean {
  const bindings = band === 'status' ? layout.statusBindings : layout.subtitleBindings;
  return bindings.some((b) => b.fieldId === fieldId);
}

/**
 * Bind an unbound field into the next free slot of its band, or unbind a bound
 * one — one gesture, so the picker is a single click either way (interaction
 * budget: open Fields → click the field → done).
 */
export function toggleFieldBinding(layout: SlotLayout, field: FieldDef): ToggleBindingResult {
  const band = bandFor(field);
  if (!band) {
    return { ok: false, reason: `'${field.label}' is not a bindable column` };
  }
  const bindings = band === 'status' ? layout.statusBindings : layout.subtitleBindings;
  const cap = band === 'status' ? MAX_STATUS_SLOTS : MAX_SUBTITLE_SLOTS;

  if (isBoundIn(layout, band, field.id)) {
    const locked = subtitleIdentityLockReason(field.id);
    if (locked) return { ok: false, reason: locked };
    const next = bindings.filter((b) => b.fieldId !== field.id);
    return {
      ok: true,
      layout:
        band === 'status'
          ? { ...layout, statusBindings: next }
          : pinSubtitleIdentityBindings({ ...layout, subtitleBindings: next }),
    };
  }

  if (bindings.length >= cap) {
    return { ok: false, reason: slotLimitMessage(band) };
  }
  const next = [...bindings, { fieldId: field.id }];
  return {
    ok: true,
    layout:
      band === 'status'
        ? { ...layout, statusBindings: next }
        : pinSubtitleIdentityBindings({ ...layout, subtitleBindings: next }),
  };
}

/** Move a bound field one step up or down within its band's binding array — the explicit reorder the append-only bind order lacked… */
export function moveFieldBinding(
  layout: SlotLayout,
  field: FieldDef,
  direction: 'up' | 'down',
): ToggleBindingResult {
  const band = bandFor(field);
  if (!band) {
    return { ok: false, reason: `'${field.label}' is not a bindable column` };
  }
  const locked = subtitleIdentityLockReason(field.id);
  if (locked) return { ok: false, reason: locked };
  const bindings = band === 'status' ? layout.statusBindings : layout.subtitleBindings;
  const at = bindings.findIndex((b) => b.fieldId === field.id);
  if (at < 0) {
    return { ok: false, reason: `'${field.label}' is not bound` };
  }
  const to = direction === 'up' ? at - 1 : at + 1;
  if (to < 0 || to >= bindings.length) {
    return { ok: true, layout };
  }
  const next = [...bindings];
  [next[at], next[to]] = [next[to], next[at]];
  return {
    ok: true,
    layout:
      band === 'status'
        ? { ...layout, statusBindings: next }
        : pinSubtitleIdentityBindings({ ...layout, subtitleBindings: next }),
  };
}

/** Move a bound field to an ABSOLUTE position within its own band. */
export function reorderFieldBinding(
  layout: SlotLayout,
  field: FieldDef,
  toIndex: number,
): ToggleBindingResult {
  const band = bandFor(field);
  if (!band) {
    return { ok: false, reason: `'${field.label}' is not a bindable column` };
  }
  const locked = subtitleIdentityLockReason(field.id);
  if (locked) return { ok: false, reason: locked };
  const bindings = band === 'status' ? layout.statusBindings : layout.subtitleBindings;
  const at = bindings.findIndex((b) => b.fieldId === field.id);
  if (at < 0) {
    return { ok: false, reason: `'${field.label}' is not bound` };
  }
  // Clamp rather than refuse: a drop past the last track means "last", which is
  // what the operator's pointer said even if the index overshoots.
  const to = Math.max(0, Math.min(bindings.length - 1, toIndex));
  if (to === at) return { ok: true, layout };
  const next = [...bindings];
  const [moved] = next.splice(at, 1);
  next.splice(to, 0, moved);
  return {
    ok: true,
    layout:
      band === 'status'
        ? { ...layout, statusBindings: next }
        : pinSubtitleIdentityBindings({ ...layout, subtitleBindings: next }),
  };
}

/** Land a bound field on another bound field in the same band. */
export function reorderFieldBindingByDrop(
  layout: SlotLayout,
  dragField: FieldDef,
  dropField: FieldDef,
): ToggleBindingResult {
  if (dragField.id === dropField.id) return { ok: true, layout };
  const dragBand = bandFor(dragField);
  const dropBand = bandFor(dropField);
  if (!dragBand) {
    return { ok: false, reason: `'${dragField.label}' is not a bindable column` };
  }
  if (dragBand !== dropBand) {
    return {
      ok: false,
      reason: `'${dragField.label}' and '${dropField.label}' are not in the same band`,
    };
  }
  const bindings = dragBand === 'status' ? layout.statusBindings : layout.subtitleBindings;
  const dropIndex = bindings.findIndex((b) => b.fieldId === dropField.id);
  if (dropIndex < 0) {
    return { ok: false, reason: `'${dropField.label}' is not bound` };
  }
  return reorderFieldBinding(layout, dragField, dropIndex);
}

/** The Fields picker's rows: */
export function slotFieldOptions(layout: SlotLayout, catalog: FieldCatalog): SlotFieldOption[] {
  const statusFull = layout.statusBindings.length >= MAX_STATUS_SLOTS;
  const subtitleFull = layout.subtitleBindings.length >= MAX_SUBTITLE_SLOTS;
  const options: SlotFieldOption[] = [];
  for (const field of catalog) {
    const band = bandFor(field);
    if (!band) continue;
    const bindings = band === 'status' ? layout.statusBindings : layout.subtitleBindings;
    const bindingIndex = bindings.findIndex((b) => b.fieldId === field.id);
    const bound = bindingIndex >= 0;
    const full = band === 'status' ? statusFull : subtitleFull;
    const identityLocked = bound && isSubtitleIdentityFieldId(field.id);
    const identityReason = identityLocked ? subtitleIdentityLockReason(field.id) : null;
    options.push({
      fieldId: field.id,
      label: field.label,
      band,
      bound,
      ...(!bound && full ? { disabledReason: slotLimitMessage(band) } : null),
      ...(identityReason ? { disabledReason: identityReason } : null),
      ...(bound
        ? {
            bindingIndex,
            canMoveUp: identityLocked ? false : bindingIndex > 0,
            canMoveDown: identityLocked ? false : bindingIndex < bindings.length - 1,
          }
        : null),
    });
  }
  // Total order: band, then bound-before-unbound, then binding position for bound rows / catalog position for unbound ones.
  const catalogAt = new Map(options.map((o, i) => [o.fieldId, i]));
  return options.sort((a, b) => {
    if (a.band !== b.band) return a.band === 'status' ? -1 : 1;
    if (a.bound !== b.bound) return a.bound ? -1 : 1;
    const ai = a.bound ? (a.bindingIndex ?? 0) : (catalogAt.get(a.fieldId) ?? 0);
    const bi = b.bound ? (b.bindingIndex ?? 0) : (catalogAt.get(b.fieldId) ?? 0);
    return ai - bi;
  });
}
