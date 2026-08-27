import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLinkageProviderTicketId } from './linkage-provider-ticket-id';
import type { SupportContextBundle } from '@/lib/support/context-types';

function bundle(
  partial: Pick<SupportContextBundle, 'ticket' | 'anchor'>,
): Pick<SupportContextBundle, 'ticket' | 'anchor'> {
  return partial;
}

test('resolveLinkageProviderTicketId: registry providerTicketId wins', () => {
  assert.equal(
    resolveLinkageProviderTicketId(
      bundle({
        ticket: {
          id: 12,
          label: '#12',
          provider: 'zendesk',
          externalTicketId: '9061',
          providerTicketId: 9061,
          providerLabel: 'Zendesk',
          openUrl: null,
          subject: null,
          status: null,
        },
        anchor: { type: 'ticket', id: '9999', label: '#9999' },
      }),
    ),
    9061,
  );
});

test('resolveLinkageProviderTicketId: ticket-anchor digits when registry ticket is null', () => {
  assert.equal(
    resolveLinkageProviderTicketId(
      bundle({
        ticket: null,
        anchor: { type: 'ticket', id: '9061', label: '#9061' },
      }),
    ),
    9061,
  );
});

test('resolveLinkageProviderTicketId: strips leading # from anchor id', () => {
  assert.equal(
    resolveLinkageProviderTicketId(
      bundle({
        ticket: null,
        anchor: { type: 'ticket', id: '#4821', label: '#4821' },
      }),
    ),
    4821,
  );
});

test('resolveLinkageProviderTicketId: non-ticket anchor → null', () => {
  assert.equal(
    resolveLinkageProviderTicketId(
      bundle({
        ticket: null,
        anchor: { type: 'receiving', id: 88, label: 'Carton #88' },
      }),
    ),
    null,
  );
});

test('resolveLinkageProviderTicketId: invalid ticket-anchor id → null', () => {
  assert.equal(
    resolveLinkageProviderTicketId(
      bundle({
        ticket: null,
        anchor: { type: 'ticket', id: 'not-a-number', label: 'x' },
      }),
    ),
    null,
  );
  assert.equal(
    resolveLinkageProviderTicketId(
      bundle({
        ticket: null,
        anchor: { type: 'ticket', id: '0', label: '#0' },
      }),
    ),
    null,
  );
});

test('resolveLinkageProviderTicketId: rejects non-positive registry id', () => {
  assert.equal(
    resolveLinkageProviderTicketId(
      bundle({
        ticket: {
          id: 1,
          label: '#1',
          provider: 'zendesk',
          externalTicketId: '0',
          providerTicketId: 0,
          providerLabel: 'Zendesk',
          openUrl: null,
          subject: null,
          status: null,
        },
        anchor: { type: 'ticket', id: '55', label: '#55' },
      }),
    ),
    55,
  );
});
