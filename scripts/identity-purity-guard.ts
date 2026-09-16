/**
 * `Identity purity` verify gate — column one is strictly machine handles.
 *
 * Same rule module as the Unit-tests gate
 * (`src/lib/tables/slot-table-identity-purity-law.ts`) and as the `ds_identity_purity` MCP
 * face, so the three can never disagree. It exists as its own `always` gate
 * for the reason `Id header`, `Nav names`, `Mobile-first` and `Action bar` do:
 * it is a source read (<1s), catching any drift at verification time.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BANNED_IDENTITY_PATH_PATTERNS,
  BANNED_IDENTITY_ROW_PROPERTIES,
  SLOT_TABLE_IDENTITY_PURITY_LAW,
  SLOT_TABLE_IDENTITY_PURITY_REFUSAL,
} from '../src/lib/tables/slot-table-identity-purity-law';

const REPO_ROOT = process.cwd();
const CATALOGS_DIR = join(REPO_ROOT, 'src/lib/tables/field-catalog');

function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const violations: string[] = [];

// 1. Scan field catalogs
const catalogFiles = readdirSync(CATALOGS_DIR).filter(
  (name) => name.endsWith('.ts') && name !== 'types.ts' && !name.includes('.test.'),
);

for (const file of catalogFiles) {
  const src = code(join(CATALOGS_DIR, file));
  const rawBlocks = src.split(/\n\s*\{/);
  for (const rawBlock of rawBlocks) {
    const block = rawBlock.split(/\n\s*\}/)[0];
    if (!/slotKinds:\s*\[[^\]]*'identity'[^\]]*\]/.test(block)) continue;

    const idMatch = /id:\s*['"]([^'"]+)['"]/.exec(block);
    const fieldId = idMatch ? idMatch[1] : file;

    const displayTypeMatch = /displayType:\s*['"]([^'"]+)['"]/.exec(block);
    if (displayTypeMatch && displayTypeMatch[1] !== 'id') {
      violations.push(
        `${file}: Field '${fieldId}' declares slotKinds: ['identity'] but displayType '${displayTypeMatch[1]}'. Must be 'id'.`,
      );
    }

    for (const pattern of BANNED_IDENTITY_PATH_PATTERNS) {
      if (pattern.test(block)) {
        violations.push(
          `${file}: Field '${fieldId}' identity definition contains banned human-attribution path matching ${pattern}.`,
        );
      }
    }
  }
}

// 2. Scan row view adapters (e.g. orders-compound-view.ts)
const ordersViewSrc = code(join(REPO_ROOT, 'src/lib/orders/orders-compound-view.ts'));
for (const prop of BANNED_IDENTITY_ROW_PROPERTIES) {
  if (new RegExp(`orderId:\\s*[^,\\n]*\\b${prop}\\b`).test(ordersViewSrc)) {
    violations.push(`orders-compound-view.ts maps '${prop}' directly to 'orderId'.`);
  }
  if (new RegExp(`identityFace:\\s*[^,\\n]*\\b${prop}\\b`).test(ordersViewSrc)) {
    violations.push(`orders-compound-view.ts maps '${prop}' directly to 'identityFace'.`);
  }
}

const asJson = process.argv.includes('--json');

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok: violations.length === 0,
        law: SLOT_TABLE_IDENTITY_PURITY_LAW,
        refusal: SLOT_TABLE_IDENTITY_PURITY_REFUSAL,
        catalogCount: catalogFiles.length,
        violations,
      },
      null,
      2,
    ),
  );
  process.exit(violations.length === 0 ? 0 : 1);
}

console.log(
  `identity-purity-guard: checked ${catalogFiles.length} field catalogs and core row adapters.`,
);

if (violations.length > 0) {
  console.error('\nIDENTITY PURITY LAW VIOLATION — src/lib/tables/slot-table-identity-purity-law.ts\n');
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error(`\n  ${SLOT_TABLE_IDENTITY_PURITY_REFUSAL}\n`);
  process.exit(1);
}

console.log('identity columns strictly contain machine identifiers; no human names found.');
