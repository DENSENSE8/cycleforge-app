/**
 * Arrival (Receiving triage) Displays-push SoT — pinned as CODE.
 *
 * `pattern-evolution.md` Always #6: a rules file cannot fail, so the law lands
 * with a guard, not only prose.
 *
 * Arrival port (2026-08-09): the CENTRE is one white door-flow plane
 * (`DISPLAYS_FLUSH_HOST` + chrome) — identity + PO / unfound items **without
 * units chrome** + Classify. Staging is the flush dock Band 1 ACTION
 * (`ArrivalStagingDockControl` via `UnboxDockHost`); Save-for-unbox rides the
 * dogfood strip. Pairing/Linkage is the right-edge **Displays** push
 * (`StationDisplaysPushStack` / `StationDisplaysPushColumn`), never a centre
 * `SectionTabsSlider` strip and never a `RightRailHost` occupant. Unbox
 * (`LineEditPanel`) remains the golden for the host. See
 * `.claude/rules/source-of-truth.md` → Scan-station centre lines display ·
 * `display/station-port-from-unbox.md`.
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
    // No Classify | Staging | Pairing pill strip in the middle — Classify
    // stacks under items; Staging is the flush dock; Pairing is Displays.
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
    assert.doesNotMatch(
      panel,
      /StationActionDossierShell/,
      'Action densify lives in station/displays leaf hosts — Arrival panel must not fork it',
    );
  });

  it('the CENTRE mounts the PO / unfound line surface', () => {
    assert.match(
      panel,
      /POUnboxingSection|LinePoItemsSection|UnmatchedItemsSection/,
      'unfound / matched PO lines stay in the middle (POUnboxingSection → LinePoItemsSection routes both)',
    );
  });

  it('the CENTRE stacks Classify under items; Staging is the flush dock ACTION', () => {
    assert.match(panel, /TriageClassifySection/);
    assert.doesNotMatch(
      panel,
      /StagingSection/,
      'centre StagingSection is retired — ArrivalStagingDockControl owns shelf · lane',
    );
    assert.match(panel, /ArrivalStagingDockControl/);
    assert.match(panel, /UnboxDockHost/);
    assert.match(panel, /data-arrival-dogfood-terminal|data-arrival-dock-float/);
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
      'Staging left the Displays strip — it lives in the flush dock Band 1',
    );
    assert.doesNotMatch(displays, /TriageClassifySection/);
    assert.doesNotMatch(displays, /StagingSection|ArrivalStagingDockControl/);
  });

  it('items keep editLines but hide units chrome (no condition · serial / Units)', () => {
    assert.match(panel, /\beditLines\b/);
    assert.doesNotMatch(
      panel,
      /editLines=\{false\}/,
      'Arrival keeps interactive unfound lines — unit capture is what stays off',
    );
    assert.match(
      panel,
      /serialScan=\{false\}/,
      'Arrival must not mount the SERIAL editor / ReturnScanCard — units stay Unbox',
    );
    assert.match(
      panel,
      /unitsChrome=\{false\}/,
      'Arrival meta collapses to qty | SKU | price (no condition · serial columns)',
    );
    assert.doesNotMatch(
      panel,
      /UnfoundTodoStrip/,
      'amber UnfoundTodoStrip is retired — the interactive unfound surface is the teaching UI',
    );
  });

  it('door flow sits on one white DISPLAYS_FLUSH_HOST + chrome plane', () => {
    assert.match(panel, /DISPLAYS_FLUSH_HOST/);
    assert.match(panel, /appSurfaceFillClass\(\s*['"]chrome['"]\s*\)/);
    assert.match(panel, /data-testid="arrival-door-flow"/);
  });

  it('Classify · Staging dock hosts are edge-to-edge (no DISPLAYS_BODY_INSET pad)', () => {
    const classify = read('src/components/receiving/triage/TriageClassifySection.tsx');
    const stagingDock = read('src/components/receiving/triage/ArrivalStagingDockControl.tsx');
    assert.doesNotMatch(
      classify,
      /DISPLAYS_BODY_INSET/,
      'Classify host must be px-0 — dimension rows own inset-cozy so hairlines span the column',
    );
    assert.doesNotMatch(
      stagingDock,
      /DISPLAYS_BODY_INSET/,
      'Staging dock ACTION must be px-0 — content rows own inset-cozy',
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
      /UnboxDisplaysUtilityRailBody/,
      'the `←|` expand toggle mounts in the bottom footer while Displays is closed',
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
 * Arrival pane chrome (2026-08-09 Unbox flush dock port) — utility rail +
 * UnboxDockHost dogfood Save-for-unbox. Omnichannel notes float retired;
 * notes live on Unbox. No "Open in unbox" affordance.
 */
describe('Arrival pane controls — expand · cursor · flush dock', () => {
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
      /!activeSideTab \?[\s\S]{0,200}UnboxDisplaysUtilityRailBody/,
      'the `←|` expand toggle mounts only while the Displays column is closed (the `→|` close lives on the open column footer)',
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

  it('the dock is Unbox flush geometry — Save-for-unbox dogfood, no Omnichannel notes', () => {
    assert.match(panel, /data-arrival-dock-float/, 'Unbox-shaped absolute flush float');
    assert.match(panel, /UnboxDockHost/, 'flush two-band floor host');
    assert.match(panel, /ArrivalStagingDockControl/, 'shelf · lane is Band 1 ACTION');
    assert.match(
      panel,
      /data-arrival-dogfood-terminal[\s\S]{0,800}embeddedTerminal|StationTerminalDock/,
      'Save-for-unbox rides the dogfood strip (Print·Receive twin)',
    );
    assert.doesNotMatch(
      panel,
      /WorkspaceNotesCard|OmnichannelComposerDock|slicedActionDockWrapperClass/,
      'raised Omnichannel notes float is deleted — notes live on Unbox',
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
      'centre must not reintroduce space-y-4 between items · Classify',
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

/**
 * Arrival Displays carton Macro floor (icons-first port, 2026-08-09) — the
 * station half of the icons-first action-floor work. Mirrors Unbox's
 * `UnboxDisplaysActionFloor` (share the METHOD, fork the HOST — C2 / Scan vs
 * desk right-edge), minus the Print peer (no printable label at the door pass).
 */
describe('Arrival Displays carton Macro floor', () => {
  const panel = read(TRIAGE_PANEL);
  const floor = read('src/components/receiving/triage/ArrivalDisplaysActionFloor.tsx');

  it('TriagePanel passes ArrivalDisplaysActionFloor as the Displays actionFloor', () => {
    assert.match(
      panel,
      /actionFloor=\{[\s\S]{0,400}ArrivalDisplaysActionFloor/,
      'the Macro floor mounts via the PushStack actionFloor slot (above the close chrome)',
    );
    assert.match(panel, /onDeleted=\{closeDisplays\}/);
    assert.match(panel, /editSelected=\{activeSideTab === ['"]linkage['"]\}/);
    assert.match(panel, /onInventorySync=\{\(\) => c\.refreshInventoryDossier\(\)\}/);
    assert.match(panel, /inventorySyncing=\{Boolean\(c\.inventoryRefreshing\)\}/);
  });

  it('composes the STATION shell + shared waist (not the desk InspectorActionFloor)', () => {
    assert.match(floor, /StationDisplaysActionFloor/);
    assert.match(floor, /InspectorFlushDelete/);
    assert.match(floor, /stationDisplaysFloorMoreItems/);
    assert.match(floor, /size="fill"/);
    assert.match(floor, /FLUSH_TERMINAL_SPREAD_PEER_CLASS/);
    assert.match(floor, /FLUSH_TERMINAL_SPREAD_GLYPH_CLASS/);
  });

  it('C2 — never imports the desk shell / peers', () => {
    assert.doesNotMatch(floor, /InspectorActionFloor/);
    assert.doesNotMatch(floor, /FloorIconButton/);
    assert.doesNotMatch(floor, /FloorOverflowButton/);
  });

  it('Arrival omits Print (door pass — no printable label yet)', () => {
    assert.doesNotMatch(floor, /\bPrinter\b/);
    assert.doesNotMatch(
      floor,
      /data-testid="arrival-displays-floor-primary"/,
      'no Print peer at Arrival — the floor is ⋯ · Sync · Edit · Delete (4 peers)',
    );
  });

  it('verb order is More → Sync → Edit → far-right Delete', () => {
    assert.match(floor, /MoreHorizontal/);
    assert.match(floor, /RefreshCw/);
    assert.match(floor, /Pencil/);
    const morePos = floor.indexOf('arrival-displays-floor-more');
    const syncPos = floor.indexOf('arrival-displays-floor-inventory-sync');
    const editPos = floor.indexOf('arrival-displays-floor-edit');
    const deletePos = floor.indexOf('arrival-displays-floor-delete');
    assert.ok(
      morePos > 0 && syncPos > morePos && editPos > syncPos && deletePos > editPos,
      'peer columns left→right: More · Sync · Edit · Delete',
    );
  });

  it('no floating island / touch peers (hit target is the fill column)', () => {
    assert.doesNotMatch(floor, /size="touch"/);
    assert.doesNotMatch(floor, /\bw-11\b/);
  });
});
