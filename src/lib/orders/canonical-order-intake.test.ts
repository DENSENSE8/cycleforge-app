import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalIntakeToCsvEdits,
  emptyCanonicalOrderIntake,
  intakePlatformState,
  projectCsvRowToCanonicalIntake,
  rankOrderIntakePlatforms,
  resolveIntakeAccountSource,
} from '@/lib/orders/canonical-order-intake';
import type { CsvOrderCanonicalKey } from '@/lib/orders/csv-order-import';

function csvRow(
  overrides: Partial<Record<CsvOrderCanonicalKey, string>>,
): Record<CsvOrderCanonicalKey, string> {
  return {
    order_number: '',
    item_title: '',
    sku: '',
    item_number: '',
    quantity: '',
    condition: '',
    customer_name: '',
    ship_by_date: '',
    tracking_number: '',
    platform: '',
    note: '',
    weight_oz: '',
    dim_l: '',
    dim_w: '',
    dim_h: '',
    assignee_tech: '',
    assignee_packer: '',
    ...overrides,
  };
}

describe('intakePlatformState', () => {
  it('acknowledges an Amazon 3-7-7 paste without a platform click', () => {
    assert.deepEqual(intakePlatformState('111-1234567-1234567'), {
      inferred: 'amazon',
      requiresChoice: false,
    });
  });

  it('acknowledges an eBay 2-5-5 paste', () => {
    assert.deepEqual(intakePlatformState('03-15100-78272'), {
      inferred: 'ebay',
      requiresChoice: false,
    });
  });

  it('normalizes unicode dashes before inferring (email / PDF paste)', () => {
    // U+2013 EN DASH between groups — the SoT normalizer handles it.
    assert.equal(intakePlatformState('111–1234567–1234567').inferred, 'amazon');
  });

  it('requires a platform choice for an unknown-shaped id', () => {
    assert.deepEqual(intakePlatformState('CFLOOP-abc'), {
      inferred: null,
      requiresChoice: true,
    });
  });

  it('requires nothing while the field is still blank', () => {
    assert.deepEqual(intakePlatformState(''), { inferred: null, requiresChoice: false });
    assert.deepEqual(intakePlatformState(null), { inferred: null, requiresChoice: false });
  });
});

describe('resolveIntakeAccountSource', () => {
  it('the inferred slug wins — the number names the platform', () => {
    assert.equal(
      resolveIntakeAccountSource({ platformInferred: 'amazon', platformChosen: 'walmart' }),
      'amazon',
    );
  });

  it('falls back to the operator choice, then Manual', () => {
    assert.equal(
      resolveIntakeAccountSource({ platformInferred: null, platformChosen: 'ecwid' }),
      'ecwid',
    );
    assert.equal(
      resolveIntakeAccountSource({ platformInferred: null, platformChosen: '  ' }),
      'Manual',
    );
  });
});

describe('projectCsvRowToCanonicalIntake', () => {
  it('projects a full staged row onto the canonical type', () => {
    const intake = projectCsvRowToCanonicalIntake(
      csvRow({
        order_number: '111-1234567-1234567',
        item_title: 'Bose Wave IV',
        sku: 'BW4',
        item_number: 'B07JJYMMHZ',
        quantity: '2',
        condition: 'USED_B',
        tracking_number: '1Z999AA10123456784',
        weight_oz: '18',
        dim_l: '12',
        dim_w: '9',
        dim_h: '4',
      }),
    );
    assert.equal(intake.importOrigin, 'csv');
    assert.equal(intake.orderNumber, '111-1234567-1234567');
    assert.equal(intake.platformInferred, 'amazon');
    assert.equal(intake.productTitle, 'Bose Wave IV');
    assert.equal(intake.sku, 'BW4');
    assert.equal(intake.itemNumber, 'B07JJYMMHZ');
    assert.equal(intake.quantity, '2');
    assert.equal(intake.condition, 'USED_B');
    assert.deepEqual(intake.trackingNumbers, ['1Z999AA10123456784']);
    assert.equal(intake.weightOz, 18);
    assert.equal(intake.dimL, 12);
    assert.equal(intake.dimW, 9);
    assert.equal(intake.dimH, 4);
    assert.equal(intake.dimUnit, 'inch');
  });

  it('defaults quantity to 1 and leaves unparseable parcel numbers null', () => {
    const intake = projectCsvRowToCanonicalIntake(
      csvRow({ order_number: 'CFLOOP-x', platform: 'ecwid', weight_oz: 'heavy' }),
    );
    assert.equal(intake.quantity, '1');
    assert.equal(intake.platformInferred, null);
    assert.equal(intake.platformChosen, 'ecwid');
    assert.equal(intake.weightOz, null);
    assert.deepEqual(intake.trackingNumbers, []);
  });
});

describe('canonicalIntakeToCsvEdits', () => {
  it('writes canonical edits back onto the CSV vocabulary (round trip)', () => {
    const original = csvRow({
      order_number: '03-15100-78272',
      item_title: 'Sound bar',
      quantity: '3',
      weight_oz: '20',
    });
    const intake = projectCsvRowToCanonicalIntake(original);
    const edits = canonicalIntakeToCsvEdits(intake);
    assert.equal(edits.order_number, '03-15100-78272');
    assert.equal(edits.item_title, 'Sound bar');
    assert.equal(edits.quantity, '3');
    assert.equal(edits.weight_oz, '20');
    assert.equal(edits.dim_l, '');
  });
});

describe('rankOrderIntakePlatforms', () => {
  it('ranks the marketplace set first, then alphabetical', () => {
    const ranked = rankOrderIntakePlatforms([
      { value: 'zoho', label: 'Zoho' },
      { value: 'ebay', label: 'eBay' },
      { value: 'bestbuy', label: 'Best Buy' },
      { value: 'amazon', label: 'Amazon' },
    ]);
    assert.deepEqual(
      ranked.map((o) => o.value),
      ['amazon', 'ebay', 'bestbuy', 'zoho'],
    );
  });
});

describe('emptyCanonicalOrderIntake', () => {
  it('starts a manual draft with quantity 1, link mode and inch units', () => {
    const intake = emptyCanonicalOrderIntake();
    assert.equal(intake.importOrigin, 'manual');
    assert.equal(intake.quantity, '1');
    assert.equal(intake.labelMode, 'link');
    assert.equal(intake.dimUnit, 'inch');
    assert.equal(intake.docsNotRequired, false);
  });
});
