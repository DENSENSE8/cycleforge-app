/**
 * Arrival (Receiving triage) Displays-push SoT — pinned as CODE.
 *
 * `pattern-evolution.md` Always #6: a rules file cannot fail, so the law lands
 * with a guard, not only prose.
 *
 * The law (see `.claude/rules/display/station-workbench.md` → Package Pairing is
 * a DISPLAY, and `.claude/rules/source-of-truth.md` → Scan-station centre lines
 * display): a scan station's reference tools — Pairing/Linkage · Classify ·
 * Staging · Ticket · Photos — live on the right-edge **Displays push**
 * (`ReceivingDisplaysPushStack` / `UnboxPushColumn`), never as a centre
 * `SectionTabsSlider` strip and never as a `RightRailHost` occupant. The
 * station's CENTRE is its work surface: identity + PO / unfound lines + dock.
 * Unbox (`LineEditPanel`) is the golden; Arrival composes the same grammar.
 *
 * Landed 2026-08-05 (scan-station Displays SoT, Phase C): `TriagePanel`'s centre
 * Classify / Staging / Pairing `SectionTabsSlider` was removed; the centre now
 * mounts the carton's lines (`POUnboxingSection` → `LinePoItemsSection`) and the
 * reference tools moved to a right-edge Displays push
 * (`build-triage-displays.tsx`). The `# ----` PO chip opens the Linkage display
 * and hands the PO avenue over as DATA (`setPairingFocus`), like Unbox — so the
 * golden `unbox-right-edge-chrome.guard.test.ts` block A carve-out ("Triage
 * keeps its in-place event") was retired in the same change.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Read the file as CODE, not prose. Every claim below is about what the panel
 * does; `TriagePanel`'s docblock still describes the old center-tab anatomy, so
 * a naive scan of the raw text would pass or fail on the comments instead of the
 * component. (Same helper the golden right-edge guard uses.)
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const TRIAGE_PANEL = 'src/components/receiving/triage/TriagePanel.tsx';

describe('Arrival Displays push — scan-station Displays SoT', () => {
  const panel = read(TRIAGE_PANEL);

  it('the CENTRE carries no station SectionTabsSlider chrome', () => {
    // The screenshot fix: no Classify | Staging | Pairing pill strip in the
    // middle. Those are reference tools; the centre is the carton's work.
    assert.ok(
      !panel.includes('TriageSectionTabs'),
      'the center Classify/Staging/Pairing SectionTabsSlider must leave TriagePanel — reference tools live on the Displays push',
    );
    assert.ok(
      !panel.includes('buildTriageTabs'),
      'the center-tab builder must not be mounted as station chrome (it dies / becomes a Displays body factory in Phase C)',
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
      'the ask: unfound / matched PO lines stay in the middle (POUnboxingSection → LinePoItemsSection routes both) — not Package Pairing, not a tab strip',
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
 * Testing (Tier-A twin) — Phase E landed: Package Pairing is a Displays push
 * body, not a centre `pairingOpen` toggle. Keep the same bans as Arrival.
 */
describe('Phase E — Testing Displays push', () => {
  const testing = read('src/components/tech/TestingPanel.tsx');

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

  it('the carton cursor is ↑ NEXT / ↓ PREVIOUS (queue reads newest-at-top)', () => {
    assert.match(panel, /ScanStationCartonCursor/);
    assert.match(panel, /nextTestId="arrival-carton-next"/);
    assert.match(panel, /prevTestId="arrival-carton-prev"/);
    assert.match(panel, /onNext=\{onNextCarton\}/);
    assert.match(panel, /onPrev=\{onPrevCarton\}/);
    // Shared SoT: ↑ (ChevronUp) advances to the NEXT carton; ↓ goes back.
    const cursor = read('src/components/station/workbench/ScanStationCartonCursor.tsx');
    assert.match(cursor, /ChevronUp/);
    assert.match(cursor, /ariaLabel="Next carton"/);
    assert.match(cursor, /ChevronDown/);
    assert.match(cursor, /ariaLabel="Previous carton"/);
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
      'centre must not reintroduce space-y-4 between lines and the unfound strip',
    );
  });
});

describe('Arrival UnfoundTodoStrip — flush sheet-band (no rounded card island)', () => {
  const strip = read('src/components/receiving/triage/UnfoundTodoStrip.tsx');

  it('is a flush hairline band, not a rounded-xl dashed card', () => {
    assert.match(strip, /rounded-none/);
    assert.doesNotMatch(
      strip,
      /rounded-(?:xl|2xl|lg|md)\b/,
      'soft radius reintroduces a floating island under the flat PO floor',
    );
    assert.doesNotMatch(strip, /border-dashed/);
  });
});
