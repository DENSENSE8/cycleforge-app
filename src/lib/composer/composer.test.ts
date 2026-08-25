/**
 * Omni-command composer — domain suite. DB-free:
 *
 *   npx tsx --test src/lib/composer/composer.test.ts
 *
 * Covers the grammar (trigger vocabulary, marketplace shapes), the `/` action
 * registry, and the deterministic auto-commit rule with an injected resolver.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  classifyComposerToken,
  isBareIdentifier,
  isCompleteMarketplaceId,
  isIdentifierPrefix,
  marketplaceRouteOf,
} from './grammar';
import { COMPOSER_ACTIONS, searchComposerActions } from './actions';
import { resolveAutoCommitHit, shouldAutoCommit, type ComposerResolveFn } from './resolve';

describe('trigger vocabulary', () => {
  it('# routes to orders with the sigil stripped', () => {
    const cls = classifyComposerToken('#04-15');
    assert.deepEqual(cls, { kind: 'order', trigger: '#', query: '04-15', raw: '#04-15' });
  });

  it('@ is reserved for users', () => {
    const cls = classifyComposerToken('@ka');
    assert.equal(cls?.kind, 'user');
    assert.equal(cls?.query, 'ka');
  });

  it('/ routes to actions', () => {
    const cls = classifyComposerToken('/pack');
    assert.equal(cls?.kind, 'action');
    assert.equal(cls?.query, 'pack');
  });

  it('a bare identifier is the scanner path — orders, no sigil required', () => {
    const cls = classifyComposerToken('QA-TEST-UNSHIP-PENDING');
    assert.equal(cls?.kind, 'order');
    assert.equal(cls?.trigger, '');
    assert.equal(cls?.query, 'QA-TEST-UNSHIP-PENDING');
  });

  it('a bare word without a digit or dash is prose, never a lookup', () => {
    assert.equal(classifyComposerToken('hello'), null);
    assert.equal(isBareIdentifier('hello'), false);
    assert.equal(isBareIdentifier('9764'), true);
    assert.equal(isBareIdentifier('QA-TEST-'), true);
  });

  it('a lone sigil opens its domain with an empty query', () => {
    assert.equal(classifyComposerToken('#')?.query, '');
    assert.equal(classifyComposerToken('/')?.kind, 'action');
  });
});

describe('marketplace routing — one orders table', () => {
  it('an eBay-shaped id routes ebay', () => {
    assert.equal(marketplaceRouteOf('04-15010-43987'), 'ebay');
    assert.equal(isCompleteMarketplaceId('04-15010-43987'), true);
  });

  it('an Amazon-shaped id routes amazon, never ebay', () => {
    assert.equal(marketplaceRouteOf('112-0967880-0063458'), 'amazon');
  });

  it('a QA fixture id routes to neither — it is still an order token', () => {
    assert.equal(marketplaceRouteOf('QA-TEST-UNSHIP-PENDING'), null);
    assert.equal(classifyComposerToken('QA-TEST-UNSHIP-PENDING')?.kind, 'order');
  });

  it('a prefix of a marketplace id is not complete', () => {
    assert.equal(isCompleteMarketplaceId('04-'), false);
    assert.equal(isIdentifierPrefix('04-'), true);
    assert.equal(isIdentifierPrefix('04-15010-43987'), false);
  });
});

describe('/ actions — the launcher destinations', () => {
  it('/pack hits the packing action', () => {
    const hits = searchComposerActions('pack');
    const packing = hits.find((a) => a.key === 'packing');
    assert.ok(packing, 'expected the packing action');
    assert.deepEqual(packing?.run, { kind: 'tile', ref: 'packing', title: 'Packing', type: 'session' });
  });

  it('every action names a destination the launcher also has', () => {
    // The launcher's refs/tools, transcribed — drift here is drift the operator feels.
    const launcherTiles = new Set([
      'unbox', 'packing', 'qc', 'fba-build',
      'triage', 'receiving', 'pickup', 'labels', 'settings', 'units', 'orders', 'returns',
    ]);
    const launcherTools = new Set(['pairing', 'timer', 'stopwatch', 'photos', 'manuals', 'printer', 'calc']);
    for (const action of COMPOSER_ACTIONS) {
      if (action.run.kind === 'tile') {
        assert.ok(launcherTiles.has(action.run.ref), `unknown tile ref ${action.run.ref}`);
      } else {
        assert.ok(launcherTools.has(action.run.tool), `unknown tool ${action.run.tool}`);
      }
    }
  });

  it('an empty query lists everything', () => {
    assert.equal(searchComposerActions('').length, COMPOSER_ACTIONS.length);
  });
});

describe('deterministic auto-commit', () => {
  const HITS = [
    { orderId: 'QA-TEST-UNSHIP-PENDING' },
    { orderId: 'QA-TEST-UNSHIP-PENDING-2' },
    { orderId: 'QA-TEST-UNSHIP-PENDING-3' },
  ];

  it('true only for a complete identifier naming exactly one row', () => {
    assert.equal(shouldAutoCommit('QA-TEST-UNSHIP-PENDING', HITS), true);
    assert.equal(shouldAutoCommit('#QA-TEST-UNSHIP-PENDING', HITS), true);
    assert.equal(shouldAutoCommit('qa-test-unship-pending', HITS), true);
  });

  it('a unique prefix does not chip — even matching one row', () => {
    assert.equal(shouldAutoCommit('QA-TEST-', [{ orderId: 'QA-TEST-PACKED' }]), false);
    assert.equal(shouldAutoCommit('04-', [{ orderId: '04-15010-43987' }]), false);
  });

  it('a partial token that starts a row but is not it does not chip', () => {
    assert.equal(shouldAutoCommit('QA-TEST-UNSH', HITS), false);
  });

  it('two exact rows would refuse the chip', () => {
    assert.equal(
      shouldAutoCommit('QA-TEST-UNSHIP-PENDING', [...HITS, { orderId: 'qa-test-unship-pending' }]),
      false,
    );
  });

  it('prose and action tokens never auto-commit', () => {
    assert.equal(shouldAutoCommit('hello', []), false);
    assert.equal(shouldAutoCommit('/pack', []), false);
  });
});

describe('resolveAutoCommitHit — injected resolver', () => {
  const fakes = () => {
    const calls: string[] = [];
    const order = { id: 42, order_id: 'QA-TEST-UNSHIP-PENDING' };
    const resolve: ComposerResolveFn<typeof order> = async (token) => {
      calls.push(token);
      return token === order.order_id ? { kind: 'hit', order } : { kind: 'miss' };
    };
    return { calls, order, resolve };
  };

  it('an exact hit returns the row, with the sigil stripped before resolving', async () => {
    const f = fakes();
    const hit = await resolveAutoCommitHit('#QA-TEST-UNSHIP-PENDING', f.resolve);
    assert.equal(hit, f.order);
    assert.deepEqual(f.calls, ['QA-TEST-UNSHIP-PENDING']);
  });

  it('a miss returns null', async () => {
    const f = fakes();
    assert.equal(await resolveAutoCommitHit('QA-TEST-DOES-NOT-EXIST-99999', f.resolve), null);
    assert.deepEqual(f.calls, ['QA-TEST-DOES-NOT-EXIST-99999']);
  });

  it('a prefix short-circuits — the resolver is never called', async () => {
    const f = fakes();
    assert.equal(await resolveAutoCommitHit('QA-TEST-', f.resolve), null);
    assert.equal(await resolveAutoCommitHit('/pack', f.resolve), null);
    assert.equal(await resolveAutoCommitHit('hello', f.resolve), null);
    assert.deepEqual(f.calls, []);
  });
});
