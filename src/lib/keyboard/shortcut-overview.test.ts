/**
 * Shortcut overview store — open/close + live group registry.
 *
 * Run: node --import tsx --test src/lib/keyboard/shortcut-overview.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  closeShortcutOverview,
  getServerShortcutOverviewGroups,
  getShortcutOverviewOpen,
  listShortcutOverviewGroups,
  openShortcutOverview,
  registerShortcutOverviewGroup,
  toggleShortcutOverview,
} from './shortcut-overview';

describe('shortcut-overview store', () => {
  it('toggle / open / close', () => {
    closeShortcutOverview();
    assert.equal(getShortcutOverviewOpen(), false);
    toggleShortcutOverview();
    assert.equal(getShortcutOverviewOpen(), true);
    openShortcutOverview();
    assert.equal(getShortcutOverviewOpen(), true);
    closeShortcutOverview();
    assert.equal(getShortcutOverviewOpen(), false);
  });

  it('getServerShortcutOverviewGroups is referentially stable', () => {
    assert.equal(
      getServerShortcutOverviewGroups(),
      getServerShortcutOverviewGroups(),
    );
  });

  it('registerShortcutOverviewGroup unregisters on dispose', () => {
    const off = registerShortcutOverviewGroup({
      id: 'test-selection',
      title: 'Selection',
      rows: [{ keys: ['A'], label: 'Assign' }],
    });
    assert.equal(listShortcutOverviewGroups().some((g) => g.id === 'test-selection'), true);
    off();
    assert.equal(listShortcutOverviewGroups().some((g) => g.id === 'test-selection'), false);
  });
});
