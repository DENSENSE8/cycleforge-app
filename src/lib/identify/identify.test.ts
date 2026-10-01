import test from 'node:test';
import assert from 'node:assert/strict';
import { identify, type IdentifyDeps } from './identify';
import { IdentifyResponseSchema, type IdentifyResponse } from './schema';
import type { IdentifyRow } from './sql';

const ORG = '00000000-0000-0000-0000-00000000000a';

function row(over: Partial<IdentifyRow>): IdentifyRow {
  return {
    arm: 'exact',
    line: null,
    probe: null,
    value: null,
    kind: 'order',
    entity_id: 1,
    arm_rank: 0,
    score: 1,
    doc_title: null,
    doc_subtitle: null,
    doc_condition: null,
    happened_at: null,
    order_id: null,
    order_title: null,
    account_source: null,
    order_condition: null,
    shipment_id: null,
    desk_view: null,
    has_pick_scan: false,
    packed: false,
    staged: false,
    out_of_stock: false,
    sku: null,
    catalog_title: null,
    zoho_title: null,
    unit_serial: null,
    unit_status: null,
    unit_condition: null,
    receiving_po: null,
    receiving_tracking: null,
    repair_title: null,
    repair_ticket: null,
    location_label: null,
    brand: null,
    ...over,
  };
}

const BOSE = { id: 5, name: 'Bose', kind: 'brand', confidence: 1, source: 'seed', root: { id: 5, name: 'Bose' } };
const SONY = { id: 9, name: 'Sony', kind: 'brand', confidence: 1, source: 'seed', root: { id: 9, name: 'Sony' } };

interface Captured {
  queries: Array<{ orgId: string; sql: string; params: unknown[] }>;
}

/** `respond` picks the canned rows for each statement by what it asks. */
function fakes(opts: { respond: (sql: string, params: unknown[]) => IdentifyRow[] }) {
  const cap: Captured = { queries: [] };
  const deps: IdentifyDeps = {
    query: async (orgId, sql, params) => {
      cap.queries.push({ orgId, sql, params });
      return { rows: opts.respond(sql, params) };
    },
    brandSql: '(SELECT NULL::jsonb)',
    cache: (_orgId, _key, load) => load(),
  };
  return { deps, cap };
}

const isFreeText = (sql: string) => sql.includes('ft_hits');

/** Every response is valid wire shape after a JSON round trip. */
function wire(res: IdentifyResponse): IdentifyResponse {
  return IdentifyResponseSchema.parse(JSON.parse(JSON.stringify(res)));
}

test('an exact unique identifier short-circuits to single in one statement, opening on its desk view', async () => {
  const { deps, cap } = fakes({
    respond: () => [
      row({
        probe: 'order_id',
        value: '113-4638555-9983448',
        entity_id: 4612,
        order_id: '113-4638555-9983448',
        order_title: 'Bose TV Speaker',
        account_source: 'amazon',
        shipment_id: 88,
        desk_view: 'triage',
      }),
    ],
  });
  const res = wire(await identify(ORG, { q: '113-4638555-9983448' }, deps));

  assert.equal(cap.queries.length, 1);
  assert.equal(cap.queries[0].orgId, ORG);
  assert.equal(cap.queries[0].params[0], ORG);
  assert.equal(isFreeText(cap.queries[0].sql), false, 'an identifier line runs no free text in the first trip');

  assert.equal(res.mode, 'single');
  const [c] = res.lines[0].candidates;
  assert.deepEqual([c.kind, c.entityId, c.stage, c.confidence], ['order', 4612, 'to_ship', 0.97]);
  assert.deepEqual(c.matchedOn, { field: 'order_id', token: '113-4638555-9983448' });
  assert.equal(c.href, '/shipping/orders?openOrderId=4612');
  // Labeled, not picked: the registry's primary verb is the pick.
  assert.deepEqual(c.actions.map((a) => a.id).slice(0, 2), ['open', 'pick']);
});

test('the same identifier on two entities is a list, not a single', async () => {
  const { deps } = fakes({
    respond: () => [
      row({ probe: 'tracking', value: '1ZJ22B104222265576', entity_id: 1, desk_view: 'shipped', shipment_id: 40 }),
      row({ probe: 'tracking', value: '1ZJ22B104222265576', entity_id: 2, desk_view: 'shipped', shipment_id: 40 }),
    ],
  });
  const res = await identify(ORG, { q: '1ZJ22B104222265576' }, deps);
  assert.equal(res.mode, 'list');
  assert.deepEqual(res.lines[0].candidates.map((c) => c.entityId), [1, 2]);
  assert.equal(res.lines[0].candidates[0].href, '/fulfilled?shippedFilter=all&shipment=40');
});

test('an identifier-shaped miss falls back to free text in a second statement', async () => {
  const { deps, cap } = fakes({
    respond: (sql) =>
      isFreeText(sql)
        ? [row({ arm: 'keyword_sku', line: 0, kind: 'sku', entity_id: 31, arm_rank: 1, score: 2, catalog_title: 'Sony PS4 Pro', sku: 'PS48' })]
        : [],
  });
  const res = await identify(ORG, { q: 'PS48' }, deps);
  assert.equal(cap.queries.length, 2);
  assert.equal(isFreeText(cap.queries[0].sql), false);
  assert.equal(isFreeText(cap.queries[1].sql), true);
  assert.equal(res.mode, 'list');
  assert.deepEqual(res.lines[0].candidates[0].matchedOn, { field: 'title', token: 'ps48' });
});

test('a machine identifier that misses returns none without any free text', async () => {
  const { deps, cap } = fakes({ respond: () => [] });
  const res = await identify(ORG, { q: 'X005BHURXX' }, deps);
  assert.equal(cap.queries.length, 1);
  assert.equal(res.mode, 'none');
  assert.deepEqual(res.lines[0].candidates, []);
});

test('a brand paste is ONE statement: alias hit filters out other known brands and brand SKUs rank first', async () => {
  const { deps, cap } = fakes({
    respond: () => [
      row({ arm: 'brand_alias', line: 0, probe: 'bose', value: 'seed', kind: 'brand', entity_id: 5, doc_title: 'Bose', doc_subtitle: 'brand' }),
      row({ arm: 'brand_sku', line: 0, kind: 'sku', entity_id: 70, arm_rank: 1, catalog_title: 'Bose 700', sku: 'B700', brand: BOSE }),
      row({ arm: 'keyword_doc', line: 0, kind: 'order', entity_id: 11, arm_rank: 1, score: 2, doc_title: 'Bose 700 and Sony cable', brand: SONY }),
      row({ arm: 'keyword_doc', line: 0, kind: 'order', entity_id: 12, arm_rank: 2, score: 1, doc_title: 'Headphones 700' }),
    ],
  });
  const res = await identify(ORG, { q: 'Bose 700' }, deps);

  assert.equal(cap.queries.length, 1, 'alias match, brand arm and text arms share one round trip');
  const [, , , , , , ngramLines, ngrams] = cap.queries[0].params.slice(15);
  assert.deepEqual(ngrams, ['bose', 'bose 700', '700']);
  assert.deepEqual(ngramLines, [0, 0, 0]);

  const line = res.lines[0];
  assert.deepEqual(line.filters.brands, [{ id: 5, name: 'Bose', token: 'bose' }]);
  assert.deepEqual(line.candidates.map((c) => `${c.kind}:${c.entityId}`), ['sku:70', 'order:12']);
  assert.deepEqual(line.candidates[0].matchedOn, { field: 'brand', token: 'bose' });
  assert.equal(line.candidates[0].brand?.name, 'Bose');
});

test('a shorter alias inside a longer hit loses (longest match)', async () => {
  const { deps } = fakes({
    respond: () => [
      row({ arm: 'brand_alias', line: 0, probe: 'guitar hero', value: 'seed', kind: 'brand', entity_id: 3, doc_title: 'Guitar Hero', doc_subtitle: 'franchise' }),
      row({ arm: 'brand_alias', line: 0, probe: 'hero', value: 'listing', kind: 'brand', entity_id: 8, doc_title: 'Hero', doc_subtitle: 'brand' }),
    ],
  });
  const res = await identify(ORG, { q: 'guitar hero drums' }, deps);
  assert.deepEqual(res.lines[0].filters.brands, [{ id: 3, name: 'Guitar Hero', token: 'guitar hero' }]);
});

test('grade words drop candidates of a known other condition and keep unknown ones', async () => {
  const { deps } = fakes({
    respond: () => [
      row({ arm: 'keyword_doc', line: 0, kind: 'order', entity_id: 1, arm_rank: 1, order_condition: 'NEW' }),
      row({ arm: 'keyword_doc', line: 0, kind: 'order', entity_id: 2, arm_rank: 2, order_condition: 'USED_B' }),
      row({ arm: 'keyword_doc', line: 0, kind: 'order', entity_id: 3, arm_rank: 3 }),
    ],
  });
  const res = await identify(ORG, { q: 'soundlink used' }, deps);
  assert.deepEqual(res.lines[0].filters.conditions, ['USED_A', 'USED_B', 'USED_C']);
  assert.deepEqual(res.lines[0].candidates.map((c) => c.entityId).sort(), [2, 3]);
});

test('the caller context ranks its own kind and stage first within a tier', async () => {
  const rows = [
    row({ arm: 'keyword_doc', line: 0, kind: 'sku', entity_id: 5, arm_rank: 1 }),
    row({ arm: 'keyword_doc', line: 0, kind: 'order', entity_id: 6, arm_rank: 2, desk_view: 'triage' }),
    row({ arm: 'keyword_doc', line: 0, kind: 'order', entity_id: 7, arm_rank: 3, desk_view: 'exceptions' }),
  ];
  const global = await identify(ORG, { q: 'soundlink' }, fakes({ respond: () => rows }).deps);
  assert.deepEqual(global.lines[0].candidates.map((c) => c.entityId), [5, 6, 7]);

  const scoped = await identify(
    ORG,
    { q: 'soundlink', context: 'outbound.exceptions' },
    fakes({ respond: () => rows }).deps,
  );
  assert.deepEqual(scoped.lines[0].candidates.map((c) => [c.entityId, c.inContext]), [
    [7, true],
    [6, true],
    [5, false],
  ]);
  assert.equal(scoped.lines[0].candidates[0].href, '/shipping/exceptions?order=7');
  assert.ok(scoped.lines[0].candidates[0].actions.some((a) => a.id === 'resolve_exception'));
});

test('a batch resolves every exact probe in ONE statement and answers per line', async () => {
  const { deps, cap } = fakes({
    respond: () => [
      row({ probe: 'receiving_id', value: '1970', kind: 'receiving', entity_id: 1970, receiving_po: '21-14967-81557' }),
      row({ probe: 'fnsku', value: 'X005BHURXX', kind: 'sku', entity_id: 44, sku: 'B-44', catalog_title: 'Bose Wave' }),
    ],
  });
  const res = wire(await identify(ORG, { q: 'R-1970\nX005BHURXX\nT-9395' }, deps));
  assert.equal(cap.queries.length, 1);
  assert.equal(res.mode, 'batch');
  assert.deepEqual(
    res.lines.map((l) => [l.input, l.mode, l.candidates[0]?.kind, l.candidates[0]?.entityId]),
    [
      ['R-1970', 'single', 'receiving', 1970],
      ['X005BHURXX', 'single', 'sku', 44],
      ['T-9395', 'single', 'ticket', 9395],
    ],
  );
  assert.equal(res.lines[0].candidates[0].stage, 'receiving');
  assert.equal(res.lines[2].candidates[0].href, '/support?ticket=9395');
});

test('the typo repair words travel with their line', async () => {
  const { deps, cap } = fakes({ respond: () => [] });
  await identify(ORG, { q: 'bsoe' }, deps);
  const [, wordLines, words, variantLines, variantWords, variantValues] = cap.queries[0].params.slice(15);
  assert.deepEqual([wordLines, words], [[0], ['bsoe']]);
  assert.ok((variantValues as string[]).includes('bose'));
  assert.ok((variantLines as number[]).every((l) => l === 0));
  assert.ok((variantWords as string[]).every((w) => w === 'bsoe'));
});
