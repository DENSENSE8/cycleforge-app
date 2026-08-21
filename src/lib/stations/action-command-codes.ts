/**
 * Action command vocabulary — `CMD-*` stickers that WRITE, and the compound
 * `CMD-<VERB>-GO-<TARGET>` stickers that write and then move the operator.
 *
 * Third registry in the family, and the split is the whole safety model:
 *
 *   station-command-codes  arms a session mode on the current surface
 *   nav-command-codes      moves the operator, and CANNOT write
 *   action-command-codes   writes, and says so on its own face
 *
 * A navigation sticker that also changed status would be a status change nobody
 * named — the operator sees a page turn and has no way to know a unit moved
 * lifecycle underneath it. So the write lives on its own code, and a compound
 * spells out both halves (`CMD-PASS-GO-READY`): the sticker's face is the
 * disclosure.
 *
 * **The write itself is not implemented here.** `verdict` names a value that
 * `recordTestVerdict` — the QC verdict SoT — already knows how to apply, along
 * with the `tech_serial_numbers` row, the `testing_results` feed, the parent
 * line rollup and the workflow tap. Re-deriving a status here and calling
 * `transition()` raw would produce a unit whose state moved while none of that
 * happened, which is a worse outcome than not shipping the sticker.
 *
 * Client-safe: the `TestVerdict` import is type-only (erased at compile), so
 * nothing drags `@/lib/db`'s `server-only` graph into a station bundle.
 */

import type { TestVerdict } from '@/lib/tech/recordTestVerdict';
import type { RegistryPermissionString } from '@/lib/auth/permission-registry';

export interface ActionCommandDef {
  /** Exact string encoded on the sticker. */
  code: string;
  /** Human label — Admin catalog + the 2×1" face center. */
  label: string;
  /** The verdict applied through `recordTestVerdict`. */
  verdict: TestVerdict;
  /**
   * Permission required IN ADDITION to the route's floor gate
   * (`tech.qc_pass`). A pass-only tech must not be able to push a unit to hold
   * with a sticker they could not push with the button.
   */
  requires: RegistryPermissionString;
  /**
   * A `NAV_COMMAND_CODES` code to run after the write lands, or null to stay.
   * Resolved by code rather than duplicated as a target, so a compound and its
   * plain jump can never disagree about where "Ready to Pack" is.
   */
  thenGo: string | null;
  sortOrder: number;
}

export const ACTION_COMMAND_CODES: readonly ActionCommandDef[] = [
  // ── Verdict only — record, stay at the bench ──────────────────────────────
  {
    code: 'CMD-PASS',
    label: 'Pass',
    verdict: 'PASS',
    requires: 'tech.qc_pass',
    thenGo: null,
    sortOrder: 10,
  },
  {
    code: 'CMD-FAIL',
    label: 'Fail',
    verdict: 'TESTING_FAILED',
    requires: 'tech.qc_fail',
    thenGo: null,
    sortOrder: 20,
  },
  {
    code: 'CMD-TEST-AGAIN',
    label: 'Test again',
    verdict: 'TEST_AGAIN',
    requires: 'tech.qc_pass',
    thenGo: null,
    sortOrder: 30,
  },

  // ── Compound — record, then move. The headline flow. ──────────────────────
  {
    code: 'CMD-PASS-GO-READY',
    label: 'Pass → Ready to Pack',
    verdict: 'PASS',
    requires: 'tech.qc_pass',
    thenGo: 'CMD-GO-READY',
    sortOrder: 110,
  },
  {
    code: 'CMD-PASS-GO-PACK',
    label: 'Pass → Packing',
    verdict: 'PASS',
    requires: 'tech.qc_pass',
    thenGo: 'CMD-GO-PACK',
    sortOrder: 120,
  },
  {
    code: 'CMD-FAIL-GO-REPAIR',
    label: 'Fail → Repair',
    verdict: 'TESTING_FAILED',
    requires: 'tech.qc_fail',
    thenGo: 'CMD-GO-REPAIR',
    sortOrder: 130,
  },
] as const;

// A note on `CMD-FAIL-GO-REPAIR`, because the plan document said otherwise:
// it lands the unit on ON_HOLD, not IN_REPAIR. `recordTestVerdict` maps
// TESTING_FAILED → ON_HOLD, and hold is where a failed unit waits for someone
// to decide between repair and scrap. The sticker moves the OPERATOR to the
// Repair surface to make that call; inventing a second status path so the code
// matched a sentence in a plan would have forked the verdict SoT to save a
// documentation edit.

const BY_SQUASHED = new Map(
  ACTION_COMMAND_CODES.map((c) => [
    c.code.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    c,
  ] as const),
);

/** Parse a raw scan into an action command, or null when it is not one. */
export function parseActionCommand(raw: string | null | undefined): ActionCommandDef | null {
  return (
    BY_SQUASHED.get(String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')) ?? null
  );
}

/** All registered action commands, in sticker-sheet order. */
export function listActionCommands(): ActionCommandDef[] {
  return [...ACTION_COMMAND_CODES].sort((a, b) => a.sortOrder - b.sortOrder);
}
