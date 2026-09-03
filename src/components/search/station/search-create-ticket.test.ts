import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(resolve(here, rel), 'utf8');

test('search receiving ticket leaf mounts the shared create-ticket host', () => {
  const pane = src('SearchReceivingStationPane.tsx');
  assert.match(pane, /TicketDisplayHost/);
  assert.match(pane, /claimMode="create"/);
  assert.match(pane, /id: 'ticket'/);
});

test('search order ticket leaf still uses SupportContextHub (create-empty lives there)', () => {
  const pane = src('SearchOrderStationPane.tsx');
  assert.match(pane, /SupportContextHub/);
  assert.match(pane, /onlySegment="customer"/);
});

test('SupportContextCustomer empty state is create-only, not a Link combobox', () => {
  const customer = src('../../support/context/SupportContextCustomer.tsx');
  assert.match(customer, /SupportCreateTicketModal/);
  assert.match(customer, /surface="inline"/);
  assert.doesNotMatch(customer, /TicketLinkPopover/);
  assert.doesNotMatch(customer, /label="Link ticket"/);
});
