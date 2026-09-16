/**
 * THE IDENTITY PURITY LAW — The ID column is strictly for machine identifiers.
 *
 * Operator 2026-09-15: "never display and import the names into the ID column
 * of the slot data table and the names would be similar to like the shipping
 * page where the slot data table is displaying the names as another column Not
 * in the id column. The id column is only for ids."
 *
 * ## Invariants
 *
 * 1. **Machine Handles Only:**
 *    The identity column (`fulfillment` on the compound skeleton, `identity` on
 *    the sheet skeleton) carries only machine identifiers: order numbers, PO
 *    numbers, tracking numbers, barcodes, SKUs, serial numbers, or system IDs.
 *
 * 2. **No Human Attribution in ID Tracks:**
 *    Staff names, packer names, technician names, tester names, customer names,
 *    and user handles MUST NEVER be imported into, bound to, or rendered inside
 *    the identity column.
 *
 * 3. **Names Belong in Dedicated Person / Status Tracks:**
 *    Human actors belong exclusively in dedicated stage or person columns
 *    (e.g. `orders.picked`, `orders.packed`), rendered via `AssigneeCombobox` /
 *    `StaffAvatar` in stage status tracks or explicit metadata columns.
 *
 * 4. **Enforcement Stack:**
 *    - Law module: `src/lib/tables/slot-table-identity-purity-law.ts` (this file)
 *    - Fast verify gate: `scripts/identity-purity-guard.ts` (`verify:fast`, <1s)
 *    - Unit tripwire: `src/lib/tables/slot-table-identity-purity-law.test.ts`
 *    - AST lint: `eslint.config.mjs` refuses name identifiers in identity bindings
 *    - Design MCP: `ds_identity_purity`
 *    - Display cohort: `src/lib/tables/slot-table-cohort.ts` (`eval:cohort slot-table`)
 */

import type { FieldDef, FieldDisplayType } from '@/lib/tables/field-catalog/types';

export const SLOT_TABLE_IDENTITY_PURITY_LAW =
  'The ID column is strictly for machine identifiers. Staff names and person attributions belong exclusively in dedicated status/person columns.' as const;

/** Display types that may never bind to an identity slot. */
export const BANNED_IDENTITY_DISPLAY_TYPES: readonly FieldDisplayType[] = [
  'person',
  'stage_event',
  'note',
] as const;

/** Property name patterns in catalog field `paths` that indicate person/staff attribution. */
export const BANNED_IDENTITY_PATH_PATTERNS: readonly RegExp[] = [
  /(?:^|_)(?:staff|packer|tester|tech|technician|assignee|creator|user|customer)(?:_id|_name|$)/i,
  /(?:^|_)(?:tested_by|packed_by|picked_by|shipped_by|created_by|assigned_to)(?:_name|$)/i,
  /(?:^|_)person_name$/i,
] as const;

/** Property names on row view models that carry human/staff display strings. */
export const BANNED_IDENTITY_ROW_PROPERTIES: readonly string[] = [
  'testerDisplay',
  'packerDisplay',
  'testerName',
  'packerName',
  'staffName',
  'tested_by_name',
  'packed_by_name',
  'shipped_out_by_name',
  'assigned_tech_name',
  'assigned_packer_name',
] as const;

export const SLOT_TABLE_IDENTITY_PURITY_REFUSAL =
  'The ID column is only for IDs (operator 2026-09-15). Staff names and person attributions must not be imported into or displayed in the identity track. Bind them to a person or stage_event status column instead.' as const;

/** Validate a field definition for compliance with the Identity Purity Law. */
export function assertValidIdentityFieldDef(field: FieldDef): void {
  if (field.slotKinds.includes('identity')) {
    if (field.displayType !== 'id') {
      throw new Error(
        `Identity Purity Violation in field '${field.id}': slotKinds includes 'identity' but displayType is '${field.displayType}'. Only displayType: 'id' is allowed.`,
      );
    }

    if (field.paths) {
      for (const [pathKey, propertyPath] of Object.entries(field.paths)) {
        for (const pattern of BANNED_IDENTITY_PATH_PATTERNS) {
          if (pattern.test(pathKey) || pattern.test(propertyPath)) {
            throw new Error(
              `Identity Purity Violation in field '${field.id}': path '${pathKey}: ${propertyPath}' maps human attribution into an identity slot.`,
            );
          }
        }
      }
    }
  }
}
