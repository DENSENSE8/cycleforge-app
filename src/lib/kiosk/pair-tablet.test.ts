import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pairKioskTablet } from './pair-tablet';

function fakes(res: { ok: boolean; status: number; error?: string } | 'throw') {
  const cap: { urls: string[]; bodies: unknown[] } = { urls: [], bodies: [] };
  const deps = {
    fetch: async (input, init) => {
      cap.urls.push(String(input));
      cap.bodies.push(init?.body ? JSON.parse(String(init.body)) : null);
      if (res === 'throw') throw new Error('offline');
      return {
        ok: res.ok,
        status: res.status,
        json: async () => (res.error ? { error: res.error } : {}),
      } as Response;
    },
  };
  return { deps, cap };
}

describe('pairKioskTablet', () => {
  it('rejects a short code without fetching', async () => {
    const { deps, cap } = fakes({ ok: true, status: 200 });
    const out = await pairKioskTablet('abc', deps);
    assert.deepEqual(out, { ok: false, error: 'Enter the full setup code.' });
    assert.equal(cap.urls.length, 0);
  });

  it('POSTs the trimmed code to /api/kiosk/pair', async () => {
    const { deps, cap } = fakes({ ok: true, status: 200 });
    const out = await pairKioskTablet('  setup-code-99  ', deps);
    assert.deepEqual(out, { ok: true });
    assert.equal(cap.urls[0], '/api/kiosk/pair');
    assert.deepEqual(cap.bodies[0], { code: 'setup-code-99' });
  });

  it('maps KIOSK_HOST_REQUIRED / 403 to the host teaching error', async () => {
    const { deps } = fakes({ ok: false, status: 403, error: 'KIOSK_HOST_REQUIRED' });
    const out = await pairKioskTablet('setup-code-99', deps);
    assert.equal(out.ok, false);
    if (!out.ok) assert.match(out.error, /workspace kiosk URL/);
  });

  it('maps a bad code to the expired teaching error', async () => {
    const { deps } = fakes({ ok: false, status: 404, error: 'INVALID_PAIRING_CODE' });
    const out = await pairKioskTablet('setup-code-99', deps);
    assert.deepEqual(out, {
      ok: false,
      error: 'That setup code is invalid or expired. Generate a new one in Settings.',
    });
  });
});
