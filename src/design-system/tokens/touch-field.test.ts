import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * iOS Safari zooms the viewport whenever a focused text control computes under
 * 16px. There is NO escape hatch: `user-scalable=no` / `maximum-scale=1` has
 * been ignored by iOS Safari since iOS 10, and adding it would fail this repo's
 * own axe `meta-viewport` gate (WCAG 1.4.4 — see the comment above the viewport
 * meta in `src/app/layout.tsx`). The SIZE is the only fix.
 *
 * Every `role-*` in the type scale except `role-field` is 10–14px AND shrinks
 * further under `[data-density='compact']` (×0.92), so any phone input wearing
 * one makes the page lurch on every tap at a bench.
 *
 * This test is the ratchet: a new mobile input with a small type class fails
 * here instead of shipping a zoom.
 */

const MOBILE_ROOTS = ['src/components/mobile', 'src/app/m'];

/** Type classes that compute under 16px — the zoom triggers. */
const SMALL_TYPE = [
  'text-xs',
  'text-sm',
  'text-role-body',
  'text-role-data',
  'text-role-nav',
  'text-role-caption',
  'text-role-eyebrow',
  'text-role-micro',
];

/** A file-input is never focused for text entry, so it cannot trigger the zoom. */
const EXEMPT_CONTROL = /type="file"|sr-only/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...walk(path));
    } else if (/\.(tsx|jsx)$/.test(entry) && !/\.test\./.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * The complete opening tag for each text control. Tag-level scanning avoids
 * treating an unrelated caption on the same minified source line as the
 * input's own class.
 */
function controlClassTags(source: string): string[] {
  return [...source.matchAll(/<(?:input|textarea|select)\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => !EXEMPT_CONTROL.test(tag) && /className/.test(tag));
}

test('no mobile text control wears a sub-16px type class (iOS focus zoom)', () => {
  const offenders: string[] = [];

  for (const root of MOBILE_ROOTS) {
    for (const file of walk(root)) {
      const source = readFileSync(file, 'utf8');
      for (const tag of controlClassTags(source)) {
        const hit = SMALL_TYPE.find((cls) => new RegExp(`\\b${cls}\\b`).test(tag));
        if (hit) offenders.push(`${file}: ${hit}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'these phone inputs will zoom iOS Safari on focus — use `text-role-field` (16px):\n' +
      offenders.join('\n'),
  );
});

test('the mobile roots actually contain text controls — the scan is not vacuous', () => {
  const total = MOBILE_ROOTS.flatMap((root) => walk(root)).filter((file) =>
    /<(input|textarea|select)\b/.test(readFileSync(file, 'utf8')),
  );
  assert.ok(total.length >= 5, `expected several mobile inputs, found ${total.length}`);
});
