/**
 * Testing flush Unbox SoT — centre lines + UnboxLabelPreview + dock notes;
 * reference tools on Displays push. No WorkspaceCard glass islands, no centre
 * SectionTabsSlider strip.
 *
 * Run: `npx tsx --test src/components/tech/testing-flush-display.guard.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

describe('Testing flush Unbox display SoT', () => {
  const panel = read('src/components/tech/TestingPanel.tsx');
  const poSection = read('src/components/tech/testing-panel/TestingPoUnboxingSection.tsx');
  const controller = read('src/components/tech/hooks/useTestingLineController.ts');

  it('PO lines host is flush — no WorkspaceCard glass island', () => {
    assert.doesNotMatch(poSection, /WorkspaceCard/, 'TestingPoUnboxingSection must not wrap in WorkspaceCard');
    assert.match(poSection, /className="min-w-0"/, 'flush min-w-0 host like POUnboxingSection');
  });

  it('centre mounts UnboxLabelPreview under flush lines (no mid-canvas notes/label forks)', () => {
    assert.match(panel, /TestingPoUnboxingSection[\s\S]*UnboxLabelPreview/);
    assert.match(panel, /space-y-0/);
    assert.doesNotMatch(panel, /TestingWorkspaceNotesCard/);
    assert.doesNotMatch(panel, /TestingLabelPreviewCard/);
    assert.doesNotMatch(panel, /SectionTabsSlider/);
  });

  it('notes sit in the floating dock with Pass · Print trailing', () => {
    assert.match(panel, /slicedActionDockWrapperClass\(\{ docked: false \}\)/);
    assert.match(panel, /WorkspaceNotesCard/);
    assert.match(panel, /TestingDockHost/, 'QC dock host owns the CTA band');
    assert.match(
      panel,
      /TestingDockHost[\s\S]*?<StationTerminalDock[\s\S]*?embedded/,
      'Pass · Print rides as TestingDockHost trailing (carton terminal)',
    );
    assert.doesNotMatch(
      panel,
      /SupportTicketComposerDock/,
      'ticket reply must not hijack the carton-notes dock — Unbox grain',
    );
  });

  it('Ticket Displays use TicketDisplayHost (Unbox grain — no modal / no dock hijack)', () => {
    const displays = read('src/components/tech/testing-panel/build-testing-displays.tsx');
    assert.match(displays, /TicketDisplayHost/);
    assert.match(displays, /dynamic\(/);
    assert.doesNotMatch(
      displays,
      /import\s+\{\s*TicketDisplayHost\s*\}\s+from/,
      'TicketDisplayHost must stay dynamic (P3)',
    );
    assert.doesNotMatch(displays, /SupportContextHub/);
    assert.doesNotMatch(displays, /ReceivingClaimModal/);
  });

  it('host knobs match Unbox — flow identity + bodyGap none', () => {
    assert.match(panel, /placement=["']flow["']/);
    assert.match(panel, /reserveIdentityClearance=\{false\}/);
    assert.match(panel, /bodyGap=["']none["']/);
  });

  it('reference tools live on StationDisplaysPushStack', () => {
    assert.match(panel, /StationDisplaysPushStack/);
    assert.match(panel, /UnboxDisplaysUtilityRailBody/);
    assert.match(panel, /buildTestingDisplayTabs/);
    assert.doesNotMatch(
      panel,
      /StationMoreDetails|StationHeaderToolbar/,
      'Refresh · Pair corner toolbar is retired — Pairing is a Displays tab',
    );
    const displays = read('src/components/tech/testing-panel/build-testing-displays.tsx');
    assert.match(displays, /id:\s*['"]ticket['"]/);
    assert.match(displays, /id:\s*['"]units['"]/);
    assert.match(displays, /id:\s*['"]pairing['"]/);
    assert.match(displays, /id:\s*['"]checklist['"]/);
    assert.match(displays, /id:\s*['"]manuals['"]/);
    assert.match(displays, /id:\s*['"]timeline['"]/);
    assert.match(displays, /id:\s*['"]linkage['"]/);
  });

  it('per-unit verdict is a right-edge Units Action Display, not a centre activeRowSlot', () => {
    // docs/todo/testing-units-to-right-rail-display-HANDOFF.md — the per-unit
    // list (serial · condition · pass/test-again/fail) lives in the Units
    // Display; the centre stays PO lines + Pass · Print (ops-flow only).
    const displays = read('src/components/tech/testing-panel/build-testing-displays.tsx');
    const unitsDisplay = read('src/components/tech/testing-panel/TestingUnitsDisplay.tsx');
    const items = read('src/components/tech/testing-panel/TestingPoItemsSection.tsx');

    // Units tab hosts the verdict surface via the shared waist (TestingLineSlot
    // → ActiveLineTestingSerial → UnitSlotList) — not a second units renderer.
    assert.match(displays, /<TestingUnitsDisplay/);
    assert.match(unitsDisplay, /TestingLineSlot/);
    assert.match(unitsDisplay, /data-testid="testing-units-display"/);
    // Flush plane — fills the column, edge-to-edge, no glass island / body inset.
    assert.match(unitsDisplay, /flex h-full min-h-0 flex-col/);
    assert.match(unitsDisplay, /px-0/);
    assert.doesNotMatch(unitsDisplay, /DISPLAYS_BODY_INSET/);
    assert.doesNotMatch(unitsDisplay, /WorkspaceCard/);

    // Centre carries no verdict list — the serials cell opens the Display.
    assert.doesNotMatch(items, /activeRowSlot=\{testingActiveRowSlot\}/);
    assert.doesNotMatch(items, /const testingActiveRowSlot\b/);
    assert.match(items, /onViewAllUnits=\{onViewAllUnits\}/);
    // TestingPanel selects the line then opens the Units leaf.
    assert.match(panel, /openDisplays\('units'\)/);
    assert.match(panel, /onViewAllUnits=\{openUnits\}/);
  });

  it('controller exposes itemNote + Unbox-shaped label bag for UnboxLabelPreview', () => {
    assert.match(controller, /itemNote,\s*setItemNote/);
    assert.match(controller, /labelSelectOptions/);
    assert.match(controller, /activeLabelKind/);
    assert.match(controller, /TESTING_LABEL_KINDS/);
    assert.match(
      controller,
      /notes:\s*itemNote/,
      'live carton face center must be driven by the dock draft',
    );
  });

  it('UnboxLabelPreview gates As Listed editor on buildAsListedPayload (Testing omits it)', () => {
    const preview = read('src/components/receiving/workspace/line-edit/UnboxLabelPreview.tsx');
    assert.match(
      preview,
      /typeof c\.buildAsListedPayload === ['"]function['"]/,
      'AsListedEditPopover must not mount without a builder — Testing has no as_listed kind',
    );
    assert.doesNotMatch(
      controller,
      /buildAsListedPayload/,
      'Testing stays unit+carton only; do not silently fork As Listed onto QC',
    );
  });
});
