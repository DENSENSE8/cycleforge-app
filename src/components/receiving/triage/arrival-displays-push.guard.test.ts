/**
 * Arrival (Receiving triage) Displays-push SoT — pinned as CODE.
 *
 * `pattern-evolution.md` Always #6: a rules file cannot fail, so the law lands
 * with a guard, not only prose.
 *
 * Arrival carve-out (2026-08-06): the CENTRE is the door flow — identity +
 * Unbox-parity PO / unfound items (`POUnboxingSection`) + Classify + Staging
 * stacked under items + dock. Pairing/Linkage is the right-edge **Displays**
 * push (`ReceivingDisplaysPushStack` / `UnboxPushColumn`), never a centre
 * `SectionTabsSlider` strip and never a `RightRailHost` occupant. Unbox
 * (`LineEditPanel`) remains the golden for the host; Classify stays on Unbox
 * Displays. See `.claude/rules/source-of-truth.md` → Scan-station centre lines
 * display.
 *
 * The `# ----` PO chip opens the Linkage display and hands the PO avenue over
 * as DATA (`setPairingFocus`), like Unbox.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Read the file as CODE, not prose. Every claim below is about what the panel
 * does; a naive scan of the raw text would pass or fail on the comments instead
 * of the component. (Same helper the golden right-edge guard uses.)
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const TRIAGE_PANEL = 'src/components/receiving/triage/TriagePanel.tsx';
const TRIAGE_DISPLAYS = 'src/components/receiving/triage/build-triage-displays.tsx';

describe('Arrival Displays push — scan-station Displays SoT', () => {
  const panel = read(TRIAGE_PANEL);
  const displays = read(TRIAGE_DISPLAYS);

  it('the CENTRE carries no station SectionTabsSlider chrome', () => {
    // No Classify | Staging | Pairing pill strip in the middle — Classify ·
    // Staging are stacked sections under items; Pairing is Displays.
    assert.ok(
      !panel.includes('TriageSectionTabs'),
      'the center Classify/Staging/Pairing SectionTabsSlider must leave TriagePanel',
    );
    assert.ok(
      !panel.includes('buildTriageTabs'),
      'the center-tab builder must not be mounted as station chrome',
    );
  });

  it('the panel holds no second open-state flag beside the selected display', () => {
    for (const dead of ['pairingOpen', 'togglePairing', 'PairingTogglePill']) {
      assert.ok(
        !panel.includes(dead),
        `${dead} is deleted — a boolean toggle beside \`activeSideTab === 'linkage'\` re-creates the drift the Displays move removes (mirrors Unbox)`,
      );
    }
  });

  it('Arrival mounts a Displays push column (right edge, not RightRailHost)', () => {
    assert.match(
      panel,
      /DisplaysPushStack/,
      'Arrival must mount the shared Displays push stack (ReceivingDisplaysPushStack / the Phase B host), never a RightRailHost `detail:*` occupant',
    );
  });

  it('the CENTRE mounts the PO / unfound line surface', () => {
    assert.match(
      panel,
      /POUnboxingSection|LinePoItemsSection|UnmatchedItemsSection/,
      'unfound / matched PO lines stay in the middle (POUnboxingSection → LinePoItemsSection routes both)',
    );
  });

  it('the CENTRE stacks Classify then Staging under items (door flow)', () => {
    assert.match(panel, /TriageClassifySection/);
    assert.match(panel, /StagingSection/);
    const classifyAt = panel.indexOf('TriageClassifySection');
    const stagingAt = panel.indexOf('StagingSection');
    assert.ok(classifyAt > 0 && stagingAt > classifyAt, 'Classify must mount above Staging in the centre');
  });

  it('Arrival Displays strip is Pairing-only (no Classify · Staging tabs)', () => {
    assert.match(displays, /id:\s*['"]linkage['"]/);
    assert.doesNotMatch(
      displays,
      /id:\s*['"]classify['"]/,
      'Classify left the Displays strip — it stacks under items in TriagePanel',
    );
    assert.doesNotMatch(
      displays,
      /id:\s*['"]staging['"]/,
      'Staging left the Displays strip — it stacks under Classify in TriagePanel',
    );
    assert.doesNotMatch(displays, /TriageClassifySection/);
    assert.doesNotMatch(displays, /StagingSection/);
  });

  it('items use Unbox-parity editLines + serialScan (interactive unfound surface)', () => {
    assert.match(panel, /\beditLines\b/);
    assert.match(panel, /\bserialScan\b/);
    assert.doesNotMatch(
      panel,
      /editLines=\{false\}/,
      'Arrival must not keep a read-only items floor — unfound needs UnmatchedAccordionSurface parity with Unbox',
    );
    assert.doesNotMatch(
      panel,
      /serialScan=\{false\}/,
      'Arrival must not hide ReturnScanCard / active-row editors on unfound',
    );
    assert.doesNotMatch(
      panel,
      /UnfoundTodoStrip/,
      'amber UnfoundTodoStrip is retired — the interactive unfound surface is the teaching UI',
    );
  });

  it('the PO chip opens the Displays LINKAGE, not a centre toggle + timed event', () => {
    assert.match(
      panel,
      /openDisplays\(\s*['"]linkage['"]/,
      'the PO chip must open the linkage display (openDisplays(\'linkage\', …)) — or its arrival alias — never a center pairingOpen toggle',
    );
    assert.ok(
      !panel.includes('dispatchReceivingOpenPairingPo'),
      'a timed dispatch cannot outrun a navigation — hand the PO avenue over as DATA (setPairingFocus), as Unbox does; do not reintroduce the rAF event',
    );
  });
});

/**
 * Testing (Tier-A twin) — Phase E complete: centre = testing work; reference
 * tools on Displays push. Same chrome as Arrival / Unbox (flow identity,
 * Open displays, no centre SectionTabsSlider).
 */
describe('Phase E — Testing Displays push', () => {
  const testing = read('src/components/tech/TestingPanel.tsx');
  const header = read('src/components/tech/testing-panel/TestingCartonHeader.tsx');

  it('Testing mounts a Displays push column (no centre pairingOpen)', () => {
    assert.match(
      testing,
      /DisplaysPushStack/,
      'Testing must mount ReceivingDisplaysPushStack for Linkage / reference tools',
    );
    for (const dead of ['pairingOpen', 'togglePairing', 'PairingTogglePill']) {
      assert.ok(
        !testing.includes(dead),
        `${dead} must stay deleted — Displays push selected-ness is the open state`,
      );
    }
  });

  it('centre has no SectionTabsSlider — reference tools live on Displays', () => {
    assert.doesNotMatch(
      testing,
      /SectionTabsSlider/,
      'centre SectionTabsSlider must stay deleted — Ticket · Pairing · Checklist · Manuals · Timeline · Linkage are Displays',
    );
    assert.match(
      testing,
      /buildTestingDisplayTabs/,
      'Displays bodies come from buildTestingDisplayTabs',
    );
  });

  it('carton identity is in-flow (zero air above testing work)', () => {
    assert.match(testing, /placement=["']flow["']/);
    assert.match(testing, /reserveIdentityClearance=\{false\}/);
    assert.doesNotMatch(
      testing,
      /reserveIdentityClearance=["']stacked["']/,
      'stacked pt clearance leaves a guessed gap under the absolute identity',
    );
    assert.match(testing, /bodyGap=["']none["']/);
  });

  it('utility rail carries Open displays while Displays is closed', () => {
    assert.match(testing, /utilityRail=\{utilityRailBody\}/);
    assert.match(
      testing,
      /UnboxDisplaysEdgeToggle variant="pane-open"/,
      'the `←|` expand toggle mounts while Displays is closed',
    );
    assert.doesNotMatch(
      testing,
      /StationMoreDetails|StationHeaderToolbar/,
      'Refresh · Pair corner toolbar is retired — Pairing is a Displays tab',
    );
  });

  it('TestingCartonHeader passes carrierHint for carrier-tinted tracking', () => {
    assert.match(
      header,
      /carrierHint=\{row\.carrier\}/,
      'tracking chip must pass carrierHint (Unbox SoT — no bare MapPin)',
    );
  });
});

/**
 * Arrival pane chrome (2026-08-05; ScanStationUtilityRail 2026-08-06) — the
 * scan-station utility rail and the dock notes, pinned so they cannot silently
 * regress. Mirrors the Unbox golden: utility rail carries Displays "expand" +
 * carton cursor; the internal item note lives in the dock float; there is no
 * "Open in unbox" affordance.
 */
describe('Arrival pane controls — expand · cursor · dock note', () => {
  const panel = read(TRIAGE_PANEL);

  it('ScanStationUtilityRail carries the Displays expand toggle (only while closed)', () => {
    assert.match(panel, /StationScanPaneHost/, 'Arrival composes StationScanPaneHost');
    assert.match(
      panel,
      /utilityRail=\{utilityRailBody\}/,
      'utility mounts on ScanStationUtilityRail when Displays closed',
    );
    assert.match(
      panel,
      /headerTrailing=\{displaysCartonCursor\}/,
      'carton ↑↓ mounts top-right on the details panel when Displays is open',
    );
    assert.doesNotMatch(
      panel,
      /trailingUtility=\{/,
      'must not live inside CartonContextCard / carton identity',
    );
    assert.match(
      panel,
      /!activeSideTab \?[\s\S]{0,160}UnboxDisplaysEdgeToggle variant="pane-open"/,
      'the `←|` expand toggle mounts only while the Displays column is closed (the `→|` close lives on the open column)',
    );
  });

  it('the carton cursor is ↑ PREV / ↓ NEXT (same as left sidebar)', () => {
    assert.match(panel, /ScanStationCartonCursor/);
    assert.match(panel, /prevTestId="arrival-carton-prev"/);
    assert.match(panel, /nextTestId="arrival-carton-next"/);
    assert.match(panel, /onPrev=\{onPrevCarton\}/);
    assert.match(panel, /onNext=\{onNextCarton\}/);
    const cursor = read('src/components/station/workbench/ScanStationCartonCursor.tsx');
    assert.match(cursor, /ChevronUp[\s\S]{0,200}onClick=\{onPrev\}/);
    assert.match(cursor, /ariaLabel="Previous carton"/);
    assert.match(cursor, /ChevronDown[\s\S]{0,200}onClick=\{onNext\}/);
    assert.match(cursor, /ariaLabel="Next carton"/);
  });

  it('the item note is pinned to the bottom dock float (internal — carries to Unbox)', () => {
    assert.match(panel, /slicedActionDockWrapperClass\(\{ docked: false \}\)/, 'the dock is the floating shell');
    assert.match(panel, /WorkspaceNotesCard/, 'the internal item-note composer lives in the dock');
    assert.match(
      panel,
      /trailingAction=\{<StationTerminalDock embedded/,
      'Save-for-unbox rides as the dock trailing action, beside the note',
    );
  });

  it('there is no "Open in unbox" affordance on Arrival', () => {
    assert.ok(!panel.includes('StationRightEdgeAction'), 'the mid-canvas Open-in-unbox jump is removed');
    assert.ok(!panel.includes('openInUnboxHref'), 'no Open-in-unbox navigation on this pane');
    assert.match(
      panel,
      /openInUnbox=\{false\}/,
      'the centre line surface must not offer Open-in-unbox — the operator saves for unbox from the dock',
    );
  });
});

/**
 * Arrival flat centre (2026-08-06) — same in-flow identity + zero-gap floor as
 * Unbox (`LineEditPanel` / `po-line-flat-chrome.guard.test.ts`). Absolute
 * overlay + stacked clearance left the identity overlapping the PO lines.
 */
describe('Arrival flat centre — Unbox flow identity parity', () => {
  const panel = read(TRIAGE_PANEL);

  it('carton identity is in-flow (zero air above PO lines)', () => {
    assert.match(panel, /placement=["']flow["']/);
    assert.match(panel, /reserveIdentityClearance=\{false\}/);
    assert.doesNotMatch(
      panel,
      /reserveIdentityClearance=["']stacked["']/,
      'stacked pt clearance leaves a guessed gap under the absolute identity',
    );
  });

  it('StationWorkbench uses bodyGap=none on the flat floor', () => {
    assert.match(panel, /bodyGap=["']none["']/);
  });

  it('centre overview has zero vertical sibling gap', () => {
    assert.match(panel, /space-y-0/);
    assert.doesNotMatch(
      panel,
      /space-y-4/,
      'centre must not reintroduce space-y-4 between items · Classify · Staging',
    );
  });

  it('suppresses the PO items eyebrow — identity abuts lines', () => {
    assert.match(
      panel,
      /suppressItemsHeader/,
      'Arrival must not show "PO ITEMS · N" (esp. empty unfound · 0) — Unbox overview SoT',
    );
  });
});
