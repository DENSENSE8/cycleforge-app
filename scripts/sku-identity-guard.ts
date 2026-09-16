/**
 * CLI face of the SKU identity law: **one SKU, one title, one photo** — the
 * Zoho item governs, the exact org-scoped join reaches it, and no platform
 * sync overwrites what Zoho owns (operator 2026-09-15).
 *
 * The rule lives in `src/lib/sku/sku-identity-law.ts` — ONE module, three
 * consumers, the shape `tools/design-mcp/server.mjs` demands of a law:
 *
 *   1. `sku-identity-law.test.ts` — the hard gate (verify's *Unit tests*).
 *   2. this script — `node_modules/.bin/tsx scripts/sku-identity-guard.ts [--json]`.
 *   3. `ds_sku_identity` — the MCP face, which spawns this script exactly as
 *      `ds_nav_names` spawns `nav-name-guard.ts`.
 *
 * `always` gate for the same reason as `Nav names` / `Id header`: it is a
 * source read (<1s), and the increment that breaks it — hand-writing a
 * `sku_catalog` join on a new surface, or reaching for the deleted similarity
 * guard — is exactly the increment that runs `verify:fast`.
 *
 * Exit 0 = the law holds. Exit 1 = violations, listed. Exit 2 = the guard
 * itself broke, which is never a verdict.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  auditSkuIdentitySource,
  formatSkuIdentityViolation,
  SKU_IDENTITY_REFUSAL,
  type SkuIdentityViolation,
} from '../src/lib/sku/sku-identity-law';

const asJson = process.argv.includes('--json');
const REPO = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

try {
  const files = walk(path.join(REPO, 'src'));
  const violations: SkuIdentityViolation[] = [];
  for (const full of files) {
    const rel = path.relative(REPO, full);
    const text = readFileSync(full, 'utf8');
    // Cheap pre-filter: the scan only has verdicts for files that mention the
    // catalog table or the marketplace title field at all.
    if (!/sku_catalog|catalog_product_title/.test(text)) continue;
    violations.push(...auditSkuIdentitySource(rel, text));
  }

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        { ok: violations.length === 0, violations, law: SKU_IDENTITY_REFUSAL },
        null,
        2,
      )}\n`,
    );
  } else if (violations.length === 0) {
    process.stdout.write(
      `sku-identity-guard: ${files.length} files scanned, no identity violations.\n`,
    );
  } else {
    process.stdout.write(
      `sku-identity-guard: ${violations.length} violation(s):\n` +
        `${violations.map((v) => `  ${formatSkuIdentityViolation(v)}`).join('\n')}\n\n` +
        `${SKU_IDENTITY_REFUSAL}\n`,
    );
  }

  process.exit(violations.length === 0 ? 0 : 1);
} catch (error) {
  process.stderr.write(`sku-identity-guard failed: ${String(error)}\n`);
  process.exit(2);
}
