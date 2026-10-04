/**
 * CLI face of the ROUTE-TREE LAW: every Warehouse URL, nav name and domain
 * word comes from `src/lib/nav/route-tree.ts` (owner 2026-10-03).
 *
 * The rules and queries live in `src/lib/nav/route-tree-law.ts`; this script
 * only gathers the file-system facts (page files, literal counts, baseline).
 * Consumers:
 *   1. verify `Routes` — `node_modules/.bin/tsx scripts/route-tree-guard.ts`.
 *   2. `ds_route` / `ds_vocabulary` / `ds_route_tree` — the MCP faces spawn
 *      `--json --mode route|vocabulary|tree --input <json>`.
 *   3. the SessionStart hook — `--digest`.
 *
 * Usage:
 *   tsx scripts/route-tree-guard.ts                    # checks, text
 *   tsx scripts/route-tree-guard.ts --json             # checks, { ok, findings, law }
 *   tsx scripts/route-tree-guard.ts --mode route --input '{"intent":"print a bay sticker"}'
 *   tsx scripts/route-tree-guard.ts --digest           # ≤25-line session summary
 *   tsx scripts/route-tree-guard.ts --write-baseline   # rewrite the literal-path baseline
 *
 * Exit 0 = the law holds (or a query answered). Exit 1 = errors, listed.
 * Exit 2 = the guard itself broke, which is never a verdict.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  ROUTE_TREE_LAW,
  WAREHOUSE_PAGE_DIRS,
  checkRouteTree,
  digest,
  formatRouteTreeFinding,
  isWarehousePathLiteral,
  literalPathPrefixes,
  literalScanApplies,
  resolveRoute,
  tree,
  vocabulary,
  type LiteralBaseline,
} from '../src/lib/nav/route-tree-law';

const REPO = path.resolve(__dirname, '..');
const BASELINE = 'scripts/route-tree-literals.baseline.json';
const argv = process.argv.slice(2);
const flag = (name: string) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};

function walk(dir: string, keep: (entry: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, keep, out);
    else if (keep(entry)) out.push(full);
  }
  return out;
}

const rel = (full: string) => path.relative(REPO, full).split(path.sep).join('/');

/** Per file: string / template literals that start with a live Warehouse path. */
function countLiterals(): Record<string, number> {
  const prefixes = literalPathPrefixes();
  const counts: Record<string, number> = {};
  for (const full of walk(path.join(REPO, 'src'), (entry) => /\.(ts|tsx)$/.test(entry))) {
    const file = rel(full);
    if (!literalScanApplies(file)) continue;
    const text = readFileSync(full, 'utf8');
    if (!prefixes.some((prefix) => text.includes(prefix))) continue;
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      false,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    let count = 0;
    const visit = (node: ts.Node) => {
      const literal =
        ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
          ? node.text
          : ts.isTemplateExpression(node)
            ? node.head.text
            : undefined;
      if (literal !== undefined && isWarehousePathLiteral(literal, prefixes)) count += 1;
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (count > 0) counts[file] = count;
  }
  return counts;
}

function readBaseline(): LiteralBaseline {
  const full = path.join(REPO, BASELINE);
  if (!existsSync(full)) return { files: {} };
  return JSON.parse(readFileSync(full, 'utf8')) as LiteralBaseline;
}

function writeBaseline(counts: Record<string, number>) {
  const files = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    path.join(REPO, BASELINE),
    `${JSON.stringify(
      {
        note: 'FROZEN BASELINE — Warehouse path literals outside src/lib/nav/route-tree.ts. SHRINK-ONLY: use WAREHOUSE_PATHS / the builders. Rewrite with `tsx scripts/route-tree-guard.ts --write-baseline`.',
        files,
      },
      null,
      2,
    )}\n`,
  );
  return Object.keys(files).length;
}

const json = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

try {
  const mode = flag('--mode');
  if (mode) {
    const raw = flag('--input');
    const input = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (mode === 'route') json(resolveRoute(input));
    else if (mode === 'vocabulary') json(vocabulary(input));
    else if (mode === 'tree') json(tree(input));
    else throw new Error(`unknown --mode ${mode} (route | vocabulary | tree)`);
    process.exit(0);
  }

  if (argv.includes('--digest')) {
    process.stdout.write(`${digest()}\n`);
    process.exit(0);
  }

  const literalCounts = countLiterals();
  if (argv.includes('--write-baseline')) {
    const n = writeBaseline(literalCounts);
    process.stdout.write(`route-tree-guard: baseline written — ${n} file(s), ${BASELINE}.\n`);
  }

  const pageFiles = WAREHOUSE_PAGE_DIRS.flatMap((dir) =>
    walk(path.join(REPO, dir), (entry) => entry === 'page.tsx').map(rel),
  );
  const findings = checkRouteTree({
    pageFiles,
    exists: (file) => existsSync(path.join(REPO, file)),
    literalCounts,
    baseline: readBaseline(),
  });
  const errors = findings.filter((f) => f.severity === 'error');

  if (argv.includes('--json')) {
    json({ ok: errors.length === 0, findings, law: ROUTE_TREE_LAW });
  } else if (findings.length === 0) {
    process.stdout.write('route-tree-guard: the route tree, the menu, the vocabulary and the literal baseline agree.\n');
  } else {
    process.stdout.write(
      `route-tree-guard: ${errors.length} error(s), ${findings.length - errors.length} advisory:\n` +
        `${findings.map((f) => `  ${formatRouteTreeFinding(f)}`).join('\n')}\n\n${ROUTE_TREE_LAW}\n`,
    );
  }
  process.exit(errors.length === 0 ? 0 : 1);
} catch (error) {
  process.stderr.write(`route-tree-guard failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(2);
}
