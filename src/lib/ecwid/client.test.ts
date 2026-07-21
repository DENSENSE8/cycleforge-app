/**
 * DB-free unit tests for Ecwid REST helpers (invoice-pdf).
 * Run (with server-only shim):
 *   node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     src/lib/ecwid/client.test.ts
 */
import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';

afterEach(() => {
  mock.restoreAll();
});

test('fetchInvoicePdf returns PDF buffer on 200', async () => {
  const bytes = Buffer.from('%PDF-1.4 hello');
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.match(url, /\/orders\/4787\/invoice-pdf$/);
    return new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    });
  });

  const { fetchInvoicePdf } = await import('./client');
  const buf = await fetchInvoicePdf('store1', 'tok', '4787');
  assert.equal(buf.equals(bytes), true);
});

test('fetchInvoicePdf throws EcwidApiError on non-OK', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('nope', { status: 404 }));

  const { fetchInvoicePdf, EcwidApiError } = await import('./client');
  await assert.rejects(
    () => fetchInvoicePdf('store1', 'tok', '4787'),
    (err: unknown) => {
      assert.ok(err instanceof EcwidApiError);
      assert.equal(err.status, 404);
      assert.match(err.message, /invoice-pdf failed \(404\)/);
      return true;
    },
  );
});

test('fetchInvoicePdf rejects empty orderRef', async () => {
  const { fetchInvoicePdf, EcwidApiError } = await import('./client');
  await assert.rejects(
    () => fetchInvoicePdf('store1', 'tok', '  '),
    (err: unknown) => err instanceof EcwidApiError && err.status === 400,
  );
});
