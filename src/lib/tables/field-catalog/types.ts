/** Field catalog — the code-owned list of bindable facts for one entity family. */

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
  /** `stage_event` VERB faces for the cell's top line: */
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
