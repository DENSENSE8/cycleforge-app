/**
 * DATA TABLE INDUSTRIAL COHESION LAW.
 *
 * This module corrects a category error that used to live in `ds_critique`:
 * a file over 300 lines was reported as a design-system problem. File length
 * is a maintenance metric, not evidence of visual or architectural drift. A
 * canonical composition root can be long precisely because it prevents many
 * short, page-local forks.
 *
 * The industrial question is therefore not "how many lines?". It is:
 *
 * 1. Does one root own the toolbar, column header, body host and status strip?
 * 2. Do pages supply facts and callbacks instead of ReactNode chrome slots?
 * 3. Are domain row renderers the only deliberate behavior boundary?
 * 4. Can a presentational leaf be extracted without creating another public
 *    table API, another toolbar, or another column model?
 *
 * Split a leaf when the answer to #4 is yes. Never split merely to satisfy a
 * line threshold. Industrial longevity comes from rigid ownership and narrow
 * seams, not small files by themselves.
 *
 * ## One verdict, every harness
 *
 * `evaluateDataTableIndustrialSource` is a pure source-to-JSON adjudicator.
 * The unit tripwire, `scripts/data-table-industrial-guard.ts`, the
 * `ds_data_table` MCP face and `eval:cohort slot-table` all consume it. The
 * output contains no model score and needs no particular test runner, browser
 * or agent. Any harness that can execute the CLI or import this function gets
 * the same verdict.
 */

import ts from 'typescript';

export const DATA_TABLE_INDUSTRIAL_TARGET =
  'src/components/tables/DataTable.tsx' as const;

export const DATA_TABLE_INDUSTRIAL_LAW = {
  invariant:
    'Judge the canonical table by ownership and extension seams, never by line count: one root owns chrome and geometry; pages pass data; only domain rows render domain content.',
  length:
    'Line count is reported as a maintenance metric only. It is never, by itself, a design-system violation.',
  extraction:
    'Extract a presentational leaf only when it keeps the same root, the same public props, and the same chrome owner. A split that creates another table API is a fork.',
  industrial:
    'Industrial means rigid seams, continuous hairlines, predictable geometry, semantic type, and immediate state feedback—not one monolithic file and not many page-local grids.',
  portability:
    'The verdict is deterministic TypeScript AST analysis with versioned JSON; model judgments and harness-specific snapshots may annotate it but cannot replace it.',
} as const;

type SourceRequirement = {
  id: string;
  kind: 'jsx' | 'prop-type' | 'identifier';
  name: string;
  typeName?: string;
  minCount?: number;
  why: string;
};

type ForbiddenSeam = {
  id: string;
  propertyNames: readonly string[];
  why: string;
};

/** Construction seams that make the table one industrial instrument. */
export const DATA_TABLE_REQUIRED_SEAMS: readonly SourceRequirement[] = [
  {
    id: 'typed-binding',
    kind: 'prop-type',
    name: 'binding',
    typeName: 'TableSurfaceBinding',
    why: 'The table receives a typed data waist rather than page-owned geometry.',
  },
  {
    id: 'typed-actions',
    kind: 'prop-type',
    name: 'actions',
    typeName: 'DataTableToolbarAction',
    why: 'Toolbar verbs cross the waist as typed action data, never JSX.',
  },
  {
    id: 'one-search',
    kind: 'jsx',
    name: 'SearchField',
    why: 'The canonical root draws the one search control.',
  },
  {
    id: 'one-filter',
    kind: 'jsx',
    name: 'DataTableFilterMenu',
    why: 'The canonical root draws the always-mounted filter control.',
  },
  {
    id: 'one-column-header',
    kind: 'jsx',
    name: 'LedgerGridColumnHeader',
    why: 'The engine, not a page, paints column headers.',
  },
  {
    id: 'one-body-host',
    kind: 'jsx',
    name: 'NonlinearTableHost',
    why: 'All rows pass through the shared body host.',
  },
  {
    id: 'one-status-strip',
    kind: 'jsx',
    name: 'TableStatusBar',
    why: 'Counts and table state have one owned bottom strip.',
  },
  {
    id: 'idle-filter-face',
    kind: 'identifier',
    name: 'DATA_TABLE_FILTER_IDLE',
    minCount: 2,
    why: 'A family without facets still preserves toolbar geometry.',
  },
  {
    id: 'domain-row-boundary',
    kind: 'prop-type',
    name: 'renderRow',
    typeName: 'ReactNode',
    why: 'Domain content may render a row; it may not replace table chrome.',
  },
] as const;

/** Public seams that would let a page rebuild the instrument from slots. */
export const DATA_TABLE_FORBIDDEN_CHROME_SEAMS: readonly ForbiddenSeam[] = [
  {
    id: 'render-column-header-prop',
    propertyNames: ['renderColumnHeader'],
    why: 'A caller-supplied column header creates a second header system.',
  },
  {
    id: 'search-slot',
    propertyNames: ['searchSlot'],
    why: 'Search is data controlled; callers do not replace its face.',
  },
  {
    id: 'extra-controls-slot',
    propertyNames: ['extraControls'],
    why: 'Arbitrary toolbar nodes are how page-local chrome regrows.',
  },
  {
    id: 'toolbar-slot',
    propertyNames: ['toolbarSlot', 'toolbarContent', 'toolbarNode'],
    why: 'The engine owns the toolbar; callers pass typed action data.',
  },
  {
    id: 'header-slot',
    propertyNames: ['headerSlot', 'headerContent', 'headerNode'],
    why: 'Page and column headers have named owners outside caller JSX.',
  },
] as const;

/** Domain content, not chrome. Every other node-valued prop is a new escape hatch. */
export const DATA_TABLE_ALLOWED_NODE_SEAMS = {
  emptyState: 'first-run domain teaching content',
  searchEmptyState: 'domain no-match teaching content',
  bodyPrefix: 'domain content inside the scroll body',
  renderRow: 'domain row renderer',
  renderGroup: 'domain group renderer',
} as const;

export type DataTableIndustrialViolation = {
  id: string;
  kind: 'missing-owned-seam' | 'caller-chrome-seam' | 'untyped-node-seam';
  why: string;
};

export type DataTableIndustrialVerdict = {
  schemaVersion: 2;
  analysis: 'typescript-ast';
  ok: boolean;
  target: typeof DATA_TABLE_INDUSTRIAL_TARGET;
  law: typeof DATA_TABLE_INDUSTRIAL_LAW.invariant;
  lines: number;
  lineCountIsViolation: false;
  requiredSeams: readonly string[];
  forbiddenChromeSeams: readonly string[];
  violations: DataTableIndustrialViolation[];
};

function propertyName(node: ts.PropertySignature): string | null {
  const name = node.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function jsxTagName(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText();
}

type DataTableAst = {
  props: Map<string, ts.PropertySignature>;
  jsxTags: Set<string>;
  identifierCounts: Map<string, number>;
};

function inspectDataTableAst(source: string): DataTableAst {
  const file = ts.createSourceFile(
    DATA_TABLE_INDUSTRIAL_TARGET,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const props = new Map<string, ts.PropertySignature>();
  const jsxTags = new Set<string>();
  const identifierCounts = new Map<string, number>();

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'DataTableProps') {
      for (const member of node.members) {
        if (!ts.isPropertySignature(member)) continue;
        const name = propertyName(member);
        if (name) props.set(name, member);
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      jsxTags.add(jsxTagName(node));
    }
    if (ts.isIdentifier(node)) {
      identifierCounts.set(node.text, (identifierCounts.get(node.text) ?? 0) + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { props, jsxTags, identifierCounts };
}

function propertyTypeText(prop: ts.PropertySignature | undefined): string {
  return prop?.type?.getText() ?? '';
}

export function evaluateDataTableIndustrialSource(
  source: string,
): DataTableIndustrialVerdict {
  const violations: DataTableIndustrialViolation[] = [];
  const ast = inspectDataTableAst(source);

  for (const seam of DATA_TABLE_REQUIRED_SEAMS) {
    let present = false;
    if (seam.kind === 'jsx') present = ast.jsxTags.has(seam.name);
    if (seam.kind === 'identifier') {
      present = (ast.identifierCounts.get(seam.name) ?? 0) >= (seam.minCount ?? 1);
    }
    if (seam.kind === 'prop-type') {
      present = propertyTypeText(ast.props.get(seam.name)).includes(seam.typeName ?? '');
    }
    if (!present) {
      violations.push({ id: seam.id, kind: 'missing-owned-seam', why: seam.why });
    }
  }

  for (const seam of DATA_TABLE_FORBIDDEN_CHROME_SEAMS) {
    if (seam.propertyNames.some((name) => ast.props.has(name))) {
      violations.push({ id: seam.id, kind: 'caller-chrome-seam', why: seam.why });
    }
  }

  for (const [name, prop] of ast.props) {
    const type = propertyTypeText(prop);
    const nodeValued = /\bReactNode\b|\bJSX\.Element\b/.test(type);
    if (nodeValued && !(name in DATA_TABLE_ALLOWED_NODE_SEAMS)) {
      violations.push({
        id: `untyped-node-seam:${name}`,
        kind: 'untyped-node-seam',
        why: `${name} exposes ${type || 'a node'} through DataTableProps. Add a typed fact/callback contract, not a JSX escape hatch.`,
      });
    }
  }

  return {
    schemaVersion: 2,
    analysis: 'typescript-ast',
    ok: violations.length === 0,
    target: DATA_TABLE_INDUSTRIAL_TARGET,
    law: DATA_TABLE_INDUSTRIAL_LAW.invariant,
    lines: source.split('\n').length,
    lineCountIsViolation: false,
    requiredSeams: DATA_TABLE_REQUIRED_SEAMS.map((seam) => seam.id),
    forbiddenChromeSeams: DATA_TABLE_FORBIDDEN_CHROME_SEAMS.map((seam) => seam.id),
    violations,
  };
}
