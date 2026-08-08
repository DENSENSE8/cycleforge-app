/**
 * Testing rail Tier A hydrate — must mirror ReceivingFeedRail's
 * useHydrateVisibleSerials wire so click opens with warm siblings chips.
 *
 * Run: `npx tsx --test src/components/sidebar/receiving/testing-rail-hydrate.guard.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(DIR, name), 'utf8');

describe('Testing serial hydrate parity', () => {
  it('TestingRecentRail wires useHydrateVisibleSerials', () => {
    const rail = read('TestingRecentRail.tsx');
    assert.match(rail, /useHydrateVisibleSerials/, 'Testing rail must pre-seed siblings serials');
  });

  it('TestingSidebarPanel seeds siblings on open', () => {
    const panel = readFileSync(join(DIR, '../TestingSidebarPanel.tsx'), 'utf8');
    assert.match(panel, /seedTestingOpenLine/, 'scan/picker open must seed siblings');
    assert.match(panel, /seedReceivingSiblingsCache/, 'seed helper must use the SoT writer');
  });
});
