import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIdentifyLine, splitIdentifyBatch, typoVariants, type ExactProbe } from './classify';
import { IDENTIFY_MAX_LINES } from './schema';

const probe = (probes: ExactProbe[], kind: ExactProbe['kind']) => probes.filter((p) => p.kind === kind);

test('an Amazon order number probes orders with the marketplace prior and is never read as GS1 or tracking', () => {
  const line = classifyIdentifyLine('113-4638555-9983448');
  assert.deepEqual(probe(line.probes, 'order_id').map((p) => [p.value, p.prior]), [['113-4638555-9983448', 0.97]]);
  assert.equal(probe(line.probes, 'gtin').length, 0);
  assert.equal(probe(line.probes, 'tracking').length, 0);
  assert.equal(line.tokens[0].kinds.includes('gs1'), false);
});

test('a 12-digit number with a valid check digit is a GTIN (every stored width) as well as an ambiguous tracking shape', () => {
  const line = classifyIdentifyLine('012345678905');
  assert.deepEqual(
    probe(line.probes, 'gtin').map((p) => p.value).sort(),
    ['00012345678905', '0012345678905', '012345678905'],
  );
  assert.equal(probe(line.probes, 'tracking')[0].prior < probe(line.probes, 'gtin')[0].prior, true);
  assert.equal(line.machineIdentifier, true);
});

test('a 12-digit number with a wrong check digit is not a GTIN', () => {
  assert.equal(probe(classifyIdentifyLine('012345678906').probes, 'gtin').length, 0);
});

test('a UPS tracking number is a machine identifier with a strong tracking prior', () => {
  const line = classifyIdentifyLine('1ZJ22B104222265576');
  assert.deepEqual(probe(line.probes, 'tracking').map((p) => [p.value, p.prior]), [['1ZJ22B104222265576', 0.98]]);
  // A carrier-unique shape is probed as nothing else.
  assert.equal(line.probes.length, 1);
  assert.equal(line.machineIdentifier, true);
});

test('an FNSKU probes fba_fnskus with certainty', () => {
  const [fnsku] = probe(classifyIdentifyLine('x005bhurxx').probes, 'fnsku');
  assert.deepEqual([fnsku.value, fnsku.prior, fnsku.field], ['X005BHURXX', 1, 'fnsku']);
});

test('printed handles resolve to their key, integers canonical', () => {
  assert.deepEqual(classifyIdentifyLine('R-1970').probes.map((p) => [p.kind, p.value, p.field]), [
    ['receiving_id', '1970', 'handle'],
  ]);
  const unit = classifyIdentifyLine('U-0123').probes;
  assert.deepEqual(probe(unit, 'unit_id').map((p) => p.value), ['123']);
  assert.deepEqual(classifyIdentifyLine('T-9395').probes.map((p) => [p.kind, p.value]), [['ticket', '9395']]);
});

test('a GS1 Digital Link and an element string probe their GTIN / serial', () => {
  const link = classifyIdentifyLine('https://id.gs1.org/01/00012345678905');
  assert.equal(link.tokens[0].kinds[0], 'digital_link');
  assert.ok(probe(link.probes, 'gtin').some((p) => p.value === '00012345678905' && p.field === 'digital_link'));

  const element = classifyIdentifyLine('(01)00012345678905(21)sn-1');
  assert.deepEqual(probe(element.probes, 'serial').map((p) => [p.value, p.field]), [['SN-1', 'gs1']]);
});

test('words: grades become a condition filter and leave the search words; weak shapes stay words', () => {
  const line = classifyIdentifyLine('bose 700 used');
  assert.deepEqual(line.words, ['bose', '700']);
  assert.deepEqual(line.conditions, ['USED_A', 'USED_B', 'USED_C']);
  assert.equal(line.probes.length, 0);
  assert.equal(line.machineIdentifier, false);

  assert.deepEqual(classifyIdentifyLine('jbl flip like new').conditions, ['LIKE_NEW']);
  assert.deepEqual(classifyIdentifyLine('speaker grade b').conditions, ['USED_B']);
  // A lone word is the thing searched for, not a grade.
  assert.deepEqual(classifyIdentifyLine('new').conditions, []);
});

test('a strong identifier inside a sentence is still probed', () => {
  const line = classifyIdentifyLine('order 113-4638555-9983448');
  assert.deepEqual(probe(line.probes, 'order_id').map((p) => p.value), ['113-4638555-9983448']);
  // The plain word gets no probes at all.
  assert.equal(line.probes.every((p) => p.token !== 'order'), true);
});

test('batch: one identifier per line, blanks and case-insensitive repeats dropped, whitespace collapsed', () => {
  assert.deepEqual(splitIdentifyBatch('R-1\r\n\n  r-1 \nbose   700\rX005BHURXX\n'), {
    lines: ['R-1', 'bose 700', 'X005BHURXX'],
    truncated: false,
  });
});

test('batch: the GS1 separator survives inside a line', () => {
  const { lines } = splitIdentifyBatch('0100012345678905\x1D10LOT\n');
  assert.deepEqual(lines, ['0100012345678905\x1D10LOT']);
});

test('batch: capped at the line limit, and says so', () => {
  const paste = Array.from({ length: IDENTIFY_MAX_LINES + 3 }, (_, i) => `SKU-${i}`).join('\n');
  const { lines, truncated } = splitIdentifyBatch(paste);
  assert.equal(lines.length, IDENTIFY_MAX_LINES);
  assert.equal(truncated, true);
  // Repeats past the cap do not count as dropped lines.
  assert.equal(splitIdentifyBatch(`${paste.split('\n').slice(0, IDENTIFY_MAX_LINES).join('\n')}\nsku-0`).truncated, false);
});

test('typo variants reach a transposed brand and leave identifiers alone', () => {
  const variants = typoVariants('bsoe');
  assert.ok(variants.includes('bose'));
  assert.ok(!variants.includes('bsoe'));
  assert.ok(typoVariants('guitr').includes('guitar'));
  assert.deepEqual(typoVariants('jbl'), []);
  assert.deepEqual(typoVariants('x100'), []);
});
