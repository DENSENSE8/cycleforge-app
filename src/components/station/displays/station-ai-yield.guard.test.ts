/**
 * Every StationDisplaysPushStack host must yield Displays when AI opens.
 *
 * Desk uses RIGHT_RAIL_PRIORITY; stations use
 * useYieldStationDisplaysOnAssistantOpen (or Unbox's URL clear twin).
 *
 *   node --import tsx --test src/components/station/displays/station-ai-yield.guard.test.ts
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

const read = (rel: string) =>
  stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

/** Same census as station-displays-reachability (panels that mount PushStack). */
const STATIONS = [
  'src/components/receiving/workspace/LineEditPanel.tsx',
  'src/components/receiving/triage/TriagePanel.tsx',
  'src/components/tech/TestingPanel.tsx',
  'src/components/packer/PackOrderPanel.tsx',
  'src/components/tech/ActiveOrderWorkspace.tsx',
  'src/features/review/packer/PackerReviewMode.tsx',
  'src/components/support/orders/SupportOrdersFocusHost.tsx',
] as const;

describe('Station Displays AI yield', () => {
  it('shared hook exists', () => {
    const src = read(
      'src/components/station/displays/useYieldStationDisplaysOnAssistantOpen.ts',
    );
    assert.match(src, /useYieldStationDisplaysOnAssistantOpen/);
    assert.match(src, /ASSISTANT_DOCK_OPEN_EVENT/);
    assert.match(src, /useAssistantDockOpen/);
  });

  for (const file of STATIONS) {
    it(`${file} yields Displays on assistant open`, () => {
      const src = read(file);
      const wired =
        /useYieldStationDisplaysOnAssistantOpen/.test(src) ||
        /yieldUnboxStationPushesOnAssistantOpen/.test(src);
      assert.ok(
        wired,
        `${file} must call useYieldStationDisplaysOnAssistantOpen ` +
          '(or Unbox yieldUnboxStationPushesOnAssistantOpen)',
      );
    });
  }
});
