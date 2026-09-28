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

test('Law 4: an industrial hide variant is flagged anywhere; an industrial restyle is not', () => {
  assert.deepEqual(laws('src/features/a/B.tsx', `<div className="industrial:hidden" />`), [4]);
  assert.deepEqual(laws('src/features/a/B.tsx', `<div className="industrial:invisible" />`), [4]);
  assert.deepEqual(laws('src/features/a/B.tsx', `<div className="industrial:p-0 industrial:font-mono" />`), []);
  assert.deepEqual(laws('src/features/a/B.test.tsx', `<div className="industrial:hidden" />`), []);
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
  const [law4File] = Object.keys(LAYER_LAW_ALLOWLIST[4]);
  const hits = [
    { law: 4 as const, file: law4File!, line: 1, text: 'industrial:hidden' },
    { law: 4 as const, file: 'src/components/new/Fresh.tsx', line: 3, text: 'industrial:hidden' },
  ];
  const { violations, allowed, stale } = judgeLayerLaws(hits);
  assert.deepEqual(violations.map((v) => v.file), ['src/components/new/Fresh.tsx']);
  assert.deepEqual(allowed.map((v) => v.file), [law4File]);
  // Every OTHER allowlisted file had no hit in this run, so each is reported stale.
  const expectedStale = ([3, 4, 5] as const).flatMap((law) =>
    Object.keys(LAYER_LAW_ALLOWLIST[law]).filter((f) => !(law === 4 && f === law4File)),
  );
  assert.equal(stale.length, expectedStale.length);
  assert.ok(!stale.some((s) => s.law === 4 && s.file === law4File));
});
