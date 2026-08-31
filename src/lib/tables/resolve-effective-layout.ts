/**
 * The layout cascade — which SlotLayout a given staffer actually sees.
 *
 * Plan: `docs/todo/slot-based-metadata-table-PLAN.md` §4.3. Precedence, LOCKED:
 *
 *   savedViewLayout ?? staffLayout ?? orgLayout ?? productDefault
 *
 * Last non-null wins **as a whole document** — never a deep merge of binding
 * arrays. Partial merges of positional arrays produce silent half-configs
 * (org's status:2 grafted under staff's status:1 is a layout nobody authored);
 * editors always load-edit-save the full layout instead.
 *
 * After the pick, the winning document is validated against the family catalog
 * the SOFT way: a binding whose field id the catalog no longer knows (a field
 * renamed in code, a custom field deleted) is DROPPED with a warning, and the
 * layout still paints. A queue must never white-screen because an org override
 * aged; it degrades toward the product default one binding at a time. The one
 * non-droppable slot is identity — a table with no identity column is not a
 * table — so a stale identity field falls back to the product default's, which
 * is valid by construction (guard-tested at module load).
 */

import {
  catalogById,
  fieldAllowsSlot,
  type FieldCatalog,
  type FieldDef,
  type SlotKind,
} from '@/lib/tables/field-catalog/types';
import {
  MAX_STATUS_SLOTS,
  MAX_SUBTITLE_SLOTS,
  type SlotBinding,
  type SlotLayout,
} from '@/lib/tables/slot-layout-core';

export interface ResolveEffectiveLayoutArgs {
  /** Code-owned default for this tableId. Must be catalog-valid. */
  productDefault: SlotLayout;
  /** `organizations.settings.tableLayouts[tableId]`, already shape-read. */
  orgLayout?: SlotLayout | null;
  /** `staff_preferences.prefs.tableLayouts[tableId]`, already shape-read. */
  staffLayout?: SlotLayout | null;
  /** A saved view's layout blob, when the surface carries one. */
  savedViewLayout?: SlotLayout | null;
  catalog: FieldCatalog;
  /** Stale-binding reporter. Default: silent (pure). Pass console.warn at hosts. */
  onWarn?: (message: string) => void;
}

function keepBindings(
  bindings: readonly SlotBinding[],
  kind: Extract<SlotKind, 'status' | 'subtitle'>,
  byId: ReadonlyMap<string, FieldDef>,
  cap: number,
  warn: (message: string) => void,
): SlotBinding[] {
  const kept: SlotBinding[] = [];
  const seen = new Set<string>();
  for (const [i, binding] of bindings.entries()) {
    const field = byId.get(binding.fieldId);
    if (!field || !fieldAllowsSlot(field, kind)) {
      warn(`slot layout: dropped stale ${kind}:${i + 1} binding '${binding.fieldId}'`);
      continue;
    }
    // The strict write gate rejects duplicates, but a hand-written prefs blob
    // is only structurally validated — painting the same fact in two slots is
    // the silent half-config class this resolver exists to absorb.
    if (seen.has(binding.fieldId)) {
      warn(`slot layout: dropped duplicate ${kind} binding '${binding.fieldId}'`);
      continue;
    }
    if (kept.length >= cap) {
      warn(`slot layout: dropped over-budget ${kind} binding '${binding.fieldId}'`);
      continue;
    }
    seen.add(binding.fieldId);
    kept.push(binding);
  }
  return kept;
}

/**
 * Pick the winning layer (whole document, last-wins) and soft-validate it
 * against the catalog. Always returns a paintable layout.
 */
export function resolveEffectiveLayout({
  productDefault,
  orgLayout,
  staffLayout,
  savedViewLayout,
  catalog,
  onWarn,
}: ResolveEffectiveLayoutArgs): SlotLayout {
  const warn = onWarn ?? (() => {});
  const picked = savedViewLayout ?? staffLayout ?? orgLayout ?? productDefault;
  const byId = catalogById(catalog);

  const identityField = byId.get(picked.identityFieldId);
  const identityValid =
    identityField != null &&
    identityField.displayType === 'id' &&
    fieldAllowsSlot(identityField, 'identity');
  if (!identityValid) {
    warn(
      `slot layout: identity '${picked.identityFieldId}' is not a valid identity field — ` +
        `falling back to '${productDefault.identityFieldId}'`,
    );
  }

  const amountField = picked.amountFieldId ? byId.get(picked.amountFieldId) : null;
  const amountValid = amountField != null && fieldAllowsSlot(amountField, 'amount');
  if (picked.amountFieldId && !amountValid) {
    warn(`slot layout: dropped stale amount binding '${picked.amountFieldId}'`);
  }

  return {
    morph: picked.morph,
    identityFieldId: identityValid ? picked.identityFieldId : productDefault.identityFieldId,
    statusBindings: keepBindings(picked.statusBindings, 'status', byId, MAX_STATUS_SLOTS, warn),
    subtitleBindings: keepBindings(
      picked.subtitleBindings,
      'subtitle',
      byId,
      MAX_SUBTITLE_SLOTS,
      warn,
    ),
    amountFieldId: amountValid ? picked.amountFieldId : null,
  };
}
