/**
 * Return-to-scan CTA — the RESUME contract on hybrid Station+Workbench benches.
 *
 * The CTA in a scan station's workbench chrome **resumes**: it re-opens the
 * station's most recently worked record (which, on a rail whose `selectedId` is
 * that record, also marks the left sidebar) and re-arms the scan bar. It does
 * NOT land a bare data table — the button already sits inside the station's own
 * chrome, so "go here" is not a meaning it can carry.
 *
 * WHY THIS IS A TEST AND NOT A PARAGRAPH
 * The table-first version failed SILENTLY and looked correct in review. Two
 * independent defects, neither visible in the handler:
 *
 *  1. The MRU came from `view=unbox_opened` while the landed Recent tab is
 *     `view=viewed` — two different memberships (and since 2026-08-01 a browse
 *     click no longer stamps a view), so the highlighted row was frequently not
 *     in the table it landed.
 *  2. `useReceivingRowSelection` nulls `selectedId` whenever the id is absent
 *     from `localRows`, and the CTA emitted after its own `await` — racing the
 *     tab's refetch. Either way the highlight died and the click read as a tab
 *     change: "the Unbox button just goes to the Recents tab".
 *
 * The trap a PORT will hit is different and equally invisible: `setUnboxView`
 * dispatches `receiving-clear-line` unless passed `clearLine: false`
 * (`src/hooks/useUnboxWorkspaceTab.ts`), so a handler that switches the bench
 * tab without the flag drops the record it just resumed — reproducing the exact
 * symptom this lane was opened to fix. Nothing else in the repo can catch that,
 * which is what earns this file.
 *
 * SCOPE: assertions are on the handler's SHAPE (which calls, and the ban), not
 * on runtime behaviour. "The carton actually opened" needs a browser — see the
 * plan doc's verification section.
 *
 * @see .claude/rules/source-of-truth.md → Return-to-scan chrome CTA
 * @see .claude/rules/display/workbench.md → Return-to-scan contract
 * @see docs/todo/return-to-scan-PORTS.md → §1.2 the recipe (copy this)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

/**
 * Hybrid chrome hosts whose CTA must resume. **Grows as ports land** — a new
 * entry is a port finishing, never a relaxation.
 *
 * Not yet here (they have no CTA at all yet — the ports in
 * `docs/todo/return-to-scan-PORTS.md` §3): Testing · Triage · Pack · Shipping ·
 * Labels. Add each one WITH its port, in the same change.
 */
const RESUME_HOSTS = [
  {
    label: 'Unbox',
    file: 'src/components/receiving/unbox/UnboxWorkspaceHeader.tsx',
    /** The station's own MRU feed fetcher — must be the sidebar rail's feed. */
    mruFetch: 'fetchUnboxOpenedRows',
    /** The signal that opens the record (and marks the rail). */
    openSignal: "'receiving-select-line'",
    /** The signal that re-arms the wedge. */
    focusSignal: "'receiving-focus-scan'",
  },
] as const;

/**
 * Benches that deliberately ship a CTA with NO resume step, each with its
 * reason. Honest absence is a declaration, not an omission — and this list is
 * shrink-only: a surface leaves it by growing a resumable bench record, never
 * by someone deciding the rule is inconvenient.
 */
const RESUME_EXEMPT: Record<string, string> = {
  Labels: 'no MRU feed at all — OutboundSidebarPanel is saved views',
  Pack: 'PackRecentPacksRail is a per-staff history feed with no selected id',
  Shipping: 'ShippingStaffScanHistoryRail — same shape as Pack',
};

/**
 * Source with comments removed.
 *
 * **Load-bearing, and learned by falsifying this file's own first draft.** Every
 * handler here carries a comment explaining the `clearLine: false` trap, so a
 * bare substring search for `clearLine: false` matched the PROSE and passed even
 * after the real argument was deleted — a guard that could not fail. Ports will
 * quote the recipe in their comments too, so assertions must read code only.
 *
 * Imprecise by design (a `//` inside a string literal is treated as a comment),
 * which is harmless: the result is used solely for presence checks.
 */
function readCode(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

describe('return-to-scan CTA resumes the station MRU record', () => {
  for (const host of RESUME_HOSTS) {
    describe(host.label, () => {
      const code = readCode(host.file);

      it('resolves its MRU from the station feed', () => {
        assert.match(
          code,
          new RegExp(`${host.mruFetch}\\s*\\(`),
          `${host.label}: expected the CTA to resolve an MRU via ${host.mruFetch}(). ` +
            'A resume with no record to resume is a tab switch.',
        );
      });

      it('opens the record rather than only highlighting a table row', () => {
        assert.match(
          code,
          new RegExp(`emitReceiving\\(\\s*${host.openSignal}`),
          `${host.label}: expected emitReceiving(${host.openSignal}, …) so the record ` +
            'OPENS (and the sidebar rail marks it, because the rail\'s selectedId IS ' +
            'that record). See source-of-truth.md → Return-to-scan chrome CTA.',
        );
      });

      it('re-arms the scan bar', () => {
        assert.match(
          code,
          new RegExp(`emitReceiving\\(\\s*${host.focusSignal}`),
          `${host.label}: expected emitReceiving(${host.focusSignal}) — the wedge must ` +
            'own focus after the record mounts, or the bench silently stops accepting scans.',
        );
      });

      it('does NOT close an open record on the CTA path', () => {
        assert.doesNotMatch(
          code,
          /dispatchReceivingWorkspaceClose\s*\(/,
          `${host.label}: the CTA must not close the focus overlay. Ruled 2026-08-03 — ` +
            'a resume that begins by closing is churn, and a visible flicker when the ' +
            'MRU already IS the open record. A failed MRU lookup must also leave the ' +
            'open carton alone.',
        );
      });

      it('switches the bench tab WITHOUT clearing the pick', () => {
        assert.match(
          code,
          /onSelectTab\s*\(/,
          `${host.label}: expected the CTA to land a bench tab.`,
        );
        // Matched on the CALL, not anywhere in the file: the flag's name also
        // appears in every handler's explanatory comment, and a file-wide
        // substring search passed even with the real argument deleted.
        assert.match(
          code,
          /onSelectTab\s*\([^)]*clearLine:\s*false/,
          `${host.label}: the bench-tab switch must pass \`clearLine: false\` in the ` +
            'call itself. Without it the tab setter dispatches `receiving-clear-line` ' +
            'and drops the record the CTA just resumed — which reproduces exactly ' +
            '"the button just goes to the Recents tab".',
        );
      });
    });
  }

  it('every honest-absence bench states a reason', () => {
    for (const [label, reason] of Object.entries(RESUME_EXEMPT)) {
      assert.ok(
        reason.trim().length > 20,
        `${label}: an exemption needs a stated reason, not a bare entry. ` +
          'Absent, never disabled — and never unexplained.',
      );
    }
  });

  it('a bench cannot be both required to resume and exempt from it', () => {
    for (const host of RESUME_HOSTS) {
      assert.ok(
        !(host.label in RESUME_EXEMPT),
        `${host.label} is in RESUME_HOSTS and RESUME_EXEMPT. One answer per bench.`,
      );
    }
  });
});
