/**
 * Unit tests for History inspector topic → action map.
 *
 * Run: `node --test --import tsx src/lib/receiving/history-inspector-topics.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  historyInspectorMoreItems,
  historyInspectorPrimaryAction,
  historyInspectorTopicActions,
} from './history-inspector-topics';

describe('historyInspectorTopicActions', () => {
  test('Display topics are always present in §2 order with short tab labels', () => {
    const { display } = historyInspectorTopicActions({ unfound: false });
    assert.deepEqual(
      display.map((t) => t.key),
      ['summary', 'logistics', 'photos', 'audit'],
    );
    assert.deepEqual(
      display.map((t) => t.tabLabel),
      ['Details', 'Logistics', 'Evidence', 'History'],
    );
    assert.equal(display[0]?.label, 'Order / PO summary');
    assert.equal(display[1]?.label, 'Logistics & channel');
    assert.equal(display[2]?.label, 'Photo evidence');
    assert.equal(display[3]?.label, 'Audit / timeline');
  });

  test('matched carton: no link topic; print may accent when idle', () => {
    const { edit } = historyInspectorTopicActions({
      unfound: false,
      readinessCta: 'none',
    });
    assert.deepEqual(
      edit.map((t) => t.key),
      ['print', 'unbox', 'flag', 'more'],
    );
    assert.equal(edit.find((t) => t.key === 'print')?.accent, true);
    assert.equal(edit.find((t) => t.key === 'unbox')?.accent, undefined);
    assert.equal(edit.find((t) => t.key === 'print')?.disabled, false);
  });

  test('matched continue_unbox accents unbox, not print', () => {
    const { edit } = historyInspectorTopicActions({
      unfound: false,
      readinessCta: 'continue_unbox',
    });
    assert.equal(edit.find((t) => t.key === 'unbox')?.accent, true);
    assert.equal(edit.find((t) => t.key === 'print')?.accent, undefined);
  });

  test('matched match_po accents unbox', () => {
    const { edit } = historyInspectorTopicActions({
      unfound: false,
      readinessCta: 'match_po',
    });
    assert.equal(edit.find((t) => t.key === 'unbox')?.accent, true);
  });

  test('unfound: link present + accent; print soft-disabled', () => {
    const { edit } = historyInspectorTopicActions({ unfound: true });
    assert.deepEqual(
      edit.map((t) => t.key),
      ['print', 'unbox', 'link', 'flag', 'more'],
    );
    assert.equal(edit.find((t) => t.key === 'link')?.accent, true);
    assert.equal(edit.find((t) => t.key === 'link')?.label, 'Link / Resolve unmatched carton');
    assert.equal(edit.find((t) => t.key === 'print')?.disabled, true);
    assert.equal(edit.find((t) => t.key === 'print')?.accent, undefined);
  });

  test('View topics are always present in locked Band-3→rail order', () => {
    const { view } = historyInspectorTopicActions({ unfound: false });
    assert.deepEqual(
      view.map((t) => t.key),
      ['paint', 'drill', 'compare', 'zoom', 'columns'],
    );
    assert.equal(view.every((t) => t.group === 'view'), true);
  });

  test('viewOnly omits Display + Edit; keeps View', () => {
    const { display, edit, view } = historyInspectorTopicActions({
      unfound: false,
      viewOnly: true,
    });
    assert.deepEqual(display, []);
    assert.deepEqual(edit, []);
    assert.equal(view.length, 5);
  });
});

describe('historyInspectorPrimaryAction', () => {
  test('unfound → Resolve Unfound', () => {
    const primary = historyInspectorPrimaryAction({ unfound: true });
    assert.equal(primary.key, 'link');
    assert.equal(primary.label, 'Resolve Unfound');
    assert.equal(primary.shortcut, 'Enter');
  });

  test('continue_unbox → Open Unbox', () => {
    const primary = historyInspectorPrimaryAction({
      unfound: false,
      readinessCta: 'continue_unbox',
    });
    assert.equal(primary.key, 'unbox');
    assert.equal(primary.label, 'Open Unbox');
  });

  test('idle matched → Print', () => {
    const primary = historyInspectorPrimaryAction({
      unfound: false,
      readinessCta: 'none',
    });
    assert.equal(primary.key, 'print');
    assert.equal(primary.label, 'Print');
  });
});

describe('historyInspectorMoreItems', () => {
  test('caps overflow at ≤4 and omits the identity primary', () => {
    const idle = historyInspectorMoreItems({ unfound: false, readinessCta: 'none' });
    assert.ok(idle.length <= 4);
    assert.ok(!idle.some((i) => i.key === 'print'), 'Print is identity primary when idle');
    assert.ok(idle.some((i) => i.key === 'unbox'));
    assert.ok(idle.every((i) => i.shortcut), 'every More item ships a shortcut chip');

    const continueUnbox = historyInspectorMoreItems({
      unfound: false,
      readinessCta: 'continue_unbox',
    });
    assert.ok(continueUnbox.some((i) => i.key === 'print'));
    assert.ok(!continueUnbox.some((i) => i.key === 'unbox'));
  });

  test('unfound overflow omits print; keeps Open Unbox + flag + rares', () => {
    const items = historyInspectorMoreItems({ unfound: true });
    assert.ok(items.length <= 4);
    assert.ok(!items.some((i) => i.key === 'print'));
    assert.ok(items.some((i) => i.key === 'unbox'));
    assert.ok(items.some((i) => i.key === 'flag'));
    assert.ok(!items.some((l) => /audit/i.test(l.label)));
  });
});
