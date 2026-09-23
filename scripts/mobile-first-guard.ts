/**
 * CLI face of the MOBILE-FIRST GATE: **a lane the phone cannot run gets no door**
 * (operator 2026-09-14 — *"if it is not mobile friendly, then it should not even
 * display anywhere within the front end"*).
 *
 * It reports the porting LEDGER (`LANE_MOBILE_FIRST` in `src/lib/nav/lanes.ts`)
 * and re-checks the two facts that make it real:
 *
 *   1. no `'hidden'` lane yields a nav row from `getSidebarNavItems()` — the one
 *      funnel the spine, ⌘K, `nav-destinations`, the header switcher and recents
 *      all read;
 *   2. no `'hidden'` lane paints a `DESK_SPINE_SECTIONS` header.
 *
 * Same rule module as `src/lib/nav/nav-mobile-first.test.ts` (verify's Unit
 * tests) and as the `ds_mobile_first` MCP tool, which spawns this script exactly
 * as `ds_boundary` spawns `boundary-guard.ts`.
 *
 * Exit 0 = the gate holds. Exit 1 = a hidden lane still has a door. Exit 2 = the
 * guard itself broke, which is never a verdict.
 */

import { LANE_MOBILE_FIRST, isLaneVisible } from '../src/lib/nav/lanes';
import {
  DESK_SPINE_SECTIONS,
  getSidebarNavItems,
  spineSectionIdForPage,
} from '../src/lib/sidebar-navigation';
import { evaluateOutboundWorkflowContract } from '../src/lib/mobile/mobile-first-surface';

const asJson = process.argv.includes('--json');

try {
  const ledger = Object.entries(LANE_MOBILE_FIRST).map(([lane, status]) => ({ lane, status }));

  const leaks = getSidebarNavItems()
    .map((item) => ({ item: item.id, lane: spineSectionIdForPage(item) }))
    .filter((row) => row.lane !== null && !isLaneVisible(row.lane))
    .map((row) => `nav row "${row.item}" still reaches hidden lane "${row.lane}"`);

  const headerLeaks = DESK_SPINE_SECTIONS.filter((s) => !isLaneVisible(s.id)).map(
    (s) => `hidden lane "${s.id}" still paints a spine header`,
  );

  const outboundWorkflow = evaluateOutboundWorkflowContract();
  const violations = [...leaks, ...headerLeaks, ...outboundWorkflow.violations];
  const painted = DESK_SPINE_SECTIONS.map((s) => s.label);

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: violations.length === 0,
          paintedLaneHeaders: painted,
          ledger,
          outboundWorkflow,
          violations,
          law: 'A lane the phone cannot run gets no door. Outbound uses one workflow contract: mobile owns completion paths; desktop and stations are projections, not separate status machines.',
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(
      `mobile-first-guard: lanes painted → ${painted.join(' · ')}\n` +
        `outbound workflow contract: v${outboundWorkflow.version} · ${outboundWorkflow.stages.length} stages\n` +
        `${ledger.map((r) => `  ${r.status.padEnd(9)} ${r.lane}`).join('\n')}\n` +
        (violations.length === 0
          ? 'no hidden lane has a door.\n'
          : `${violations.length} violation(s):\n${violations.map((v) => `  ${v}`).join('\n')}\n`),
    );
  }

  process.exit(violations.length === 0 ? 0 : 1);
} catch (error) {
  process.stderr.write(`mobile-first-guard failed: ${String(error)}\n`);
  process.exit(2);
}
