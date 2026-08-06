/**
 * Search order feedback must stay a sibling shell — never import the desk
 * inspector or the durable `/o` record body (D2 demolition).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const FEEDBACK = 'src/components/search/order-feedback/SearchOrderFeedback.tsx';

const FORBIDDEN_IMPORTS = [
  /from\s+['"][^'"]*ShippedDetailsPanel['"]/,
  /from\s+['"][^'"]*ShippedDetailsBody['"]/,
  /from\s+['"][^'"]*OrderRecordBody['"]/,
  /from\s+['"][^'"]*OrderFullPageView['"]/,
  /from\s+['"]@\/components\/shipped['"]/,
] as const;

describe('search order feedback shell', () => {
  it('does not import desk inspector or durable record shells', () => {
    const source = readFileSync(path.join(ROOT, FEEDBACK), 'utf8');
    for (const pattern of FORBIDDEN_IMPORTS) {
      assert.doesNotMatch(
        source,
        pattern,
        `${FEEDBACK} must not import via ${pattern}`,
      );
    }
    assert.match(
      source,
      /export function SearchOrderFeedback/,
      `${FEEDBACK} exports SearchOrderFeedback`,
    );
  });
});
