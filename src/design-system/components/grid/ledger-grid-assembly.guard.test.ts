/**
 * Feature code mounts `LedgerGridSurface` / `NonlinearTableHost`, not the
 * engine `LedgerGrid`. The barrel re-export is the bypass dep-cruiser cannot
 * see (it resolves to `grid/index.ts`).
 *
 * Shrink-only: FbaBoardTable is the parked day-banded consumer. Do not add
 * a second direct `LedgerGrid` import — compose the surface.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const ALLOWED = new Set([
  'src/design-system/components/grid/LedgerGrid.tsx',
  'src/design-system/components/grid/LedgerGridSurface.tsx',
  'src/design-system/components/grid/index.ts',
  // Parked: FBA day-banded board. Migrate onto LedgerGridSurface, then delete.
  'src/components/fba/FbaBoardTable.tsx',
  // Parked (plan 2h): station day-banded list shell. Migrate onto
  // NonlinearTableHost + a TableDefinition, then delete.
  'src/components/station/StationListTable.tsx',
]);

const IMPORT =
  /import\s*\{[^}]*\bLedgerGrid\b[^}]*\}\s*from\s*['"]@\/design-system\/components\/grid(?:\/LedgerGrid)?['"]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.includes('.test.')) out.push(p);
  }
  return out;
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('LedgerGrid is an assembly internal', () => {
  it('feature modules do not import LedgerGrid except parked consumers', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(ROOT, file).replaceAll('\\', '/');
      if (ALLOWED.has(rel)) continue;
      if (IMPORT.test(code(readFileSync(file, 'utf8')))) offenders.push(rel);
    }
    assert.deepEqual(
      offenders,
      [],
      `Import LedgerGridSurface / NonlinearTableHost, not LedgerGrid:\n  ${offenders.join('\n  ')}`,
    );
  });
});
