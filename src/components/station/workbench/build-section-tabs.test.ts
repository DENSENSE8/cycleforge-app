/**
 * Unit tests for buildSectionTabs — visibility gating + priority for SectionTabsSlider.
 *
 *   npx tsx --test src/components/station/workbench/build-section-tabs.test.ts
 *   npx tsx --test src/design-system/components/section-tabs-slider.test.ts
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

test('buildSectionTabs: passes priority through', () => {
  const tabs = buildSectionTabs([
    { id: 'checklist', label: 'Checklist', icon: Icon, content: 'C' },
    {
      id: 'support',
      label: 'Support',
      icon: Icon,
      content: 'S',
      priority: 'overflow',
    },
  ]);
  assert.deepEqual(
    tabs.map((t) => ({ id: t.id, priority: t.priority })),
    [
      { id: 'checklist', priority: undefined },
      { id: 'support', priority: 'overflow' },
    ],
  );
});
