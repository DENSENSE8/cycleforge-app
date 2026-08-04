/**
 * A Station renders its active entity in exactly ONE region: the middle.
 *
 * The scan column carries the scan bar and the recent rail. It does not carry an
 * identity card, a scan-session summary, or a checklist. Two renders of one
 * entity is not redundancy — it is two things that can disagree, on the surface
 * whose entire job is telling an operator what is in their hands.
 *
 * **Unbox is the control, and it is why this is a rule rather than a taste.**
 * `ReceivingSidebarPanel` contains no identity at all; `LineEditPanel` mounts
 * `StationContextBar` above `StationWorkbench`. Every other bench composes the
 * same `CartonContextCard` waist through a thin adapter
 * (`LineCartonContextSection` · `TestingCartonHeader` ·
 * `ShippingEntityContextHeader` · `PackOrderIdentity` · `ReviewOrderIdentity`),
 * and all five already mount in the workspace. So the defect was never a
 * missing port — it was three stations ALSO drawing the entity in the sidebar.
 *
 * Landed 2026-08-02 with the three deletions it enforces:
 *   - Shipping — `ActiveOrderScanFeedback` moved out of `ShippingScanBand` into
 *     `ActiveOrderWorkspace`. Moved, not deleted: it is the only carrier of the
 *     amber **No order** exception state (`ShippingEntityContextHeader`
 *     hardcodes `isUnmatched={false}`) and of **Undo last serial**, and
 *     `display/station.md` §6 names that exception state as the fix for a
 *     silent-success bug. Deleting it would have taken the fix with it.
 *   - Testing — `TestingScanSessionFeedback` moved to
 *     `components/tech/testing-panel/`, fed across the tree boundary by
 *     `lib/testing/testing-scan-session-bridge` (the shape the shipping bench
 *     already used for `tech-active-order-changed`).
 *   - Packing — see the allowlist below.
 *
 * **The allowlist is shrink-only**, like every other ratchet in this repo:
 * finishing a migration removes a line, and nothing may add one. Raising it to
 * land a change is the thing `verify.md` forbids.
 *
 * @see .claude/rules/display/station.md
 * @see .claude/rules/display/station-workbench.md
 * @see .claude/rules/pattern-evolution.md → Always #6 (a retirement is not done
 *      until the old path is deleted, or a guard names the survivors)
 * @see docs/todo/station-sot-consolidation-HANDOFF.md
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SIDEBAR_DIR = join(ROOT, 'src/components/sidebar');

/**
 * JSX element names that render a station's ACTIVE ENTITY — its identity, its
 * scan-session state, or a whole scan station.
 *
 * Matched by NAME rather than by import path on purpose: the point is that no
 * sidebar panel draws one of these shapes, whoever wrote it. A page-local
 * re-implementation under a new name is the fork this cannot see — which is
 * what the composition matrix in the handoff is for, and why the five adapters
 * are named in the docblock above rather than left implicit.
 */
const ENTITY_DISPLAY_PATTERNS: readonly RegExp[] = [
  /<CartonContextCard\b/,
  /<StationContextBar\b/,
  /<ActiveOrderScanFeedback\b/,
  // `StationPacking` — the 772-LOC whole-scan-station a sidebar panel used to
  // mount. It is now `PackScanColumn` (scan bar · mode banner · transient scan
  // feedback · rail), which is the correct sidebar shape, so the NAME is kept
  // banned rather than the file: a component reintroduced under the old name is
  // almost certainly the old shape coming back.
  /<StationPacking\b/,
  /<PackerRightPane\b/,
  /<[A-Za-z]*SessionFeedback\b/,
  /<[A-Za-z]*OrderIdentity\b/,
  /<[A-Za-z]*EntityContextHeader\b/,
  /<[A-Za-z]*CartonHeader\b/,
  /<[A-Za-z]*CartonContextSection\b/,
];

/**
 * Repo-relative files under `src/components/sidebar/**` that still render an
 * active-entity display. **Shrink-only.**
 */
const ALLOWLIST: ReadonlyMap<string, string> = new Map([
  // EMPTY as of 2026-08-02 — every station now draws its active entity in the
  // middle only. Packing was the last one out, and it took two moves:
  //   1. The FBA scan result card (the one display here that was never gated,
  //      because an FBA scan had no workspace pane to move to) got one —
  //      `PackActiveFbaPane` → `PackOrderWorkspace` → `PackFbaScanCard`.
  //   2. `StationPacking` was renamed `PackScanColumn`, because after the dead
  //      standalone branches came out (welcome + goal HUD, `OrderPackChecklist`,
  //      `SupportContextHub`, `PackZendeskSection`, the active-order card — all
  //      unreachable, since the sole caller always passed `embedded` +
  //      `railSlot`) it is no longer a scan station at all. 772 → 619 LOC.
  //
  // A NEW ENTRY IS A REGRESSION, not a starting point. Move the display into
  // the workspace panel instead — `ActiveOrderWorkspace`, `TestingPanel` and
  // `PackOrderWorkspace` are three worked examples, one per station.
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!entry.name.endsWith('.tsx')) continue;
    out.push(full);
  }
  return out;
}

/** Strip comments so a docblock naming a banned component is not a violation. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('station sidebar identity guard', () => {
  const files = walk(SIDEBAR_DIR);

  it('finds sidebar panels to check', () => {
    assert.ok(files.length > 20, `expected a populated sidebar tree, saw ${files.length}`);
  });

  it('no sidebar panel renders a station active-entity display', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(ROOT, file);
      const source = stripComments(readFileSync(file, 'utf8'));
      const hits = ENTITY_DISPLAY_PATTERNS.filter((re) => re.test(source)).map((re) =>
        String(re),
      );
      if (hits.length === 0) continue;
      if (ALLOWLIST.has(rel)) continue;
      offenders.push(`${rel} → ${hits.join(', ')}`);
    }

    assert.deepEqual(
      offenders,
      [],
      [
        'A Station renders its active entity in the MIDDLE, never in the scan column.',
        'Move the display into the workspace panel (see ActiveOrderWorkspace /',
        'TestingPanel for the two worked examples), or add a shrink-only allowlist',
        'entry WITH a reason and a stated exit.',
        '',
        ...offenders,
      ].join('\n'),
    );
  });

  it('the allowlist only shrinks', () => {
    const stillOffending = [...ALLOWLIST.keys()].filter((rel) => {
      const source = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
      return ENTITY_DISPLAY_PATTERNS.some((re) => re.test(source));
    });

    assert.deepEqual(
      stillOffending,
      [...ALLOWLIST.keys()],
      'An allowlisted file no longer renders an entity display — delete its entry. Baselines only shrink.',
    );
  });

  it('Unbox stays the control — its sidebar carries no identity', () => {
    const source = stripComments(
      readFileSync(join(ROOT, 'src/components/sidebar/ReceivingSidebarPanel.tsx'), 'utf8'),
    );
    for (const re of ENTITY_DISPLAY_PATTERNS) {
      assert.ok(
        !re.test(source),
        `ReceivingSidebarPanel is the SoT this guard is derived from — it must never match ${re}`,
      );
    }
  });
});
