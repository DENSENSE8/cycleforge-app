/**
 * Slot-layout EDITING — the pure half of the Fields picker.
 *
 * The picker's whole contract in four functions: what the menu lists
 * ({@link slotFieldOptions}), what one click does ({@link toggleFieldBinding}),
 * how a bound row moves within its band ({@link moveFieldBinding}), and why a
 * click was refused (the `reason` carries the limit copy verbatim). Pure and
 * zod-free so the React edge stays a thin dispatcher and every rule here is
 * unit-tested without a DOM.
 *
 * Band choice is the field's own declaration: a field binds into the first
 * band its `slotKinds` allows (status before subtitle). Identity and amount
 * fields are not toggleable — identity is locked by the skeleton, amount is a
 * catalog/capability flag, not a free slot.
 */

import { fieldAllowsSlot, type FieldCatalog, type FieldDef } from '@/lib/tables/field-catalog/types';
import {
  MAX_STATUS_SLOTS,
  MAX_SUBTITLE_SLOTS,
  slotLimitMessage,
  type SlotLayout,
} from '@/lib/tables/slot-layout-core';

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

export type ToggleBindingResult =
  | { ok: true; layout: SlotLayout }
  | { ok: false; reason: string };

function bandFor(field: FieldDef): 'status' | 'subtitle' | null {
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
    const next = bindings.filter((b) => b.fieldId !== field.id);
    return {
      ok: true,
      layout:
        band === 'status'
          ? { ...layout, statusBindings: next }
          : { ...layout, subtitleBindings: next },
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
        : { ...layout, subtitleBindings: next },
  };
}

/**
 * Move a bound field one step up or down within its band's binding array —
 * the explicit reorder the append-only bind order lacked (operator lock
 * 2026-08-30: subtitle display order must be editable without unbind/rebind).
 * Track keys stay positional (`status:N` / `subtitle:N`); a move rewrites the
 * BINDING array only. A move past the band's edge is a no-op (`ok`, same
 * bindings) — the menu disables the edge arrows, so there is no reason copy.
 */
export function moveFieldBinding(
  layout: SlotLayout,
  field: FieldDef,
  direction: 'up' | 'down',
): ToggleBindingResult {
  const band = bandFor(field);
  if (!band) {
    return { ok: false, reason: `'${field.label}' is not a bindable column` };
  }
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
        : { ...layout, subtitleBindings: next },
  };
}

/**
 * Move a bound field to an ABSOLUTE position within its own band.
 *
 * {@link moveFieldBinding} swaps with a neighbour, which is the right primitive
 * for a pair of arrows and the wrong one for a drag: a drop names a
 * destination, not a number of hops, and replaying hops re-enters the layout
 * cascade once per step. This lands the binding in one write.
 *
 * A field can only be reordered inside the band it belongs to — dragging a
 * status column into the subtitle line would be a BIND change, not a move, and
 * `toggleFieldBinding` owns that.
 */
export function reorderFieldBinding(
  layout: SlotLayout,
  field: FieldDef,
  toIndex: number,
): ToggleBindingResult {
  const band = bandFor(field);
  if (!band) {
    return { ok: false, reason: `'${field.label}' is not a bindable column` };
  }
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
        : { ...layout, subtitleBindings: next },
  };
}

/**
 * The Fields picker's rows: every status/subtitle-bindable catalog field, with
 * its bound state and — when its band is full — the limit copy. Identity and
 * amount fields are omitted (locked / not free slots).
 *
 * Within each band, BOUND rows list first, in BINDING order — the top of the
 * menu mirrors the painted order, which is what makes the ↑/↓ reorder arrows
 * readable. Unbound rows follow in catalog order.
 */
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
    options.push({
      fieldId: field.id,
      label: field.label,
      band,
      bound,
      ...(!bound && full ? { disabledReason: slotLimitMessage(band) } : null),
      ...(bound
        ? {
            bindingIndex,
            canMoveUp: bindingIndex > 0,
            canMoveDown: bindingIndex < bindings.length - 1,
          }
        : null),
    });
  }
  // Total order: band, then bound-before-unbound, then binding position for
  // bound rows / catalog position for unbound ones. The menu renders each band
  // separately, so the cross-band grouping is invisible there; what matters is
  // that within a band the list reads top-to-bottom as the painted order.
  const catalogAt = new Map(options.map((o, i) => [o.fieldId, i]));
  return options.sort((a, b) => {
    if (a.band !== b.band) return a.band === 'status' ? -1 : 1;
    if (a.bound !== b.bound) return a.bound ? -1 : 1;
    const ai = a.bound ? (a.bindingIndex ?? 0) : (catalogAt.get(a.fieldId) ?? 0);
    const bi = b.bound ? (b.bindingIndex ?? 0) : (catalogAt.get(b.fieldId) ?? 0);
    return ai - bi;
  });
}
