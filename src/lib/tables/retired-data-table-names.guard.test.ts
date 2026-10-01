import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCAN_ROOTS = ['src', 'docs', 'tools', 'scripts'] as const;
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.json',
  '.js',
  '.jsx',
  '.md',
  '.mjs',
  '.mts',
  '.scss',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const RETIRED_NAMES = [
  ['slot', 'table'].join(''),
  ['slot', 'table'].join('-'),
  ['slot', 'table'].join(' '),
  ['slot', 'layout'].join(''),
  ['slot', 'layout'].join('-'),
  ['slot', 'layout'].join(' '),
] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return TEXT_EXTENSIONS.has(path.extname(entry.name)) ? [file] : [];
  });
}

test('retired table-engine names stay deleted', () => {
  const offenders: string[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of sourceFiles(path.join(REPO_ROOT, root))) {
      const relative = path.relative(REPO_ROOT, file);
      const searchable = `${relative}\n${readFileSync(file, 'utf8')}`.toLowerCase();
      if (RETIRED_NAMES.some((name) => searchable.includes(name))) offenders.push(relative);
    }
  }
  assert.deepEqual(offenders, []);
});
