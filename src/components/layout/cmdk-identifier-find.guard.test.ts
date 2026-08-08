/**
 * Source guard: ⌘K identifier find mode — when `looksLikeIdentifier`, CommandBar
 * hides spine nav / child pages and commits via the shared find helper.
 *
 * Run: node --test --import tsx \
 *        src/components/layout/cmdk-identifier-find.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const cmdk = readFileSync(join(ROOT, 'src/components/CommandBar.tsx'), 'utf8');

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const code = stripComments(cmdk);

test('CommandBar gates find mode on looksLikeIdentifier', () => {
  assert.match(code, /looksLikeIdentifier\(trimmedQuery\)/);
  assert.match(code, /const findMode\s*=/);
});

test('find mode suppresses nav + child pages', () => {
  assert.match(code, /const showNavGroups\s*=\s*!findMode/);
  assert.match(code, /showNavGroups\s*&&/);
  assert.match(code, /showNavGroups\s*&&\s*filteredChildPages/);
});

test('find mode reuses SearchResultRow + groupHitsForPreview + commitIdentifierFind', () => {
  assert.match(code, /SearchResultRow/);
  assert.match(code, /groupHitsForPreview/);
  assert.match(code, /commitIdentifierFind/);
  assert.match(code, /hrefForPreviewHit/);
  // Identifier See-all must NOT dump to the orders board search param.
  const findBlock = code.match(/showFindTriage\s*&&\s*\([\s\S]*?showSearchGroup/)?.[0];
  assert.ok(findBlock, 'expected find triage render block');
  assert.doesNotMatch(
    findBlock,
    /\/shipping\/orders\?search=/,
    'find mode See-all must not route to /shipping/orders?search=',
  );
  assert.match(findBlock, /commitFindIdentifier|commitIdentifierFind/);
});

test('shared commit helper is the SoT for resolve + cache seed', () => {
  const helper = readFileSync(
    join(ROOT, 'src/lib/search/commit-identifier-find.ts'),
    'utf8',
  );
  assert.match(helper, /export async function commitIdentifierFind/);
  assert.match(helper, /resolveSearchOrder/);
  assert.match(helper, /setSearchOrderResolveCache/);
  assert.match(helper, /orderRecordHref/);
});
