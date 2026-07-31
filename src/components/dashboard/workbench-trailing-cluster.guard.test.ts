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

/**
 * Surfaces that must compose WorkbenchTrailingCluster for sort/actions
 * (honest absence of Fields OK — no GridFieldsMenu SoT yet).
 */
const TRAILING_CLUSTER_ADOPTERS = [
  'src/components/packer/PackWorkspaceHeader.tsx',
  'src/components/tech/testing/TestingWorkspaceHeader.tsx',
  'src/components/tech/shipping/ShippingWorkspaceHeader.tsx',
  'src/components/outbound/labels/LabelsWorkspaceHeader.tsx',
  'src/components/support/zendesk/SupportTicketsBoard.tsx',
  'src/components/photos/PhotoLibraryWorkspaceHeader.tsx',
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

  for (const rel of TRAILING_CLUSTER_ADOPTERS) {
    it(`${rel} composes WorkbenchTrailingCluster (no raw sort beside search)`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      assert.match(src, /WorkbenchTrailingCluster/);
      // Display sort must not live in the `right` filter cluster
      const rightBlock = src.match(/right=\{[\s\S]*?\n\s*(trailing|controlsSlot|className)/);
      if (rightBlock) {
        assert.doesNotMatch(rightBlock[0], /QueueSortSwitch/);
        assert.doesNotMatch(rightBlock[0], /PhotoSortMenu/);
        assert.doesNotMatch(rightBlock[0], /ZendeskSelect/);
        assert.doesNotMatch(rightBlock[0], /SortToggle/);
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

  it('Incoming uses tableId incoming; History/Unbox keep receiving', () => {
    const incomingHeader = readFileSync(
      join(ROOT, 'src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx'),
      'utf8',
    );
    const historyHeader = readFileSync(
      join(ROOT, 'src/components/sidebar/receiving/HistoryWorkspaceHeader.tsx'),
      'utf8',
    );
    const unboxHeader = readFileSync(
      join(ROOT, 'src/components/receiving/unbox/UnboxWorkspaceHeader.tsx'),
      'utf8',
    );
    const incomingGrid = readFileSync(
      join(ROOT, 'src/components/station/incoming-grid/IncomingGridView.tsx'),
      'utf8',
    );
    const linesTable = readFileSync(
      join(ROOT, 'src/components/station/ReceivingLinesTable.tsx'),
      'utf8',
    );
    assert.match(incomingHeader, /tableId="incoming"/);
    assert.doesNotMatch(incomingHeader, /tableId="receiving"/);
    assert.match(historyHeader, /tableId="receiving"/);
    assert.match(unboxHeader, /tableId="receiving"/);
    assert.match(incomingGrid, /tableId = 'incoming'/);
    assert.match(linesTable, /tableId="incoming"/);
    assert.match(linesTable, /tableId=\{isIncomingMode \? 'incoming' : 'receiving'\}/);
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
