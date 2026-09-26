import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseWmsTransport, postWmsCommand, WMS_COMMAND_HTTP_PATH } from './wms-command-transport';

test('commands use the socket only when it is open and ticketed; HTTP otherwise', () => {
  assert.equal(chooseWmsTransport({ socketOpen: true, hasTicket: true }), 'socket');
  // Vercel: no gateway, the socket never opens.
  assert.equal(chooseWmsTransport({ socketOpen: false, hasTicket: true }), 'http');
  assert.equal(chooseWmsTransport({ socketOpen: false, hasTicket: false }), 'http');
  // Open socket but the ticket refresh is between tickets.
  assert.equal(chooseWmsTransport({ socketOpen: true, hasTicket: false }), 'http');
});

test('HTTP carries the same commandId and resolves the kernel receipt', async () => {
  let sent: { url: string; body: unknown } | null = null;
  const receipt = await postWmsCommand({ commandId: 'cmd-9' }, async (url, init) => {
    sent = { url: String(url), body: JSON.parse(String(init?.body)) };
    return new Response(JSON.stringify({ commandId: 'cmd-9', status: 'replayed' }), { status: 200 });
  });
  assert.deepEqual(sent, { url: WMS_COMMAND_HTTP_PATH, body: { commandId: 'cmd-9' } });
  assert.deepEqual(receipt, { commandId: 'cmd-9', status: 'replayed' });
});

test('a server rejection surfaces the server message; a dead network says retry is safe', async () => {
  await assert.rejects(
    postWmsCommand({ commandId: 'c' }, async () =>
      new Response(JSON.stringify({ error: 'Cannot take 2: only 1 in A-01' }), { status: 422 })),
    /Cannot take 2: only 1 in A-01/,
  );
  await assert.rejects(
    postWmsCommand({ commandId: 'c' }, async () => new Response('<html>', { status: 502 })),
    /Command failed \(502\)/,
  );
  await assert.rejects(
    postWmsCommand({ commandId: 'c' }, async () => { throw new TypeError('Failed to fetch'); }),
    /retrying is safe/,
  );
});
