import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrintFileParsedQuery } from '@/lib/label-prints/print-file-contracts';
import { labelIntakeFilesFacets } from './label-intake-files';

const COUNTS = { all: 12, 'not-printed': 7, partly: 3, printed: 2 };

test('Bulk facets read the file list statement with the list params, and paint the print-status counts', async () => {
  let asked: PrintFileParsedQuery | null = null;
  const body = await labelIntakeFilesFacets(
    new URLSearchParams('context=label-intake.uploads&printing=partly&sort=last-printed&q=invoice&from=2026-10-01&to=2026-10-06&printedFrom=2026-10-02&page=2'),
    async (query) => {
      asked = query;
      return COUNTS;
    },
  );
  assert.ok(asked);
  const query: PrintFileParsedQuery = asked;
  assert.equal(query.printing, 'partly');
  assert.equal(query.sort, 'last-printed');
  assert.equal(query.q, 'invoice');
  assert.equal(query.from, '2026-10-01');
  assert.equal(query.to, '2026-10-06');
  assert.equal(query.printedFrom, '2026-10-02');
  assert.equal(body.context, 'label-intake.uploads');
  // The list's total under every filter: the lit status's own count.
  assert.equal(body.total, 3);
  assert.deepEqual(
    body.groups.map((group) => [group.param, group.options.map((option) => `${option.value}:${option.count}`)]),
    [['printing', ['not-printed:7', 'partly:3', 'printed:2']]],
  );
});

test('with no print status the total is every file under the other filters', async () => {
  const body = await labelIntakeFilesFacets(new URLSearchParams('q=x'), async () => COUNTS);
  assert.equal(body.total, 12);
});

test('a malformed Bulk param offers nothing rather than counting the wrong population', async () => {
  const body = await labelIntakeFilesFacets(new URLSearchParams('printing=bogus'), async () => {
    throw new Error('must not read');
  });
  assert.equal(body.total, 0);
  assert.ok(body.groups.every((group) => group.options.length === 0));
});
