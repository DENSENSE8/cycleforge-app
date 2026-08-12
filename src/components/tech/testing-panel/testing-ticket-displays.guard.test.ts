/**
 * QC Ticket = Displays leaf; centre stays ops-flow triage; no Arrival
 * Classify/Staging; no ReceivingClaimModal over the focused TestingPanel middle.
 *
 * Run: `npx tsx --test src/components/tech/testing-panel/testing-ticket-displays.guard.test.ts`
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

describe('Testing Ticket Displays + centre triage', () => {
  const panel = read('src/components/tech/TestingPanel.tsx');
  const displays = read('src/components/tech/testing-panel/build-testing-displays.tsx');
  const modals = read('src/components/tech/testing-panel/TestingPanelModals.tsx');
  const controller = read('src/components/tech/hooks/useTestingLineController.ts');

  it('claim / fail opens Displays ticket via onOpenClaim (not modal stack)', () => {
    assert.match(panel, /onOpenClaim/);
    assert.match(panel, /useTestingLineController\(row, staffId, \{ onOpenClaim \}\)/);
    assert.match(controller, /if \(onOpenClaim\)/);
    assert.match(controller, /onOpenClaim\(mode\)/);
    assert.match(
      panel,
      /setActiveSideTab\(ctx\.open \? 'ticket' : 'listing'\)/,
      'line open → Ticket when claim context; else Listing for QC reference',
    );
    assert.doesNotMatch(
      panel,
      /openClaimModal\('create'\)/,
      'focused panel must not call openClaimModal — Displays hosts claim',
    );
  });

  it('Ticket leaf is TicketDisplayHost; modals omit ReceivingClaimModal', () => {
    assert.match(displays, /TicketDisplayHost/);
    assert.doesNotMatch(modals, /ReceivingClaimModal/);
    assert.doesNotMatch(panel, /ReceivingClaimModal/);
  });

  it('QC reply presets opt out on Unbox Ticket Displays only', () => {
    const unbox = read(
      'src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx',
    );
    assert.match(
      unbox,
      /showReplyPresets=\{false\}/,
      'Unbox Ticket Displays hide All-good / QC pass·fail presets',
    );
    assert.doesNotMatch(
      displays,
      /showReplyPresets=\{false\}/,
      'Testing Ticket Displays keep QC reply presets',
    );
    const arrival = read(
      'src/components/receiving/triage/build-triage-displays.tsx',
    );
    assert.doesNotMatch(
      arrival,
      /showReplyPresets=\{false\}/,
      'Arrival Ticket Displays keep QC reply presets',
    );
  });

  it('centre keeps PO lines + Pass · Print dock; no needs-attention band', () => {
    assert.match(panel, /TestingPoUnboxingSection/);
    assert.doesNotMatch(panel, /TestingNeedsAttentionBand/);
    assert.doesNotMatch(panel, /Needs attention/);
    assert.match(panel, /StationTerminalDock/);
    assert.match(panel, /WorkspaceNotesCard/);
    assert.match(panel, /StationDisplaysPushStack/);
    assert.match(panel, /StationScanPaneHost/);
  });

  it('line open resolves ticket context into Displays', () => {
    assert.match(panel, /resolveTestingTicketContextOpen/);
  });

  it('tech tree does not import Arrival Classify / Staging', () => {
    const techFiles = [
      'src/components/tech/TestingPanel.tsx',
      'src/components/tech/testing-panel/build-testing-displays.tsx',
      'src/components/tech/testing-panel/TestingPoUnboxingSection.tsx',
      'src/components/tech/testing-panel/testing-ticket-context.ts',
    ];
    for (const rel of techFiles) {
      const src = read(rel);
      assert.doesNotMatch(src, /TriageClassifySection/);
      assert.doesNotMatch(src, /StagingSection/);
      assert.doesNotMatch(src, /from ['"]@\/components\/receiving\/triage\//);
    }
  });
});
