import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditLayerSource, judgeLayerLaws, LAYER_LAW_ALLOWLIST } from './layer-law';

const laws = (file: string, text: string) => auditLayerSource(file, text).map((v) => v.law);

test('Law 3: a shared part comparing the route or a view key is flagged; building an href from it is not', () => {
  const part = 'src/design-system/components/Thing.tsx';
  assert.deepEqual(laws(part, "if (pathname === '/shipping/exceptions') return null;"), [3]);
  assert.deepEqual(laws(part, 'const incoming = pathname.startsWith(INCOMING);'), [3]);
  assert.deepEqual(laws(part, "const full = viewKey === 'shipping.shipped';"), [3]);
  assert.deepEqual(laws(part, 'router.replace(`${pathname}?${qs}`);'), []);
  // A page shell may route: Law 3 reads shared parts only.
  assert.deepEqual(laws('src/app/shipping/page.tsx', "if (pathname === '/x') redirect('/y');"), []);
});

test('Law 5: hand-rolled money and dates in outbound / receiving components are flagged; comments are not', () => {
  const part = 'src/components/outbound/orders/X.tsx';
  assert.deepEqual(laws(part, 'const face = `$${total.toFixed(2)}`;'), [5]);
  assert.deepEqual(laws(part, "return d.toLocaleDateString('en-US');"), [5]);
  assert.deepEqual(laws(part, 'const key = `${d.getFullYear()}-${d.getMonth() + 1}`;'), [5]);
  assert.deepEqual(laws(part, 'const face = formatCurrency(total);'), []);
  assert.deepEqual(laws(part, '// was: total.toFixed(2)'), []);
  assert.deepEqual(laws('src/lib/orders/money.ts', 'return n.toFixed(2);'), [], 'helpers outside components own formatting');
});

test('the allowlist is a burn-down: allowlisted hits pass, a new file fails, a cleaned file goes stale', () => {
  const [law3File] = Object.keys(LAYER_LAW_ALLOWLIST[3]);
  const hits = [
    { law: 3 as const, file: law3File!, line: 1, text: 'viewKey === "shipping.shipped"' },
    { law: 3 as const, file: 'src/design-system/components/Fresh.tsx', line: 3, text: 'pathname === "/x"' },
  ];
  const { violations, allowed, stale } = judgeLayerLaws(hits);
  assert.deepEqual(violations.map((v) => v.file), ['src/design-system/components/Fresh.tsx']);
  assert.deepEqual(allowed.map((v) => v.file), [law3File]);
  // Every OTHER allowlisted file had no hit in this run, so each is reported stale.
  const expectedStale = ([3, 5] as const).flatMap((law) =>
    Object.keys(LAYER_LAW_ALLOWLIST[law]).filter((f) => !(law === 3 && f === law3File)),
  );
  assert.equal(stale.length, expectedStale.length);
  assert.ok(!stale.some((s) => s.law === 3 && s.file === law3File));
});
