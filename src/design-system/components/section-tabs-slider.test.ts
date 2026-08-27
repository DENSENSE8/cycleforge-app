/**
 * Unit tests for SectionTabsSlider partition helper.
 *
 *   npx tsx --test src/design-system/components/section-tabs-slider.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionSectionTabs, type SectionTab } from './SectionTabsSlider';

function Icon() {
  return null as unknown as JSX.Element;
}

function tab(partial: Pick<SectionTab, 'id' | 'priority'> & { label?: string }): SectionTab {
  return {
    id: partial.id,
    label: partial.label ?? partial.id,
    icon: Icon,
    content: null,
    ...(partial.priority != null ? { priority: partial.priority } : {}),
  };
}

test('partitionSectionTabs: defaults unset priority to primary', () => {
  const { primary, overflow } = partitionSectionTabs([
    tab({ id: 'a' }),
    tab({ id: 'b', priority: 'overflow' }),
    tab({ id: 'c', priority: 'primary' }),
  ]);
  assert.deepEqual(
    primary.map((t) => t.id),
    ['a', 'c'],
  );
  assert.deepEqual(
    overflow.map((t) => t.id),
    ['b'],
  );
});

test('partitionSectionTabs: promotes first overflow when primary empty', () => {
  const { primary, overflow } = partitionSectionTabs([
    tab({ id: 'x', priority: 'overflow' }),
    tab({ id: 'y', priority: 'overflow' }),
  ]);
  assert.deepEqual(
    primary.map((t) => t.id),
    ['x'],
  );
  assert.deepEqual(
    overflow.map((t) => t.id),
    ['y'],
  );
});
