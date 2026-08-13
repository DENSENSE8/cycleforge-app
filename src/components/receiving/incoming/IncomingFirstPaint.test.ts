/**
 *   npx tsx --test src/components/receiving/incoming/IncomingFirstPaint.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

describe('Incoming first-paint — SI contract', () => {
  it('stand-in is static flush geometry (no pulse, no spinner)', () => {
    const src = readFileSync(
      join(ROOT, 'src/components/receiving/incoming/IncomingFirstPaint.tsx'),
      'utf8',
    );
    assert.match(src, /data-paint-surface="incoming:primary"/);
    assert.match(src, /No packages yet/);
    assert.doesNotMatch(src, /className=\{?["'`][^"'`]*animate-(pulse|spin)/);
    assert.doesNotMatch(src, /Loader2/);
    assert.doesNotMatch(src, /^['"]use client['"]/m);
  });

  it('page streams the stand-in and does not top-level await the full-list seed', () => {
    const page = readFileSync(join(ROOT, 'src/app/incoming/page.tsx'), 'utf8');
    assert.match(page, /IncomingBrowseShell/);
    assert.match(page, /<Suspense/);
    const shell = readFileSync(
      join(ROOT, 'src/components/receiving/incoming/IncomingBrowseShell.tsx'),
      'utf8',
    );
    assert.match(shell, /IncomingFirstPaint/);
    assert.match(shell, /h-full/);
    assert.doesNotMatch(
      page,
      /export default async function IncomingPage\(\) \{\s*const seed = await seedIncomingLines/,
    );
    const seed = readFileSync(join(ROOT, 'src/lib/queries/incoming-seed.server.ts'), 'utf8');
    const timeout = seed.match(/SEED_FETCH_TIMEOUT_MS = (\d[\d_]*)/);
    assert.ok(timeout, 'seed timeout must stay declared');
    const ms = Number(timeout[1].replace(/_/g, ''));
    assert.ok(ms <= 500, `seed is a bonus, not a TTFB tax (got ${ms}ms)`);
  });
});
