/**
 * The receiving searcher's statement must bind exactly the `$n` it references:
 * node-pg sends parameters untyped, so Postgres rejects an unreferenced one
 * ("could not determine data type of parameter $n") and the whole receiving
 * arm silently returned nothing for order-number pastes.
 * Run: node --test --require ./scripts/register-server-only-shim.cjs --import tsx src/lib/search/global-entity-search.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import { buildReceivingSearchSql } from './global-entity-search';
import { looksLikeIdentifier } from './search-hit';

const ORG = '00000000-0000-0000-0000-0000000000c1' as OrgId;

function referencedPlaceholders(text: string): number[] {
  const seen = new Set<number>();
  for (const m of text.matchAll(/\$(\d+)(?!\d)/g)) seen.add(Number(m[1]));
  return [...seen].sort((a, b) => a - b);
}

const CASES: Array<[label: string, query: string, identifier: boolean]> = [
  ['Amazon order number', '114-1234567-1234567', true],
  ['eBay order number', '12-34567-89012', true],
  ['UPS tracking paste', '1Z999AA10123456784', true],
  ['USPS tracking paste', '9400111899560000000000', true],
  ['free text', 'bose wave', false],
];

for (const [label, query, identifier] of CASES) {
  test(`receiving search binds exactly the placeholders it references: ${label}`, () => {
    assert.equal(looksLikeIdentifier(query), identifier, 'fixture lands in the intended branch');
    const { text, params } = buildReceivingSearchSql(ORG, query, 10);
    assert.deepEqual(
      referencedPlaceholders(text),
      params.map((_, i) => i + 1),
      'every bound parameter is referenced and every reference is bound',
    );
    assert.ok(params.includes(ORG), 'explicit organization_id filter');
    assert.ok(params.includes(10), 'limit is bound');
  });
}
