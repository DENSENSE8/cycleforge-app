/**
 * Unit tests for desk order inspector topic map.
 *
 * Run: `node --test --import tsx src/lib/shipping/order-inspector-topics.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  orderInspectorActiveSection,
  orderInspectorDisplayTopics,
  orderInspectorMoreItems,
  orderInspectorOrderChildren,
  orderInspectorOrderUpdateActions,
  resolveOrderInspectorDisplayTopic,
  resolveOrderInspectorTopicState,
} from './order-inspector-topics';

describe('orderInspectorDisplayTopics', () => {
  test('locked four topics when Documents gated on', () => {
    const display = orderInspectorDisplayTopics({ showDocumentsTab: true });
    assert.deepEqual(
      display.map((t) => t.key),
      ['order', 'documents', 'timeline', 'conversation'],
    );
    assert.ok(!display.some((t) => String(t.key) === 'assign'));
  });

  test('omits Documents when gated off', () => {
    const display = orderInspectorDisplayTopics({ showDocumentsTab: false });
    assert.deepEqual(
      display.map((t) => t.key),
      ['order', 'timeline', 'conversation'],
    );
  });
});

describe('orderInspectorOrderChildren', () => {
  test('Shipping · Product nested under Order', () => {
    assert.deepEqual(
      orderInspectorOrderChildren().map((c) => c.id),
      ['shipping', 'product'],
    );
  });
});

describe('resolveOrderInspectorTopicState / orderInspectorActiveSection', () => {
  test('legacy shipping/product map to Order parent', () => {
    assert.deepEqual(resolveOrderInspectorTopicState('shipping'), {
      topic: 'order',
      orderChild: 'shipping',
    });
    assert.deepEqual(resolveOrderInspectorTopicState('product'), {
      topic: 'order',
      orderChild: 'product',
    });
  });

  test('leaf sections round-trip through topic + child', () => {
    for (const section of ['shipping', 'product', 'documents', 'timeline', 'conversation'] as const) {
      const { topic, orderChild } = resolveOrderInspectorTopicState(section);
      assert.equal(orderInspectorActiveSection(topic, orderChild), section);
    }
  });
});

describe('resolveOrderInspectorDisplayTopic', () => {
  test('documents falls back to order when hidden', () => {
    assert.equal(
      resolveOrderInspectorDisplayTopic('documents', { showDocumentsTab: false }),
      'order',
    );
    assert.equal(
      resolveOrderInspectorDisplayTopic('documents', { showDocumentsTab: true }),
      'documents',
    );
  });
});

describe('orderInspectorOrderUpdateActions', () => {
  test('Assign + dispatch edits live on Order bottom bar', () => {
    const items = orderInspectorOrderUpdateActions({
      showDispatchExtras: true,
      showAssign: true,
      isUrgent: false,
      isShipped: false,
    });
    assert.deepEqual(
      items.map((i) => i.key),
      ['assign', 'urgent', 'notes', 'out_of_stock', 'status'],
    );
  });

  test('a shipped order offers no urgent toggle', () => {
    const items = orderInspectorOrderUpdateActions({
      showDispatchExtras: true,
      showAssign: true,
      isUrgent: true,
      isShipped: true,
    });
    assert.ok(!items.some((i) => i.key === 'urgent'));
  });

  test('observe-only lanes get no update CTAs', () => {
    const items = orderInspectorOrderUpdateActions({
      showDispatchExtras: false,
      showAssign: false,
      isUrgent: false,
      isShipped: false,
    });
    assert.deepEqual(items, []);
  });
});

describe('orderInspectorMoreItems', () => {
  test('More is handoffs only — updates are not duplicated', () => {
    const items = orderInspectorMoreItems({
      handoffs: ['assign', 'open_testing'],
    });
    assert.deepEqual(
      items.map((i) => i.key),
      ['open_testing'],
    );
    assert.ok(!items.some((i) => i.key === 'urgent' || i.key === 'assign'));
  });
});
