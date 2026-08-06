/**
 * Search order feedback must stay a sibling shell — never import the desk
 * inspector or the durable `/o` record body (D2 demolition).
 *
 * Scans every module under `order-feedback/` so new column siblings stay honest.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const FEEDBACK_DIR = 'src/components/search/order-feedback';

const FORBIDDEN_IMPORTS = [
  /from\s+['"][^'"]*ShippedDetailsPanel['"]/,
  /from\s+['"][^'"]*ShippedDetailsBody['"]/,
  /from\s+['"][^'"]*OrderRecordBody['"]/,
  /from\s+['"][^'"]*OrderFullPageView['"]/,
  /from\s+['"]@\/components\/shipped['"]/,
] as const;

function listTsFiles(dirAbs: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dirAbs)) {
    const abs = path.join(dirAbs, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...listTsFiles(abs));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) {
      out.push(abs);
    }
  }
  return out;
}

describe('search order feedback shell', () => {
  it('reads the shared resolve cache (no page-local SearchPendingBar shell)', () => {
    const source = readFileSync(path.join(ROOT, FEEDBACK_DIR, 'SearchOrderFeedback.tsx'), 'utf8');
    assert.match(source, /searchOrderResolveQuery/);
    assert.doesNotMatch(
      source,
      /SearchPendingBar/,
      'feedback must not paint a gray page-local pending bar — header owns the pulse',
    );
    assert.doesNotMatch(source, /resolveSearchOrder\(/);
  });

  it('does not import desk inspector or durable record shells from any feedback module', () => {
    const files = listTsFiles(path.join(ROOT, FEEDBACK_DIR));
    assert.ok(files.length > 0, `expected modules under ${FEEDBACK_DIR}`);
    for (const abs of files) {
      const rel = path.relative(ROOT, abs);
      const source = readFileSync(abs, 'utf8');
      for (const pattern of FORBIDDEN_IMPORTS) {
        assert.doesNotMatch(
          source,
          pattern,
          `${rel} must not import via ${pattern}`,
        );
      }
    }
  });
});
