/**
 * Cycle-counts catalog guards + resolver behaviour — wave D's most mechanical
 * desk, and the one where the whole port is catalog + resolver + adapter.
 *
 * The guards that matter here are the two the retired `AdminTable` could not
 * express: that the layout parses against the catalog (a binding to a fact the
 * family cannot read would dash silently on the floor), and that the mounted
 * skeleton is still the SHARED one (a hand-listed track order forked and went
 * stale twice already, so the order comes from `COMPOUND_COLUMN_KEYS`).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import type { CycleCountCampaignRow } from '@/lib/inventory/cycle-count-campaign-row';
import { cycleCountsCompoundColumnsFor } from '@/components/inventory/cycle-counts/cycle-counts-grid-layout';
import { parseSlotLayout } from '../slot-layout';
import {
  CYCLECOUNTS_FIELD_CATALOG,
  CYCLECOUNTS_PRODUCT_LAYOUT,
  CYCLECOUNTS_TABLE_LAYOUT_ID,
} from './cycle-counts';
import { resolveCycleCountsSlotValue } from './cycle-counts-resolve';

function campaign(overrides: Partial<CycleCountCampaignRow> = {}): CycleCountCampaignRow {
  return {
    id: 41,
    name: 'May 2026 month-end',
    status: 'open',
    varianceTol: '0.050',
    totalLines: 312,
    countedLines: 180,
    pendingReviewLines: 7,
    approvedLines: 166,
    createdAt: '2026-09-08T17:04:00.000Z',
    createdByName: 'Dana Ruiz',
    ...overrides,
  };
}

describe('cycle-counts catalog', () => {
  it('has unique ids, all cycle-counts-family, each bindable somewhere', () => {
    const ids = CYCLECOUNTS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of CYCLECOUNTS_FIELD_CATALOG) {
      assert.equal(field.family, 'cycle-counts', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('cycle-counts.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog — four counts, no money', () => {
    const parsed = parseSlotLayout(CYCLECOUNTS_PRODUCT_LAYOUT, CYCLECOUNTS_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'cycle-counts.id');
    // FOUR, not five: the skeleton mounts whole, so a fifth status track would
    // exceed MAX_DEFAULT_VISIBLE_TRACKS. `created_by` ships unbound.
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      [
        'cycle-counts.lines',
        'cycle-counts.counted',
        'cycle-counts.review',
        'cycle-counts.approved',
      ],
    );
    // The retired `campaign` cell's second line — a subtitle, never a track.
    assert.deepEqual(
      parsed.subtitleBindings.map((b) => b.fieldId),
      ['cycle-counts.tol'],
    );
    assert.equal(parsed.amountFieldId, null);
  });

  it('the identity fact is the campaign, and it reads as an id face', () => {
    const identity = CYCLECOUNTS_FIELD_CATALOG.find(
      (f) => f.id === CYCLECOUNTS_PRODUCT_LAYOUT.identityFieldId,
    );
    assert.ok(identity);
    assert.equal(identity.label, 'Campaign');
    assert.equal(identity.displayType, 'id');
    assert.ok(identity.slotKinds.includes('identity'));
  });

  it('names no fact the chrome already paints as a duplicate TRACK', () => {
    const bound = new Set([
      ...CYCLECOUNTS_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...CYCLECOUNTS_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    // name = the item cell's first line; status = the state pill; created =
    // the Dates Hash line. All three stay catalog facts (so the header sorts
    // and the search box matches) but must not open a second column.
    for (const chrome of ['cycle-counts.name', 'cycle-counts.status', 'cycle-counts.created']) {
      assert.ok(
        CYCLECOUNTS_FIELD_CATALOG.some((f) => f.id === chrome),
        `${chrome} must stay a bindable fact`,
      );
      assert.ok(!bound.has(chrome), `${chrome} must not be bound in the product default`);
    }
  });

  it('serves the `cycle-counts` tableId', () => {
    assert.equal(CYCLECOUNTS_TABLE_LAYOUT_ID, 'cycle-counts');
  });
});

describe('the mounted cycle-counts compound model', () => {
  it('is the shared skeleton WHOLE, status band after state', () => {
    const keys = cycleCountsCompoundColumnsFor(CYCLECOUNTS_PRODUCT_LAYOUT).map((c) => c.key);
    // `COMPOUND_COLUMN_KEYS` is the SoT for the surrounding order — hand-listing
    // the skeleton forked and went stale twice already. No geometry cut:
    // COMPOUND_SKELETON_FILTER_DEBT is shrink-only.
    assert.deepEqual(
      keys.filter((k) => !k.startsWith('status:')),
      [...COMPOUND_COLUMN_KEYS],
    );
    const stateAt = keys.indexOf('state');
    assert.deepEqual(keys.slice(stateAt, stateAt + 2), ['state', 'status:1']);
  });

  it('binds the four count columns the flat array painted, in order', () => {
    const bound = cycleCountsCompoundColumnsFor(CYCLECOUNTS_PRODUCT_LAYOUT).filter((c) => c.fieldId);
    assert.deepEqual(
      bound.map((c) => [c.key, c.fieldId, c.slotDisplayType]),
      [
        // The identity slot IS the shared `fulfillment` chrome track.
        ['fulfillment', 'cycle-counts.id', 'id'],
        ['status:1', 'cycle-counts.lines', 'number'],
        ['status:2', 'cycle-counts.counted', 'number'],
        ['status:3', 'cycle-counts.review', 'number'],
        ['status:4', 'cycle-counts.approved', 'number'],
      ],
    );
  });
});

describe('resolveCycleCountsSlotValue', () => {
  it('resolves every catalog field off a campaign row', () => {
    const r = campaign();
    assert.deepEqual(resolveCycleCountsSlotValue(r, 'cycle-counts.id'), {
      kind: 'value',
      text: '41',
    });
    assert.deepEqual(resolveCycleCountsSlotValue(r, 'cycle-counts.name'), {
      kind: 'value',
      text: 'May 2026 month-end',
    });
    assert.deepEqual(resolveCycleCountsSlotValue(r, 'cycle-counts.status'), {
      kind: 'value',
      text: 'Open',
    });
    assert.deepEqual(resolveCycleCountsSlotValue(r, 'cycle-counts.lines'), {
      kind: 'value',
      text: '312',
    });
    assert.deepEqual(resolveCycleCountsSlotValue(r, 'cycle-counts.counted'), {
      kind: 'value',
      text: '180',
    });
    assert.deepEqual(resolveCycleCountsSlotValue(r, 'cycle-counts.review'), {
      kind: 'value',
      text: '7',
    });
    assert.deepEqual(resolveCycleCountsSlotValue(r, 'cycle-counts.approved'), {
      kind: 'value',
      text: '166',
    });
    assert.deepEqual(resolveCycleCountsSlotValue(r, 'cycle-counts.created'), {
      kind: 'value',
      text: '2026-09-08T17:04:00.000Z',
    });
    assert.deepEqual(resolveCycleCountsSlotValue(r, 'cycle-counts.created_by'), {
      kind: 'value',
      text: 'Dana Ruiz',
    });
  });

  it('paints the tolerance as the desk always did, storage precision trimmed', () => {
    assert.deepEqual(resolveCycleCountsSlotValue(campaign(), 'cycle-counts.tol'), {
      kind: 'value',
      text: 'tol 0.05',
    });
  });

  it('a zero count resolves the digit, never a blank cell', () => {
    const empty = campaign({ totalLines: 0, countedLines: 0, pendingReviewLines: 0 });
    assert.deepEqual(resolveCycleCountsSlotValue(empty, 'cycle-counts.lines'), {
      kind: 'value',
      text: '0',
    });
    assert.deepEqual(resolveCycleCountsSlotValue(empty, 'cycle-counts.review'), {
      kind: 'value',
      text: '0',
    });
  });

  it('an unattributed campaign still reads `system`, the desks long-standing face', () => {
    assert.deepEqual(resolveCycleCountsSlotValue(campaign({ createdByName: null }), 'cycle-counts.created_by'), {
      kind: 'value',
      text: 'system',
    });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveCycleCountsSlotValue(campaign(), 'cycle-counts.ghost'), null);
    // A sibling family's id is just as unknown — catalogs do not bleed.
    assert.equal(resolveCycleCountsSlotValue(campaign(), 'kiosk-devices.status'), null);
  });
});
