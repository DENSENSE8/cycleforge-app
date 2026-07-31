/**
 * WorkbenchTrailingCluster — Sort → Fields → Import → Add skeleton (Fields altitude).
 *
 * - In-scope GridFieldsMenu mounts must compose WorkbenchTrailingCluster.
 * - When Sort + Fields share a trailing cluster, Sort precedes Fields.
 * - Ban TableActionBar / in-card Fields toolbar identifiers.
 *
 * @see docs/todo/table-action-bar-fields-PLAN.md
 * @see .claude/rules/display/workbench.md → Trailing Display & Actions
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SHELL = join(ROOT, 'src/components/dashboard/workbench-shell.tsx');

/** Workbench mounts that own GridFieldsMenu (Wave 1 + Unbox Phase 2). */
const IN_SCOPE_MOUNTS = [
  'src/components/dashboard/OutboundWorkspaceHeader.tsx',
  'src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx',
  'src/components/sidebar/receiving/HistoryWorkspaceHeader.tsx',
  'src/components/repair/RepairWorkspaceHeader.tsx',
  'src/components/products/catalog/ProductsCatalogWorkspace.tsx',
  'src/components/receiving/pickup/PickupWorkspace.tsx',
  'src/components/receiving/unbox/UnboxWorkspaceHeader.tsx',
] as const;

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(full, out);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('WorkbenchTrailingCluster SoT', () => {
  const shell = readFileSync(SHELL, 'utf8');

  it('exports WorkbenchTrailingCluster with Sort → Fields slot order', () => {
    assert.match(shell, /export function WorkbenchTrailingCluster/);
    assert.match(shell, /before\?: ReactNode/);
    assert.match(shell, /sort\?: ReactNode/);
    assert.match(shell, /fields\?: ReactNode/);
    assert.match(shell, /actions\?: ReactNode/);
    assert.match(shell, /after\?: ReactNode/);
    // Render order in the composer body
    const body = shell.slice(shell.indexOf('export function WorkbenchTrailingCluster'));
    const beforeIdx = body.indexOf('{before}');
    const sortIdx = body.indexOf('{sort}');
    const fieldsIdx = body.indexOf('{fields}');
    const actionsIdx = body.indexOf('{actions}');
    const afterIdx = body.indexOf('{after}');
    assert.ok(beforeIdx > 0 && sortIdx > beforeIdx);
    assert.ok(fieldsIdx > sortIdx);
    assert.ok(actionsIdx > fieldsIdx);
    assert.ok(afterIdx > actionsIdx);
  });

  for (const rel of IN_SCOPE_MOUNTS) {
    it(`${rel} mounts GridFieldsMenu inside WorkbenchTrailingCluster fields=`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      assert.match(src, /WorkbenchTrailingCluster/);
      assert.match(src, /fields=\{[\s\S]*?<GridFieldsMenu/);
      // Fields must not sit in the `right` filter cluster
      const rightBlock = src.match(/right=\{[\s\S]*?\n\s*(trailing|controlsSlot)/);
      if (rightBlock) {
        assert.doesNotMatch(rightBlock[0], /GridFieldsMenu/);
      }
    });
  }

  it('Repair trailing places Sort before Fields', () => {
    const src = readFileSync(join(ROOT, 'src/components/repair/RepairWorkspaceHeader.tsx'), 'utf8');
    const sortProp = src.indexOf('sort={');
    const fieldsProp = src.indexOf('fields={');
    assert.ok(sortProp > 0 && fieldsProp > sortProp, 'sort= must precede fields=');
  });

  it('ReceivingLinesTable embedded portal does not inject GridFieldsMenu', () => {
    const src = readFileSync(join(ROOT, 'src/components/station/ReceivingLinesTable.tsx'), 'utf8');
    assert.doesNotMatch(src, /GridFieldsMenu/);
  });

  it('bans TableActionBar component / JSX under src/ (comments OK)', () => {
    const hits: string[] = [];
    // Real invent signal: export/function/class or JSX tag — not “never invent” prose.
    const invent = /(?:export\s+(?:function|const|class)\s+TableActionBar\b|function\s+TableActionBar\b|<\s*TableActionBar\b)/;
    for (const file of walkTsx(join(ROOT, 'src'))) {
      if (file.endsWith('workbench-trailing-cluster.guard.test.ts')) continue;
      const text = readFileSync(file, 'utf8');
      if (invent.test(text)) {
        hits.push(relative(ROOT, file));
      }
    }
    assert.deepEqual(hits, [], `TableActionBar must not appear: ${hits.join(', ')}`);
  });
});
