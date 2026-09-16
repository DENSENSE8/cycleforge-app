/**
 * Unit tests for Move-photos carton-target search (parse + label + Deps query).
 *
 * Run: `npx tsx --test src/lib/receiving/photo-move-targets.test.ts`
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  parsePhotoMoveSearch,
  photoMoveTargetLabel,
  resolvePhotoMoveTargetTitle,
  searchReceivingPhotoMoveTargets,
  type SearchPhotoMoveTargetsDeps,
} from './photo-move-targets';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

const SAMPLE_ROW = {
  receiving_id: 50807,
  po_id: '',
  po_number: '',
  catalog_product_title: null,
  zoho_item_title: null,
  item_name: 'Bose SoundTouch 20',
  sku: 'ST20',
  zoho_item_id: null,
  tracking_number: '9302211047900000195968',
  ticket_id: 232,
  ticket_external_id: '79824225',
  source: 'unmatched',
  photo_count: 11,
};

const OTHER_ROW = {
  receiving_id: 60001,
  po_id: 'PO-200',
  po_number: 'PO-200',
  catalog_product_title: 'Bose Wave Music System IV',
  zoho_item_title: null,
  item_name: 'Wave IV listing title',
  sku: 'WAVE-IV',
  zoho_item_id: null,
  tracking_number: '1Z999AA10123456784',
  ticket_id: null,
  ticket_external_id: null,
  source: 'ebay',
  photo_count: 2,
};

test('parsePhotoMoveSearch: carton QR handles', () => {
  assert.deepEqual(parsePhotoMoveSearch('#R-50807'), {
    needle: 'R-50807',
    receivingId: 50807,
    ticketId: null,
    pattern: null,
  });
  assert.deepEqual(parsePhotoMoveSearch('RCV-9'), {
    needle: 'RCV-9',
    receivingId: 9,
    ticketId: null,
    pattern: null,
  });
});

test('parsePhotoMoveSearch: #ticket is exact ticket only', () => {
  assert.deepEqual(parsePhotoMoveSearch('#232'), {
    needle: '#232',
    receivingId: null,
    ticketId: 232,
    pattern: null,
  });
});

test('parsePhotoMoveSearch: short bare digits are ticket + free-text', () => {
  assert.deepEqual(parsePhotoMoveSearch('9661'), {
    needle: '9661',
    receivingId: null,
    ticketId: 9661,
    pattern: '%9661%',
  });
});

test('parsePhotoMoveSearch: long tracking stays free-text (not a ticket id)', () => {
  assert.deepEqual(parsePhotoMoveSearch('9302211047900000195968'), {
    needle: '9302211047900000195968',
    receivingId: null,
    ticketId: null,
    pattern: '%9302211047900000195968%',
  });
});

test('parsePhotoMoveSearch: empty', () => {
  assert.deepEqual(parsePhotoMoveSearch('  '), {
    needle: '',
    receivingId: null,
    ticketId: null,
    pattern: null,
  });
});

test('resolvePhotoMoveTargetTitle: zoho → catalog → item_name → sku (SKU identity law)', () => {
  // The Zoho item name governs over a marketplace catalog title. Pinned to the
  // live defect: carton 52827 / PO 10-15153-01528 painted the Ecwid wall mount
  // here while the PO desk painted the Zoho soundbar.
  assert.equal(
    resolvePhotoMoveTargetTitle({
      catalog_product_title: '1x Original Bose UB-20 Wall Mount Part As Pictured UB-20B (BLACK)',
      zoho_item_title: 'Bose Solo Soundbar Series II',
      item_name: 'Bose Solo Soundbar 2 Home Theater, Certified Refurbished',
      sku: '00143',
    }),
    'Bose Solo Soundbar Series II',
  );
  assert.equal(
    resolvePhotoMoveTargetTitle({
      catalog_product_title: 'Catalog Bose',
      zoho_item_title: null,
      item_name: 'Listing Bose',
      sku: 'SKU1',
    }),
    'Catalog Bose',
  );
  assert.equal(
    resolvePhotoMoveTargetTitle({
      catalog_product_title: null,
      zoho_item_title: 'Zoho Bose',
      item_name: 'Listing Bose',
    }),
    'Zoho Bose',
  );
  assert.equal(
    resolvePhotoMoveTargetTitle({
      item_name: 'Bose SoundTouch 20',
    }),
    'Bose SoundTouch 20',
  );
  assert.equal(
    resolvePhotoMoveTargetTitle({ sku: 'WAVE-IV' }),
    'WAVE-IV',
  );
  assert.equal(
    resolvePhotoMoveTargetTitle({}),
    'Unfound PO',
  );
  // Stub sentinel is empty — fall through to real sku / final Unfound PO.
  assert.equal(
    resolvePhotoMoveTargetTitle({
      item_name: 'Unfound PO',
      sku: '00365-BK',
    }),
    '00365-BK',
  );
  assert.equal(
    resolvePhotoMoveTargetTitle({ item_name: 'Unfound PO' }),
    'Unfound PO',
  );
});

test('photoMoveTargetLabel prefers title, then PO, then ticket, then tracking, then R-id', () => {
  assert.equal(
    photoMoveTargetLabel({
      receiving_id: 1,
      title: 'Bose SoundTouch 20',
      po_number: 'PO-100',
      ticket_id: 232,
      tracking_number: '9302211047900000195968',
    }),
    'Bose SoundTouch 20',
  );
  assert.equal(
    photoMoveTargetLabel({
      receiving_id: 1,
      po_number: 'PO-100',
      ticket_id: 232,
      tracking_number: '9302211047900000195968',
    }),
    'PO-100',
  );
  assert.equal(
    photoMoveTargetLabel({
      receiving_id: 50807,
      ticket_id: 232,
      tracking_number: '9302211047900000195968',
    }),
    'Ticket #232',
  );
  assert.equal(
    photoMoveTargetLabel({
      receiving_id: 50807,
      tracking_number: '9302211047900000195968',
    }),
    '…00195968',
  );
  assert.equal(photoMoveTargetLabel({ receiving_id: 50807 }), 'R-50807');
});

test('searchReceivingPhotoMoveTargets: tracking SQL includes product title joins + ticket subject', async () => {
  let capturedSql = '';
  let capturedValues: unknown[] = [];
  const deps: SearchPhotoMoveTargetsDeps = {
    query: async (_org, sql, values) => {
      capturedSql = sql;
      capturedValues = values;
      return [SAMPLE_ROW];
    },
  };

  const result = await searchReceivingPhotoMoveTargets(
    { orgId: ORG, search: '9302211047900000195968', excludeReceivingId: 999 },
    deps,
  );

  assert.equal(result.matchedExcludedSelf, false);
  assert.equal(result.targets.length, 1);
  assert.equal(result.targets[0].receiving_id, 50807);
  assert.equal(result.targets[0].ticket_id, 232);
  assert.equal(result.targets[0].ticket_external_id, '79824225');
  assert.equal(result.targets[0].title, 'Bose SoundTouch 20');
  assert.equal(result.targets[0].source, 'unmatched');
  assert.match(capturedSql, /shipment_links/);
  assert.match(capturedSql, /ticket_links/);
  assert.match(capturedSql, /subject_cache/);
  assert.match(capturedSql, /sku_catalog/);
  assert.match(capturedSql, /catalog_product_title/);
  assert.match(capturedSql, /zoho_item_title/);
  assert.match(capturedSql, /ticket_external_id/);
  assert.doesNotMatch(capturedSql, /WHERE rz\.zoho_purchaseorder_id IS NOT NULL/);
  assert.ok(capturedValues.includes('%9302211047900000195968%'));
  assert.ok(capturedValues.includes(999));
});

test('searchReceivingPhotoMoveTargets: exact carton id', async () => {
  let capturedValues: unknown[] = [];
  const deps: SearchPhotoMoveTargetsDeps = {
    query: async (_org, _sql, values) => {
      capturedValues = values;
      return [
        {
          receiving_id: 50807,
          po_id: '',
          po_number: '',
          catalog_product_title: null,
          zoho_item_title: null,
          item_name: null,
          sku: null,
          zoho_item_id: null,
          tracking_number: null,
          ticket_id: null,
          ticket_external_id: null,
          source: 'unmatched',
          photo_count: 0,
        },
      ];
    },
  };

  const result = await searchReceivingPhotoMoveTargets(
    { orgId: ORG, search: 'R-50807' },
    deps,
  );
  assert.equal(result.matchedExcludedSelf, false);
  assert.equal(result.targets[0].receiving_id, 50807);
  assert.equal(result.targets[0].title, 'Unfound PO');
  assert.ok(capturedValues.includes(50807));
});

test('searchReceivingPhotoMoveTargets: #ticket uses exact ticket id (no ILIKE pattern)', async () => {
  let capturedSql = '';
  let capturedValues: unknown[] = [];
  const deps: SearchPhotoMoveTargetsDeps = {
    query: async (_org, sql, values) => {
      capturedSql = sql;
      capturedValues = values;
      return [SAMPLE_ROW];
    },
  };

  await searchReceivingPhotoMoveTargets({ orgId: ORG, search: '#232' }, deps);
  assert.ok(capturedValues.includes(232));
  assert.ok(!capturedValues.some((v) => typeof v === 'string' && v.includes('%')));
  assert.match(capturedSql, /st\.id = \$/);
});

test('searchReceivingPhotoMoveTargets: short digits bind ticket id + pattern', async () => {
  let capturedValues: unknown[] = [];
  const deps: SearchPhotoMoveTargetsDeps = {
    query: async (_org, _sql, values) => {
      capturedValues = values;
      return [];
    },
  };

  const result = await searchReceivingPhotoMoveTargets(
    { orgId: ORG, search: '9661' },
    deps,
  );
  assert.equal(result.matchedExcludedSelf, false);
  assert.equal(result.targets.length, 0);
  assert.ok(capturedValues.includes('%9661%'));
  assert.ok(capturedValues.includes(9661));
});

test('searchReceivingPhotoMoveTargets: empty search browses Unboxed rail (org + limit only)', async () => {
  let capturedSql = '';
  let capturedValues: unknown[] = [];
  const deps: SearchPhotoMoveTargetsDeps = {
    query: async (_org, sql, values) => {
      capturedSql = sql;
      capturedValues = values;
      return [];
    },
  };

  const result = await searchReceivingPhotoMoveTargets(
    { orgId: ORG, search: '', limit: 10 },
    deps,
  );
  assert.equal(result.matchedExcludedSelf, false);
  assert.equal(capturedValues[0], ORG);
  assert.equal(capturedValues[capturedValues.length - 1], 10);
  assert.doesNotMatch(capturedSql, /ILIKE/);
  // Same membership + first-open axis as view=unbox_opened (not updated_at flood).
  assert.match(capturedSql, /receiving_unbox/);
  assert.match(capturedSql, /UNBOX_SCAN_OPENED/);
  assert.match(capturedSql, /opened_at/);
  assert.match(capturedSql, /Unfound PO/);
});

test('searchReceivingPhotoMoveTargets: self-match falls back to recent browse', async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const deps: SearchPhotoMoveTargetsDeps = {
    query: async (_org, sql, values) => {
      calls.push({ sql, values });
      if (calls.length === 1) return [];
      if (calls.length === 2) return [{ ...SAMPLE_ROW, receiving_id: 999 }];
      return [OTHER_ROW];
    },
  };

  const result = await searchReceivingPhotoMoveTargets(
    {
      orgId: ORG,
      search: '9302211047900000195968',
      excludeReceivingId: 999,
      limit: 25,
    },
    deps,
  );

  assert.equal(calls.length, 3);
  assert.equal(result.matchedExcludedSelf, true);
  assert.equal(result.targets.length, 1);
  assert.equal(result.targets[0].receiving_id, 60001);
  // Catalog product title wins over listing item_name (rail SoT).
  assert.equal(result.targets[0].title, 'Bose Wave Music System IV');
  assert.doesNotMatch(calls[2].sql, /ILIKE/);
  assert.ok(calls[2].values.includes(999));
});

test('searchReceivingPhotoMoveTargets: genuine miss stays empty (no browse)', async () => {
  const calls: unknown[] = [];
  const deps: SearchPhotoMoveTargetsDeps = {
    query: async (_org, _sql, values) => {
      calls.push(values);
      return [];
    },
  };

  const result = await searchReceivingPhotoMoveTargets(
    {
      orgId: ORG,
      search: 'DOES-NOT-EXIST-ZZZ',
      excludeReceivingId: 999,
    },
    deps,
  );

  assert.equal(calls.length, 2);
  assert.equal(result.matchedExcludedSelf, false);
  assert.equal(result.targets.length, 0);
});

test('searchReceivingPhotoMoveTargets: R-handle self-match falls back to recent', async () => {
  const calls: unknown[] = [];
  const deps: SearchPhotoMoveTargetsDeps = {
    query: async (_org, _sql, _values) => {
      calls.push(1);
      if (calls.length === 1) return [];
      if (calls.length === 2) {
        return [
          {
            receiving_id: 50807,
            po_id: '',
            po_number: '',
            catalog_product_title: null,
            zoho_item_title: null,
            item_name: null,
            sku: null,
            zoho_item_id: null,
            tracking_number: null,
            ticket_id: null,
            ticket_external_id: null,
            source: 'unmatched',
            photo_count: 0,
          },
        ];
      }
      return [OTHER_ROW];
    },
  };

  const result = await searchReceivingPhotoMoveTargets(
    { orgId: ORG, search: 'R-50807', excludeReceivingId: 50807 },
    deps,
  );

  assert.equal(result.matchedExcludedSelf, true);
  assert.equal(result.targets[0].receiving_id, 60001);
  assert.equal(calls.length, 3);
});
