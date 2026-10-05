import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { HelpdeskProvider } from '@/lib/integrations/helpdesk';
import { mirrorBridgeSuppressed } from './mirror-bridge';
import { resolveSupportTransport, sendSupportReplyViaTransport, type SupportTransportDeps } from './transport';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

test('resolution table', () => {
  const zd = resolveSupportTransport({ channel: 'zendesk', externalTicketId: '48120' });
  assert.equal(zd.connected, true);
  assert.equal(zd.label, 'Zendesk');
  assert.match(zd.openUrl ?? '', /\/agent\/tickets\/48120$/);
  assert.equal(zd.marketplacePolicy, false);

  const zdOff = resolveSupportTransport({ channel: 'zendesk', externalTicketId: '48120', helpdeskConfigured: false });
  assert.equal(zdOff.connected, false);
  assert.match(zdOff.openUrl ?? '', /48120/);

  assert.equal(resolveSupportTransport({ channel: 'zendesk', externalTicketId: null }).connected, false);
  assert.equal(resolveSupportTransport({ channel: 'zendesk', externalTicketId: 'abc' }).connected, false);

  const ebayAdmin = resolveSupportTransport({
    channel: 'ebay',
    externalTicketId: 'C-1',
    primaryOrderAdminUrl: 'https://ops.example/o/1',
    orderNumber: '16-14873-30704',
  });
  assert.deepEqual(ebayAdmin, {
    connected: false,
    channel: 'ebay',
    label: 'eBay',
    openUrl: 'https://ops.example/o/1',
    marketplacePolicy: true,
    maxLength: 2000,
  });
  assert.equal(
    resolveSupportTransport({ channel: 'ebay', externalTicketId: null, orderNumber: '16-14873-30704' }).openUrl,
    'https://www.ebay.com/mesh/ord/details?orderid=16-14873-30704',
  );
  assert.equal(resolveSupportTransport({ channel: 'ebay', externalTicketId: null }).openUrl, null);

  const amazon = resolveSupportTransport({ channel: 'amazon', externalTicketId: null, orderNumber: '111-1234567-1234567' });
  assert.equal(amazon.openUrl, 'https://sellercentral.amazon.com/orders-v3/order/111-1234567-1234567');
  assert.equal(amazon.maxLength, 4000);
  assert.equal(amazon.connected, false);

  assert.equal(
    resolveSupportTransport({ channel: 'email', externalTicketId: null, requesterEmail: 'jo@example.com', subject: 'Remote' }).openUrl,
    'mailto:jo%40example.com?subject=Re%3A%20Remote',
  );
  assert.equal(resolveSupportTransport({ channel: 'email', externalTicketId: null }).openUrl, null);

  for (const channel of ['phone', 'walk_in', 'manual', 'website', 'internal'] as const) {
    const t = resolveSupportTransport({ channel, externalTicketId: null, requesterEmail: 'jo@example.com' });
    assert.equal(t.connected, false, channel);
    assert.equal(t.openUrl, null, channel);
    assert.equal(t.maxLength, null, channel);
  }
});

function fakeDeps(over: Partial<SupportTransportDeps> & { addComment?: HelpdeskProvider['addComment'] } = {}) {
  const calls: Array<{ id: number; body: string; public?: boolean; suppressed: boolean }> = [];
  const staff: number[] = [];
  const helpdesk = {
    addComment:
      over.addComment ??
      (async (id: number, comment: { body: string; public?: boolean }) => {
        calls.push({ id, body: comment.body, public: comment.public, suppressed: mirrorBridgeSuppressed() });
        return { id, subject: null, status: 'open', priority: null, created_at: '', updated_at: '' };
      }),
  } as unknown as HelpdeskProvider; // only addComment is reachable from the send path
  const deps: SupportTransportDeps = {
    helpdesk: async () => helpdesk,
    postedCommentId: async () => 555,
    recordCommentStaff: async ({ staffId }) => {
      staff.push(staffId);
    },
    ...over,
  };
  return { deps, calls, staff };
}

const SEND = { channel: 'zendesk' as const, externalTicketId: '48120', body: '  Hello  ', publicReply: true, staffId: 12 };

test('send: posts once through the helpdesk with the bridge suppressed and returns the comment id', async () => {
  const { deps, calls, staff } = fakeDeps();
  const res = await sendSupportReplyViaTransport(ORG, SEND, deps);
  assert.deepEqual(res, { ok: true, externalMessageId: 'zendesk:comment:555' });
  assert.deepEqual(calls, [{ id: 48120, body: 'Hello', public: true, suppressed: true }]);
  assert.deepEqual(staff, [12]);
});

test('send: an unresolved comment id is null, never invented', async () => {
  const { deps, staff } = fakeDeps({ postedCommentId: async () => null });
  assert.deepEqual(await sendSupportReplyViaTransport(ORG, SEND, deps), { ok: true, externalMessageId: null });
  assert.deepEqual(staff, []);
});

test('send: guards refuse without calling the provider', async () => {
  const { deps, calls } = fakeDeps();
  for (const args of [
    { ...SEND, channel: 'ebay' as const },
    { ...SEND, externalTicketId: null },
    { ...SEND, externalTicketId: 'C-1' },
    { ...SEND, body: '   ' },
  ]) {
    const res = await sendSupportReplyViaTransport(ORG, args, deps);
    assert.equal(res.ok, false);
  }
  const off = fakeDeps({ helpdesk: async () => null });
  assert.deepEqual(await sendSupportReplyViaTransport(ORG, SEND, off.deps), {
    ok: false,
    error: 'Zendesk is not connected for this organization.',
  });
  assert.equal(calls.length, 0);
});

test('send: provider failures map to { ok: false }', async () => {
  const thrown = fakeDeps({ addComment: async () => { throw new Error('Zendesk request failed (422)'); } });
  const a = await sendSupportReplyViaTransport(ORG, SEND, thrown.deps);
  assert.equal(a.ok, false);
  assert.match(a.ok ? '' : a.error, /422/);
  const gone = fakeDeps({ addComment: async () => null });
  const b = await sendSupportReplyViaTransport(ORG, SEND, gone.deps);
  assert.deepEqual(b, { ok: false, error: 'Zendesk ticket #48120 no longer exists.' });
});
