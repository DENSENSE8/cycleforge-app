/**
 * The table DEFINITION registry — one place that knows every Workbench
 * spreadsheet definition in the product, keyed by `<family>.<view>` id.
 *
 * Plan: `docs/todo/nonlinear-data-table-engine-PLAN.md` (Phase 1, candidate 1 —
 * a static TypeScript registry, Stripe-style). DB-backed org definitions are
 * Horizon C and are deliberately NOT here: the code registry is the kernel that
 * one compounds on, and building the runtime store first would leave nothing to
 * validate an authored payload against.
 *
 * `descriptor.id` has existed as a free-form string on every family descriptor
 * since Phase C and has never had a reader. This is the first one — which is
 * why ids are now shaped (`<family>.<view>`) and enumerated rather than typed
 * once per file and forgotten.
 *
 * ## What lives here vs at the mount
 *
 * The registry holds **bindings** (definition + typed columns + descriptor
 * factory). A page hands the binding to `NonlinearTableHost` and supplies only
 * its feed, its intents and its renderers. Adding a queue should be a registry
 * entry plus a thin binding — never a new `*GridView.tsx`.
 */

import { REGISTERED_BINDINGS } from './registered-bindings';
import type { TableDefinition } from '@/lib/tables/table-definition';

/**
 * The registered DEFINITIONS — derived from {@link REGISTERED_BINDINGS} rather
 * than hand-listed beside it. Two hand-maintained lists of "all the tables"
 * drifted once already; see `registered-bindings.ts` for what that cost.
 *
 * Typed loosely on purpose — the map is for **enumeration and lookup of the
 * data half**. A mount imports its family's binding directly so `Row`/`C` stay
 * checked at compile time; see `table-surface-binding.ts` for why an id-keyed
 * typed lookup would be a cast pretending to be a guarantee.
 */
const REGISTERED_DEFINITIONS: readonly TableDefinition[] = REGISTERED_BINDINGS.map(
  (binding) => binding.definition,
);

export const TABLE_DEFINITIONS: Readonly<Record<string, TableDefinition>> = Object.freeze(
  Object.fromEntries(REGISTERED_DEFINITIONS.map((d) => [d.id, d])),
);

/** Registered ids, sorted — the enumeration guards and Studio read. */
export function tableDefinitionIds(): string[] {
  return Object.keys(TABLE_DEFINITIONS).sort();
}

/**
 * Look up a definition's DATA by id. Returns `undefined` for an unknown id —
 * a caller resolving a stored/authored id must answer for the miss rather than
 * silently mounting a different grid.
 */
export function getTableDefinition(id: string): TableDefinition | undefined {
  return TABLE_DEFINITIONS[id];
}
