/**
 * Support ticket display-label resolution for the station identity mark.
 *
 *   node --import tsx --test src/lib/support/ticket-display-label.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSupportTicketDisplayLabel } from './ticket-refs';

test('resolveSupportTicketDisplayLabel prefers provider external id over registry label', () => {
  assert.equal(
    resolveSupportTicketDisplayLabel({
      id: 9590,
      label: '#9590',
      provider: 'zendesk',
      externalTicketId: '175',
      providerTicketId: 175,
      fallbackId: 175,
    }),
    '#175',
  );
});

test('resolveSupportTicketDisplayLabel uses providerTicketId when external string missing', () => {
  assert.equal(
    resolveSupportTicketDisplayLabel({
      id: 9590,
      label: '#9590',
      provider: 'zendesk',
      externalTicketId: null,
      providerTicketId: 175,
      fallbackId: 175,
    }),
    '#175',
  );
});

test('resolveSupportTicketDisplayLabel falls back to URL id while bundle loads', () => {
  assert.equal(
    resolveSupportTicketDisplayLabel({ fallbackId: 175 }),
    '#175',
  );
});

test('resolveSupportTicketDisplayLabel uses label when it is not the registry id', () => {
  assert.equal(
    resolveSupportTicketDisplayLabel({
      id: 9590,
      label: '#42',
      provider: 'internal',
      externalTicketId: null,
      providerTicketId: null,
      fallbackId: 175,
    }),
    '#42',
  );
});
