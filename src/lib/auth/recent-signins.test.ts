import assert from 'node:assert/strict';
import test from 'node:test';
import { readLastSigninMethod } from './recent-signins';

test('retired email-link sign-in is not restored from browser storage', () => {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>([['cf.lastSigninMethod', 'magic-link']]);

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
      },
    },
  });

  try {
    assert.equal(readLastSigninMethod(), null);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
  }
});
