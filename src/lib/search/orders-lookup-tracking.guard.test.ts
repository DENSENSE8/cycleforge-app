/**
 * Ratchet: order lookup must resolve carrier tracking (header-search paste
 * commits identifiers via resolveSearchOrder → /api/orders/lookup). order_id-only
 * lookup left tracking pastes on the results list instead of opening detail.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('orders lookup tracking resolve', () => {
  const src = readRepo('src/app/api/orders/lookup/[orderId]/route.ts');
  const find = readRepo('src/components/search/GlobalFindCombobox.tsx');
  const field = readRepo('src/design-system/primitives/SearchField.tsx');

  it('falls back to findOrderByTrackingKey when order_id misses', () => {
    assert.match(src, /findOrderByTrackingKey/);
    assert.match(src, /byTracking/);
    assert.match(src, /loadOrderDetailByOrderId/);
    assert.match(src, /loadOrderDetailById/);
  });

  it('header paste commits via onSearch → commitIdentifierFind', () => {
    assert.match(field, /flushValue\(trimmed, Boolean\(onSearch\)\)/);
    assert.match(find, /onSearch=\{handleSearchSubmit\}/);
    assert.match(find, /commitIdentifierFind\(queryClient,\s*trimmed\)/);
    // Shared SoT still resolves + seeds cache — never a twin path in the host.
    const commit = readRepo('src/lib/search/commit-identifier-find.ts');
    assert.match(commit, /resolveSearchOrder/);
    assert.match(commit, /setSearchOrderResolveCache/);
    assert.match(commit, /orderRecordHref\(resolved\.order\.id\)/);
  });
});
