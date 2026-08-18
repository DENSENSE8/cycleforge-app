/**
 * Scan-station centre = ops-flow triage only.
 *
 * Advisory banners, "needs attention" strips, ticket history, and dossier
 * summaries must open as Displays leaves beside the middle — never mount in
 * the centre work column.
 *
 * SoT: source-of-truth.md → Scan-station centre lines display
 *      display/station-workbench.md → Hard Never (centre advisory)
 *
 * Run: `npx tsx --test src/components/station/workbench/station-centre-ops-flow.guard.test.ts`
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

/** Focused station panels that host the locked centre work column. */
const STATION_CENTRE_PANELS = [
  'src/components/receiving/workspace/LineEditPanel.tsx',
  'src/components/receiving/triage/TriagePanel.tsx',
  'src/components/tech/TestingPanel.tsx',
  'src/components/packer/PackOrderPanel.tsx',
] as const;

describe('Station centre ops-flow only', () => {
  it('forbids centre Needs-attention / advisory band mounts', () => {
    for (const rel of STATION_CENTRE_PANELS) {
      const src = read(rel);
      assert.doesNotMatch(
        src,
        /NeedsAttentionBand|NeedsAttentionStrip|testing-needs-attention/,
        `${rel}: no centre needs-attention band`,
      );
      assert.doesNotMatch(
        src,
        /Needs attention/,
        `${rel}: no centre "Needs attention" copy (ticket detail → Displays)`,
      );
    }
  });

  it('Testing auto-opens Ticket Displays for contextual detail (not a centre banner)', () => {
    const panel = read('src/components/tech/TestingPanel.tsx');
    assert.match(panel, /resolveTestingTicketContextOpen/);
    assert.match(
      panel,
      /setActiveSideTab\(ctx\.open \? 'ticket' : 'listing'\)/,
      'Ticket auto-open when contextual; else Listing Displays (never a centre banner)',
    );
    assert.match(panel, /TicketDisplayHost|buildTestingDisplayTabs/);
    assert.doesNotMatch(panel, /TestingNeedsAttentionBand/);
    assert.doesNotMatch(panel, /testing-needs-attention/);
  });

  it('Testing Ticket leaf hosts claim/history; centre keeps PO ops-flow', () => {
    const panel = read('src/components/tech/TestingPanel.tsx');
    const displays = read('src/components/tech/testing-panel/build-testing-displays.tsx');
    assert.match(displays, /TicketDisplayHost/);
    assert.match(panel, /TestingPoUnboxingSection/);
    assert.match(panel, /UnboxLabelPreview/);
    assert.match(panel, /StationTerminalDock/);
    assert.match(panel, /StationDisplaysPushStack/);
  });

  it('SoT docs ban centre advisory; detail opens Displays', () => {
    const sot = read('.claude/rules/source-of-truth.md');
    const workbench = read('.claude/rules/display/station-workbench.md');
    assert.match(sot, /ops-flow only/i);
    assert.match(sot, /Never centre advisory/);
    assert.match(workbench, /centre advisory|ops-flow only/i);
    assert.match(
      sot,
      /station-centre-ops-flow\.guard\.test\.ts/,
      'SoT must point at the centre ops-flow guard',
    );
  });
});
