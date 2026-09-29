import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENSURE_OVERDUE_ORDER_SUBSCRIPTIONS_SQL,
  OVERDUE_UNFULFILLED_ORDERS_SQL,
} from './overdue-order-alerts';

test('overdue alert query uses canonical order-grain packed and scan-out facts', () => {
  assert.match(OVERDUE_UNFULFILLED_ORDERS_SQL, /activity_type IN \('PACK_COMPLETED', 'PACK_SCAN'\)/);
  assert.match(OVERDUE_UNFULFILLED_ORDERS_SQL, /activity_type = 'SHIP_CONFIRM'/);
  assert.match(OVERDUE_UNFULFILLED_ORDERS_SQL, /deadline_at < NOW\(\)/);
  assert.match(OVERDUE_UNFULFILLED_ORDERS_SQL, /DISTINCT ON \(organization_id, order_number\)/);
  assert.match(OVERDUE_UNFULFILLED_ORDERS_SQL, /FROM ops_events prior_alert/);
});

test('overdue alert cohort is auto-followed without duplicating subscriptions', () => {
  assert.match(ENSURE_OVERDUE_ORDER_SUBSCRIPTIONS_SQL, /COALESCE\(s\.active, true\) = true/);
  assert.match(ENSURE_OVERDUE_ORDER_SUBSCRIPTIONS_SQL, /NOT EXISTS/);
  assert.match(ENSURE_OVERDUE_ORDER_SUBSCRIPTIONS_SQL, /ANY\(existing\.match_event_keys\)/);
});
