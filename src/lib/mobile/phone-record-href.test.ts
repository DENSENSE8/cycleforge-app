import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchOrderFeedbackHref } from '@/lib/search/search-hit';
import { phoneRecordHref } from './phone-record-href';

test('a located order opens its phone hub by row id, returning to the job it came from', () => {
  assert.equal(phoneRecordHref(searchOrderFeedbackHref(4471), '/m/work'), '/m/orders/4471?by=id&back=%2Fm%2Fwork');
});

test('a record with no phone twin keeps its desk href', () => {
  assert.equal(phoneRecordHref('/incoming?recon=received&ref_in=PO-1', '/m/work'), '/incoming?recon=received&ref_in=PO-1');
  assert.equal(phoneRecordHref('/search?sel=receiving:12', '/m/work'), '/search?sel=receiving:12');
});
