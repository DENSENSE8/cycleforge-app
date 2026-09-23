import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  DATA_TABLE_INDUSTRIAL_LAW,
  DATA_TABLE_INDUSTRIAL_TARGET,
  evaluateDataTableIndustrialSource,
} from './data-table-industrial-law';

describe('DataTable industrial cohesion law', () => {
  it('keeps the canonical table green without treating its length as a defect', () => {
    const source = readFileSync(DATA_TABLE_INDUSTRIAL_TARGET, 'utf8');
    const verdict = evaluateDataTableIndustrialSource(source);

    assert.equal(verdict.ok, true, JSON.stringify(verdict.violations, null, 2));
    assert.equal(verdict.lineCountIsViolation, false);
    assert.ok(verdict.lines > 300, 'the regression only proves the correction on a long root');
  });

  it('fails a missing owned seam', () => {
    const source = `${readFileSync(DATA_TABLE_INDUSTRIAL_TARGET, 'utf8').replace(
      /<TableStatusBar\b/,
      '<RemovedStatusBar',
    )}\n// <TableStatusBar /> in a comment must not satisfy the seam`;
    const verdict = evaluateDataTableIndustrialSource(source);

    assert.equal(verdict.ok, false);
    assert.ok(verdict.violations.some((v) => v.id === 'one-status-strip'));
  });

  it('fails a caller-owned chrome slot', () => {
    const source = readFileSync(DATA_TABLE_INDUSTRIAL_TARGET, 'utf8').replace(
      /export interface DataTableProps<Row, K extends string, C extends LedgerGridColumnModel> \{/,
      '$&\n  extraControls?: ReactNode;',
    );
    const verdict = evaluateDataTableIndustrialSource(source);

    assert.equal(verdict.ok, false);
    assert.ok(verdict.violations.some((v) => v.id === 'extra-controls-slot'));
  });

  it('ignores forbidden words in comments, strings, and JSX attribute values', () => {
    const source = `${readFileSync(DATA_TABLE_INDUSTRIAL_TARGET, 'utf8')}\n` +
      `// extraControls?: ReactNode\nconst diagnostic = "headerSlot";\n` +
      `const probe = <div data-debug-label="toolbarSlot" />;`;
    const verdict = evaluateDataTableIndustrialSource(source);

    assert.equal(verdict.ok, true, JSON.stringify(verdict.violations, null, 2));
  });

  it('refuses an unnamed ReactNode escape hatch outside the domain-content allowlist', () => {
    const source = readFileSync(DATA_TABLE_INDUSTRIAL_TARGET, 'utf8').replace(
      /export interface DataTableProps<Row, K extends string, C extends LedgerGridColumnModel> \{/,
      '$&\n  footerDecoration?: ReactNode;',
    );
    const verdict = evaluateDataTableIndustrialSource(source);

    assert.equal(verdict.ok, false);
    assert.ok(verdict.violations.some((v) => v.id === 'untyped-node-seam:footerDecoration'));
  });

  it('pins actions to the typed discriminator array', () => {
    const source = readFileSync(DATA_TABLE_INDUSTRIAL_TARGET, 'utf8').replace(
      'actions?: readonly DataTableToolbarAction[];',
      'actions?: ReactNode;',
    );
    const verdict = evaluateDataTableIndustrialSource(source);

    assert.equal(verdict.ok, false);
    assert.ok(verdict.violations.some((v) => v.id === 'typed-actions'));
    assert.ok(verdict.violations.some((v) => v.id === 'untyped-node-seam:actions'));
  });

  it('states a harness-independent law', () => {
    assert.match(DATA_TABLE_INDUSTRIAL_LAW.portability, /deterministic TypeScript AST analysis/);
    assert.match(DATA_TABLE_INDUSTRIAL_LAW.length, /never, by itself/);
  });
});
