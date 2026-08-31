/**
 * Field catalog — the code-owned list of bindable facts for one entity family.
 *
 * Plan: `docs/todo/slot-based-metadata-table-PLAN.md` §4.1. An organization
 * does not invent columns; it BINDS catalog fields into fixed presentation
 * slots (identity · status:1…10 · subtitle:1…5 · amount). The catalog is the
 * vocabulary that binding is allowed to speak: every entry names a fact the
 * family's row feed already carries and the family's resolver knows how to
 * read. Nothing here mints a DB column, and nothing here is per-tenant — a
 * tenant's choices live in a {@link SlotLayout}, never in the catalog.
 *
 * Catalogs are data modules (`./orders.ts`, later `./pickup.ts`, …), one per
 * family that has opted into slots. The engine never branches on family for
 * chrome; it branches on {@link FieldDef.displayType} and slot key.
 */

import type { TableDefinition } from '@/lib/tables/table-definition';

/** Entity-family vocabulary, derived from the definition schema's own union. */
export type FieldFamily = TableDefinition['entityFamily'];

/**
 * How a bound field PAINTS — the cell picks its body from this, never from the
 * field id. `stage_event` is the two-line lifecycle step (icon + label over
 * who · time · station); the rest map onto the existing grid cell atoms.
 */
export type FieldDisplayType =
  | 'id'
  | 'text'
  | 'number'
  | 'tag'
  | 'date'
  | 'person'
  | 'stage_event'
  | 'money'
  | 'note'
  | 'tracking';

/** The slot bands a field may bind into. */
export type SlotKind = 'identity' | 'status' | 'subtitle' | 'amount';

/**
 * One bindable fact. `paths` names the row property paths the family resolver
 * reads — documentation for the resolver's contract, not a generic accessor
 * (resolution stays a typed pure function per family, never `row[path]`).
 */
export interface FieldDef {
  /** `<family>.<fact>` — e.g. `orders.picked`. Stable; persisted in layouts. */
  id: string;
  family: FieldFamily;
  /** Header / picker label. */
  label: string;
  displayType: FieldDisplayType;
  /** Bands this field may occupy. Empty would be unbindable — never ship one. */
  slotKinds: readonly SlotKind[];
  /** Glyph key for `stage_event` headers/cells (resolved by the cell layer). */
  iconKey?: string;
  /**
   * `stage_event` VERB faces for the cell's top line: `done` once the event
   * landed, `pending` until then ("Picked" / "Needed"). One word each, so the
   * two states read at the same width and a scanning operator sees state as a
   * verb, not a blank. The header keeps {@link label}. Catalog DATA — never a
   * hard-coded string in a cell.
   */
  stageLabels?: Readonly<{ done: string; pending: string }>;
  /** Row property paths the family resolver understands (documentation). */
  paths?: Readonly<Record<string, string>>;
}

/** A family's catalog — ordered as the Fields picker lists it. */
export type FieldCatalog = readonly FieldDef[];

/** Index a catalog by field id. */
export function catalogById(catalog: FieldCatalog): ReadonlyMap<string, FieldDef> {
  return new Map(catalog.map((f) => [f.id, f]));
}

/** May this field occupy the given band? */
export function fieldAllowsSlot(field: FieldDef, kind: SlotKind): boolean {
  return field.slotKinds.includes(kind);
}
