/**
 * CartonContextCard has ONE face — the two-row Unbox SoT.
 *
 * Former `density="bar"` / `density="card"` / `density="bar-stacked"` props are
 * deleted. Every adapter mounts the stacked layout; hosts pair with
 * `reserveIdentityClearance="stacked"`. Reintroducing a density prop or a
 * one-row assembly is a fork of the station entity-context SoT.
 *
 * @see src/components/station/entity-context/CartonContextCard.tsx
 * @see .claude/rules/source-of-truth.md → Station entity-context header
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const BANNED = [
  /density\s*=\s*["']bar["']/,
  /density\s*=\s*["']bar-stacked["']/,
  /density\s*=\s*["']card["']/,
  /density\s*\?:\s*['"]bar['"]/,
  /density:\s*['"]bar['"]\s*\|\s*['"]bar-stacked['"]/,
] as const;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|mdc?)$/.test(entry.name) && !entry.name.endsWith('.guard.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('carton-context-density', () => {
  it('CartonContextCard has no density prop', () => {
    const src = readFileSync(
      join(SRC, 'components/station/entity-context/CartonContextCard.tsx'),
      'utf8',
    );
    assert.ok(
      !/\bdensity\s*[?:]/.test(src) && !/\bdensity\s*=/.test(src),
      'CartonContextCard must not reintroduce a density prop — one two-row face only',
    );
  });

  it('no call site passes density=bar / bar-stacked / card', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8');
      // Ignore comments that only mention the retired names historically.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const pattern of BANNED) {
        if (pattern.test(code)) {
          offenders.push(`${relative(ROOT, file)} (~${pattern})`);
          break;
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Retired CartonContextCard density props still referenced:\n${offenders.join('\n')}`,
    );
  });
});
