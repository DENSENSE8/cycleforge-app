/**
 * external-detail yield strangler — closed. Do not reintroduce a standing
 * null-node claim that suppresses the assistant for unmigrated fixed panels.
 *
 *   node --import tsx --test src/lib/right-rail/external-detail-yield.guard.test.ts
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('external-detail yield retired', () => {
  it('store documents retirement (no live external-detail id)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/right-rail/store.ts'),
      'utf8',
    );
    assert.match(src, /external-detail.*retired|retired.*external-detail/i);
    const code = stripComments(src);
    assert.doesNotMatch(
      code,
      /['"]external-detail['"]/,
      'must not register an external-detail occupant id',
    );
  });

  it('no call site registers id external-detail', () => {
    const hits = execSync(
      "rg -n \"['\\\"]external-detail['\\\"]\" src --glob '*.{ts,tsx}' || true",
      { encoding: 'utf8' },
    )
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((line) => !line.includes('external-detail-yield.guard'));
    assert.equal(
      hits.length,
      0,
      `reintroduced external-detail id:\n${hits.join('\n')}`,
    );
  });
});
