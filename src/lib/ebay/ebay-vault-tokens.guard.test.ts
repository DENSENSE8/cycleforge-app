import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

/**
 * Guard: eBay user tokens must not be written to ebay_accounts columns.
 * SoT is organization_integrations (scoped seller:/buyer:) after the vault
 * migration (INT-001). Fails if src/ gains INSERT/UPDATE of
 * ebay_accounts.access_token / refresh_token.
 *
 * Escape: `ebay-vault-allow-token-col` on the same line or the line above.
 */

const SRC_ROOT = join(process.cwd(), 'src');
const ESCAPE_MARKER = 'ebay-vault-allow-token-col';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

function lineHasEscape(lines: string[], idx: number): boolean {
  const cur = lines[idx] ?? '';
  const prev = lines[idx - 1] ?? '';
  return cur.includes(ESCAPE_MARKER) || prev.includes(ESCAPE_MARKER);
}

test('ebay vault: no ebay_accounts access_token/refresh_token writes in src/', () => {
  const files = walk(SRC_ROOT);
  const violations: string[] = [];

  for (const file of files) {
    const rel = relative(process.cwd(), file);
    if (rel.includes('ebay-vault-tokens.guard')) continue;

    const text = readFileSync(file, 'utf8');
    if (!/ebay_accounts/i.test(text)) continue;

    // Multi-line INSERT INTO ebay_accounts ( ... access_token ... )
    if (
      /INSERT\s+INTO\s+ebay_accounts\s*\([\s\S]*?\b(access_token|refresh_token)\b/i.test(text) &&
      !text.includes(ESCAPE_MARKER)
    ) {
      violations.push(`${rel}: INSERT INTO ebay_accounts lists access_token/refresh_token`);
    }

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const window = lines.slice(Math.max(0, i - 8), i + 1).join('\n');
      if (!/ebay_accounts/i.test(window)) continue;
      if (lineHasEscape(lines, i)) continue;
      const line = lines[i];
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;

      if (
        /SET\s+access_token\s*=/i.test(line) ||
        /SET\s+refresh_token\s*=/i.test(line) ||
        (/access_token\s*=\s*\$/i.test(line) && /UPDATE\s+ebay_accounts/i.test(window)) ||
        (/refresh_token\s*=\s*\$/i.test(line) && /UPDATE\s+ebay_accounts/i.test(window))
      ) {
        violations.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `eBay vault regression — write tokens to organization_integrations, not ebay_accounts:\n${violations.join('\n')}`,
  );
});
