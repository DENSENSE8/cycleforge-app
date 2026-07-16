/**
 * Unit tests for buildSectionTabs — visibility gating for SectionTabsSlider.
 *
 *   npx tsx --test src/components/station/workbench/build-section-tabs.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSectionTabs } from './build-section-tabs';

function Icon() {
  return null as unknown as JSX.Element;
}

test('buildSectionTabs: omits visible:false and keeps the rest', () => {
  const tabs = buildSectionTabs([
    { id: 'a', label: 'A', icon: Icon, content: 'A' },
    { id: 'b', label: 'B', icon: Icon, content: 'B', visible: false },
    { id: 'c', label: 'C', icon: Icon, content: 'C', visible: true, count: 3 },
  ]);
  assert.deepEqual(
    tabs.map((t) => ({ id: t.id, count: t.count })),
    [
      { id: 'a', count: undefined },
      { id: 'c', count: 3 },
    ],
  );
});
