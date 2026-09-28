import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveWelcomeVariant } from './welcome-variant';

describe('resolveWelcomeVariant', () => {
  it('defaults to simple when storage has no valid preference', () => {
    assert.deepEqual(resolveWelcomeVariant('', null, true), { variant: 'simple', persist: null });
    assert.deepEqual(resolveWelcomeVariant('', 'other', true), { variant: 'simple', persist: null });
  });

  it('uses every persisted variant', () => {
    for (const variant of ['simple', 'complex', 'elevation'] as const) {
      assert.deepEqual(resolveWelcomeVariant('', variant, true), { variant, persist: null });
    }
  });

  it('lets a valid development URL override storage and requests persistence', () => {
    assert.deepEqual(resolveWelcomeVariant('?welcomeVariant=elevation', 'complex', true), {
      variant: 'elevation',
      persist: 'elevation',
    });
  });

  it('ignores URL overrides in production', () => {
    assert.deepEqual(resolveWelcomeVariant('?welcomeVariant=complex', 'elevation', false), {
      variant: 'elevation',
      persist: null,
    });
  });
});
