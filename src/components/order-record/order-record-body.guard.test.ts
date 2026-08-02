/**
 * Order-record surfaces must compose compact order-record sections — never
 * re-import the slide-over details-panel chrome that caused field duplication
 * (Order ID ×3, urgent ×3, nested "Order Details", full Warranty hero, etc.).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const BODY = 'src/components/order-record/OrderRecordBody.tsx';
const FULL_PAGE = 'src/components/shipped/OrderFullPageView.tsx';

const FORBIDDEN_IN_BODY = [
  'ProductDetailsSection',
  'ShippingInformationSection',
  'OrderWarrantySection',
  'CustomerDetailsTab',
] as const;

describe('order-record concise surface', () => {
  it('OrderRecordBody does not import slide-over details-panel sections', () => {
    const source = readFileSync(path.join(ROOT, BODY), 'utf8');
    for (const name of FORBIDDEN_IN_BODY) {
      assert.doesNotMatch(
        source,
        new RegExp(name),
        `${BODY} must not import ${name} — use compact order-record sections`,
      );
    }
    assert.match(source, /OrderItemFacts/, `${BODY} must compose OrderItemFacts`);
    assert.match(source, /OrderFulfillmentFacts/, `${BODY} must compose OrderFulfillmentFacts`);
    assert.match(source, /OrderWarrantySummary/, `${BODY} must compose OrderWarrantySummary`);
    assert.match(source, /OrderCustomerFacts/, `${BODY} must compose OrderCustomerFacts`);
    assert.match(source, /OrderCollapsibleSection/, `${BODY} must collapse secondary history`);
    assert.doesNotMatch(
      source,
      /title=["']Order["']/,
      `${BODY} must not render a rail Order identity card (header owns order #)`,
    );
  });

  it('OrderFullPageView mounts the merged RecordPaneHeader with no tab strip', () => {
    const source = readFileSync(path.join(ROOT, FULL_PAGE), 'utf8');
    assert.match(source, /RecordPaneHeader/, `${FULL_PAGE} must use RecordPaneHeader`);
    // The two order headers merged (handoff §4); the old names must not return.
    assert.doesNotMatch(
      source,
      /OrderIdentityHeader|ShippedDetailsHeader/,
      `${FULL_PAGE} must not mount a forked order header`,
    );
    // The full page scrolls ONE record body — the eight-tab strip is slide-over
    // chrome and re-growing it here would put two navigations on one record.
    assert.doesNotMatch(
      source,
      /\btabs=\{/,
      `${FULL_PAGE} must not pass a tab strip to RecordPaneHeader`,
    );
  });
});
