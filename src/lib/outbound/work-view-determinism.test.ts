import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTBOUND_SAVED_VIEWS, outboundWorkPageSchema } from './work-contract';
import { listOutboundWork } from './work-projection';

/**
 * V1.2 checkpoint: "an API test proves each saved view's deterministic
 * membership." Determinism here means three observable properties, checked
 * against the live database for both tenants that have outbound work:
 *
 * 1. **Self-consistency** — every record a view returns carries that view's
 *    id in its own `views` array (the page filter and the row membership are
 *    one SQL expression, and this proves they cannot disagree).
 * 2. **Purity** — the same view, queried twice, returns the same first page;
 *    membership does not depend on when or how often it is read.
 * 3. **Disjointness where the rules demand it** — `ready` and `completed`
 *    are mutually exclusive by definition (a unit cannot be both unpicked
 *    and scanned out), so no record may carry both.
 *
 * Skips loudly without DATABASE_URL so the mocked suite still runs in CI.
 */
const ORGS = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'];
const hasDatabase = Boolean(process.env.DATABASE_URL);

test('every saved view returns only records that claim it, identically on re-read', { skip: !hasDatabase && 'no DATABASE_URL' }, async () => {
  for (const organizationId of ORGS) {
    for (const view of OUTBOUND_SAVED_VIEWS) {
      const first = await listOutboundWork(organizationId, { view: view.id, limit: 12 });
      const second = await listOutboundWork(organizationId, { view: view.id, limit: 12 });
      outboundWorkPageSchema.parse(first);
      assert.equal(first.view, view.id, 'the page must echo the applied view');
      for (const item of first.items) {
        assert.ok(item.views.includes(view.id),
          `org ${organizationId.slice(-1)} view ${view.id}: record ${item.id} returned without membership`);
      }
      assert.deepEqual(
        second.items.map((item) => item.id),
        first.items.map((item) => item.id),
        `org ${organizationId.slice(-1)} view ${view.id}: membership changed between identical reads`,
      );
    }
  }
});

test('ready and completed are mutually exclusive for every record either returns', { skip: !hasDatabase && 'no DATABASE_URL' }, async () => {
  for (const organizationId of ORGS) {
    const ready = await listOutboundWork(organizationId, { view: 'ready', limit: 50 });
    const completed = await listOutboundWork(organizationId, { view: 'completed', limit: 50 });
    const readyIds = new Set(ready.items.map((item) => item.id));
    const overlap = completed.items.filter((item) => readyIds.has(item.id));
    assert.deepEqual(overlap, [], `a record is both ready and completed in org ${organizationId.slice(-1)}`);
  }
});
