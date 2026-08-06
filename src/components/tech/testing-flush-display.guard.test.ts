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
    assert.match(
      panel,
      /trailingAction=\{[\s\S]*?<StationTerminalDock[\s\S]*?embedded/,
      'Pass · Print rides as dock trailing action beside the note',
    );
    assert.doesNotMatch(
      panel,
      /SupportTicketComposerDock/,
      'ticket reply must not hijack the carton-notes dock — Unbox grain',
    );
  });

  it('Ticket Displays keep the reply composer inline (not host-owned dock)', () => {
    const displays = read('src/components/tech/testing-panel/build-testing-displays.tsx');
    assert.match(displays, /hostComposer=\{false\}/);
    assert.match(displays, /mergeFloorTimeline=\{false\}/);
    assert.doesNotMatch(displays, /hostComposer=\{claimTicketId/);
  });

  it('host knobs match Unbox — flow identity + bodyGap none', () => {
    assert.match(panel, /placement=["']flow["']/);
    assert.match(panel, /reserveIdentityClearance=\{false\}/);
    assert.match(panel, /bodyGap=["']none["']/);
  });

  it('reference tools live on ReceivingDisplaysPushStack', () => {
    assert.match(panel, /ReceivingDisplaysPushStack/);
    assert.match(panel, /UnboxDisplaysEdgeToggle variant=["']pane-open["']/);
    assert.match(panel, /buildTestingDisplayTabs/);
    assert.doesNotMatch(
      panel,
      /StationMoreDetails|StationHeaderToolbar/,
      'Refresh · Pair corner toolbar is retired — Pairing is a Displays tab',
    );
    const displays = read('src/components/tech/testing-panel/build-testing-displays.tsx');
    assert.match(displays, /id:\s*['"]ticket['"]/);
    assert.match(displays, /id:\s*['"]pairing['"]/);
    assert.match(displays, /id:\s*['"]checklist['"]/);
    assert.match(displays, /id:\s*['"]manuals['"]/);
    assert.match(displays, /id:\s*['"]timeline['"]/);
    assert.match(displays, /id:\s*['"]linkage['"]/);
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
});
