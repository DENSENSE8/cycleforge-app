import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pinMatchesLocation,
  pagesNotPinned,
  pinsCoverPageId,
  resolveActivePinHref,
} from './page-label';

test('Unbox pin matches tab and table query — not the exact href', () => {
  const params = new URLSearchParams('unboxview=history');
  assert.equal(pinMatchesLocation('/unbox', '/unbox', params), true);
  assert.equal(
    pinMatchesLocation('/unbox', '/unbox', new URLSearchParams('ukpi=late')),
    true,
  );
  assert.equal(pinMatchesLocation('/unbox', '/pack', null), false);
});

test('legacy /receiving pin is still Unbox on /unbox', () => {
  assert.equal(pinMatchesLocation('/receiving', '/unbox', null), true);
  assert.equal(pinsCoverPageId('receive', [{ href: '/receiving' }]), true);
  assert.equal(pinsCoverPageId('receive', [{ href: '/packing' }]), false);
});

test('dashboard mode pins stay on their own L1', () => {
  const sales = new URLSearchParams('mode=sales');
  assert.equal(pinMatchesLocation('/dashboard?mode=sales', '/dashboard', sales), true);
  assert.equal(pinMatchesLocation('/dashboard?mode=sales', '/dashboard', null), false);
});

test('resolveActivePinHref prefers exact href then the query-less Unbox pin', () => {
  const pins = [{ href: '/unbox' }, { href: '/packing' }];
  assert.equal(
    resolveActivePinHref(pins, '/unbox?unboxview=history', '/unbox', new URLSearchParams('unboxview=history')),
    '/unbox',
  );
  assert.equal(
    resolveActivePinHref(pins, '/unbox', '/unbox', null),
    '/unbox',
  );
  assert.equal(
    resolveActivePinHref(pins, '/photos', '/photos', null),
    null,
  );
});

test('a pinned page is moved out of its catalog section, not duplicated', () => {
  const pages = [{ id: 'receive' }, { id: 'packer' }, { id: 'test' }];
  assert.deepEqual(
    pagesNotPinned(pages, [{ href: '/receiving' }, { href: '/pack' }]).map((p) => p.id),
    ['test'],
  );
  assert.deepEqual(pagesNotPinned(pages, []).map((p) => p.id), ['receive', 'packer', 'test']);
});
