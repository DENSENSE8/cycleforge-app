/**
 * Omni-Command Composer domain tests — trigger mapping, pattern routing,
 * auto-commit safety. DB-free.
 *
 *   npx tsx --test src/lib/composer/composer.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchComposerTrigger } from './triggers';
import {
  isCompleteOrderIdentifier,
  platformForOrderToken,
  routeComposerQuery,
} from './pattern-router';
import { shouldAutoCommit } from './auto-commit';
import { filterComposerActions } from './actions';
import { resolveAutoCommitHit, searchComposerHits, type ComposerLookupDeps } from './lookup';
import { serializeComposerNodes } from './document';

test('matchComposerTrigger: # opens orders', () => {
  const m = matchComposerTrigger('hello #04-15');
  assert.ok(m);
  assert.equal(m!.kind, 'order');
  assert.equal(m!.query, '04-15');
});

test('matchComposerTrigger: @ opens users', () => {
  const m = matchComposerTrigger('@ada');
  assert.ok(m);
  assert.equal(m!.kind, 'user');
  assert.equal(m!.query, 'ada');
});

test('matchComposerTrigger: / opens actions', () => {
  const m = matchComposerTrigger('/pack');
  assert.ok(m);
  assert.equal(m!.kind, 'action');
  assert.equal(m!.query, 'pack');
});

test('matchComposerTrigger: bare eBay-shaped id is an order query', () => {
  const m = matchComposerTrigger('04-15010-43987');
  assert.ok(m);
  assert.equal(m!.kind, 'bare_identifier');
  assert.equal(m!.query, '04-15010-43987');
});

test('matchComposerTrigger: prose without an identifier is not a trigger', () => {
  assert.equal(matchComposerTrigger('describe the work'), null);
  assert.equal(matchComposerTrigger('hello '), null);
});

test('platformForOrderToken: eBay is two digits, Amazon is three', () => {
  assert.equal(platformForOrderToken('04-15010-43987'), 'ebay');
  assert.equal(platformForOrderToken('112-0967880-0063458'), 'amazon');
  assert.equal(platformForOrderToken('04-'), 'ebay');
  assert.equal(platformForOrderToken('112-'), 'amazon');
});

test('isCompleteOrderIdentifier: prefixes are incomplete', () => {
  assert.equal(isCompleteOrderIdentifier('04-'), false);
  assert.equal(isCompleteOrderIdentifier('04-15010'), false);
  assert.equal(isCompleteOrderIdentifier('112-'), false);
  assert.equal(isCompleteOrderIdentifier('04-15010-43987'), true);
  assert.equal(isCompleteOrderIdentifier('112-0967880-0063458'), true);
  assert.equal(isCompleteOrderIdentifier('123456789012345'), true); // Walmart
  assert.equal(isCompleteOrderIdentifier('4869'), true); // Ecwid
});

test('routeComposerQuery: / is actions, @ is users, rest are orders', () => {
  assert.equal(routeComposerQuery('action', 'pack').source, 'actions');
  assert.equal(routeComposerQuery('user', 'ada').source, 'users');
  const ebay = routeComposerQuery('bare_identifier', '04-15010-43987');
  assert.equal(ebay.source, 'orders');
  assert.equal(ebay.platform, 'ebay');
  assert.equal(ebay.complete, true);
  const prefix = routeComposerQuery('order', '04-');
  assert.equal(prefix.complete, false);
  assert.equal(prefix.platform, 'ebay');
});

test('shouldAutoCommit: unique complete id commits; unique prefix does not', () => {
  const complete = routeComposerQuery('bare_identifier', '04-15010-43987');
  const prefix = routeComposerQuery('bare_identifier', '04-');
  assert.equal(shouldAutoCommit(complete, 1), true);
  assert.equal(shouldAutoCommit(complete, 2), false);
  assert.equal(shouldAutoCommit(complete, 0), false);
  assert.equal(shouldAutoCommit(prefix, 1), false, 'unique prefix must not chip');
});

test('shouldAutoCommit: users never auto-commit', () => {
  const users = routeComposerQuery('user', 'ada');
  assert.equal(shouldAutoCommit(users, 1), false);
});

test('filterComposerActions: substring match', () => {
  const hits = filterComposerActions('pack');
  assert.ok(hits.some((a) => a.id === 'packing'));
  assert.equal(filterComposerActions('zzzz-nope').length, 0);
});

test('serializeComposerNodes: chips flatten to labels', () => {
  const text = serializeComposerNodes([
    { type: 'text', text: 'see ' },
    {
      type: 'entity_chip',
      entityType: 'order',
      id: 42,
      label: '04-15010-43987',
      payload: {},
    },
  ]);
  assert.equal(text, 'see 04-15010-43987');
});

function fakes(opts: {
  order?: { id: number; order_id: string; product_title: string; account_source: string } | null;
  rows?: Array<{ id: number; entityType: string; title: string; subtitle: string }>;
}): { deps: ComposerLookupDeps } {
  const deps: ComposerLookupDeps = {
    resolveOrder: async () =>
      opts.order
        ? { status: 'ok', order: opts.order as never }
        : { status: 'notfound' },
    fetch: (async () =>
      new Response(JSON.stringify({ rows: opts.rows ?? [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch,
  };
  return { deps };
}

test('resolveAutoCommitHit: complete unique order chips', async () => {
  const route = routeComposerQuery('bare_identifier', '04-15010-43987');
  const { deps } = fakes({
    order: {
      id: 42,
      order_id: '04-15010-43987',
      product_title: 'Bose Wave',
      account_source: 'ebay',
    },
  });
  const hit = await resolveAutoCommitHit(route, deps);
  assert.ok(hit);
  assert.equal(hit!.label, '04-15010-43987');
  assert.equal(hit!.entityType, 'order');
});

test('resolveAutoCommitHit: unique prefix does not chip even if lookup would', async () => {
  const route = routeComposerQuery('bare_identifier', '04-');
  const { deps } = fakes({
    rows: [{ id: 1, entityType: 'order', title: '04-15010-43987', subtitle: 'only one' }],
  });
  const hits = await searchComposerHits(route, deps);
  assert.equal(hits.length, 1);
  const auto = await resolveAutoCommitHit(route, deps);
  assert.equal(auto, null);
});
