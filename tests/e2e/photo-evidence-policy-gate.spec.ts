import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Photo evidence policy gate — `receiving.photoPolicy` org setting
 * (docs/todo/photo-evidence-policy-claims-insurance-plan.md, WS-PHOTO Plan 5).
 *
 * SoT: `src/lib/receiving/photo-policy.ts` (`evaluateReceivingPhotoPolicy` — pure,
 * DB-free) judges already-typed evidence counts against one of three tiers:
 *   optional          → always ok
 *   require_one       → ≥1 arrival PACKAGE photo on the carton
 *   require_per_item  → every non-cancelled line has ≥1 item photo
 * `src/lib/receiving/photo-policy-gate.ts` (`evaluateReceivingPhotoPolicyGate`)
 * assembles the real evidence counts for one carton and calls the evaluator.
 * Setting SoT: `src/lib/settings/registry.ts` (`receiving.photoPolicy`, default
 * `'optional'`) via the generic Settings Registry (`GET/PUT /api/settings`,
 * docs/settings-registry.md).
 *
 * WIRING STATUS: at the start of this authoring session
 * `evaluateReceivingPhotoPolicyGate` had zero route call sites (a concurrent
 * agent was mid-flight wiring it, per the parent task's brief — hence "write
 * defensively"). It landed in `src/app/api/receiving/mark-received-po/route.ts`
 * and `mark-received/route.ts` before this file was finished, so Test B below
 * is a real assertion, not a placeholder. Confirmed from source
 * (`mark-received-po/route.ts`, current as of this writing):
 *
 *   - The gate runs immediately after loading the carton's open-for-receive
 *     lines and BEFORE any Zoho purchase-receive/mutation code — gated on
 *     `!skipZohoReceive && openForReceive.length > 0` (i.e. NOT
 *     `receive_intent: 'scan_only'`, and at least one non-DONE line).
 *   - On a policy value other than `optional`, it loads real evidence counts
 *     for `receiving_id` and, on `!gate.ok`, returns
 *     `409 { success: false, error: 'PHOTO_POLICY', blockers: string[] }`
 *     directly — no Zoho call is ever reached on that path.
 *   - A minimal body (`{ receiving_id }`) is enough to reach the gate: nothing
 *     between body-parsing and the gate check requires `source='zoho_po'` or
 *     a Zoho-linked line, so a synthetic `source='unmatched'` carton + one
 *     manually-added line (`workflow_status='MATCHED'`, never `DONE`) reaches
 *     it exactly like a real PO carton would.
 *
 * This makes Test B genuinely safe to call — it 409s before touching Zoho.
 * The remaining risk is different: `receiving.photoPolicy` is an ORG-WIDE
 * setting, not scoped to this fixture. Flipping it to `require_per_item` for
 * the duration of the test could make a concurrent human operator's real
 * receive on this tenant unexpectedly demand item photos. `finally` always
 * restores the original value (even on assertion failure), and the test stays
 * behind `E2E_PHOTO_POLICY_GATE=1` (default OFF) for that reason — prefer
 * running it with `--project=qa-desktop` (the QA sandbox session,
 * `tests/.auth/qa-admin.json`) over the default dogfood project when the QA
 * org is provisioned (see `tests/e2e/global-setup.ts`).
 *
 * Test A (always runs, read-only) checks the setting contract itself and
 * infers the "optional → proceeds" half without any mutating call.
 */

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function createUnmatchedCarton(request: APIRequestContext, tag: string): Promise<number> {
  const tracking = `E2E-PHOTO-${tag}-${uniq()}`;
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: tracking, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry failed (${res.status()}): ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  const id = Number(body?.record?.id);
  expect(Number.isFinite(id) && id > 0, `bad receiving id in response: ${JSON.stringify(body)}`).toBeTruthy();
  return id;
}

async function addLine(request: APIRequestContext, receivingId: number, sku: string): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: { receiving_id: receivingId, sku, item_name: `E2E Photo Policy ${sku}` },
  });
  expect(res.ok(), `add-unmatched-line failed (${res.status()}): ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  const id = Number(body?.line?.id);
  expect(Number.isFinite(id) && id > 0, `bad line id in response: ${JSON.stringify(body)}`).toBeTruthy();
  return id;
}

async function cleanupLine(request: APIRequestContext, lineId: number | null): Promise<void> {
  if (!lineId) return;
  await request.delete(`/api/receiving-lines?id=${lineId}`).catch(() => {});
}

async function cleanupCarton(request: APIRequestContext, receivingId: number | null): Promise<void> {
  if (!receivingId) return;
  await request.delete(`/api/receiving-logs?id=${receivingId}`).catch(() => {});
}

interface ReceivingSettingsItem {
  key: string;
  value: unknown;
}

async function getReceivingPhotoPolicy(request: APIRequestContext): Promise<string | null> {
  const res = await request.get('/api/settings?page=receiving');
  expect(res.ok(), `GET /api/settings?page=receiving failed (${res.status()}): ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  const items = (body.items ?? []) as ReceivingSettingsItem[];
  const item = items.find((i) => i.key === 'receiving.photoPolicy');
  return item ? String(item.value) : null;
}

async function setReceivingPhotoPolicy(
  request: APIRequestContext,
  value: 'optional' | 'require_one' | 'require_per_item',
): Promise<void> {
  const res = await request.put('/api/settings', {
    data: { key: 'receiving.photoPolicy', value, target: 'org' },
  });
  expect(res.ok(), `PUT receiving.photoPolicy=${value} failed (${res.status()}): ${await res.text()}`).toBeTruthy();
}

test.describe('Photo evidence policy — receiving.photoPolicy setting contract', () => {
  test.skip(({ isMobile }) => isMobile, 'API test — desktop project only');

  test('the setting is registered, resolves to a valid tier, and defaults to optional (mark-received proceeds)', async ({
    request,
  }) => {
    const res = await request.get('/api/settings?page=receiving');
    expect(res.ok(), `GET /api/settings?page=receiving failed (${res.status()}): ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.items), 'settings page response should carry items[]').toBeTruthy();

    const items = body.items as ReceivingSettingsItem[];
    const item = items.find((i) => i.key === 'receiving.photoPolicy');
    expect(item, 'receiving.photoPolicy must be a registered receiving-page setting').toBeTruthy();
    expect(['optional', 'require_one', 'require_per_item']).toContain(item!.value);

    // Defensive/soft: a shared dogfood org's setting may have been changed by a
    // teammate. Only assert the "proceeds" precondition when it's still the
    // documented default; otherwise just record the observed value so this
    // spec never fails on someone else's org configuration.
    if (item!.value !== 'optional') {
      test.info().annotations.push({
        type: 'note',
        description: `receiving.photoPolicy is currently "${item!.value}", not the default "optional" — skipping the "proceeds" inference for this run.`,
      });
      return;
    }

    // optional gates nothing (src/lib/receiving/photo-policy.ts: "'optional' —
    // plus any runtime-corrupt value … gates nothing"), and
    // evaluateReceivingPhotoPolicyGate short-circuits to `{ ok: true }` without
    // even querying evidence counts when the resolved policy is 'optional' — so
    // mark-received is provably not blocked by photo evidence under the default.
    expect(item!.value).toBe('optional');
  });
});

test.describe('Photo evidence policy — require_per_item blocks mark-received (409)', () => {
  // Gated OFF by default — see the file docstring: the route call itself is
  // confirmed safe (409s before any Zoho mutation), but the ORG-WIDE
  // `receiving.photoPolicy` setting this test flips is shared blast radius on
  // whichever tenant `tests/.auth/admin.json` is signed into. Run with
  // E2E_PHOTO_POLICY_GATE=1, ideally via `--project=qa-desktop`.
  test.skip(!process.env.E2E_PHOTO_POLICY_GATE, 'Set E2E_PHOTO_POLICY_GATE=1 to run this org-setting-mutating test (see file docstring)');
  test.skip(({ isMobile }) => isMobile, 'API test — desktop project only');

  test('require_per_item with a zero-item-photo line returns 409 { error: "PHOTO_POLICY", blockers }', async ({
    request,
  }) => {
    let receivingId: number | null = null;
    let lineId: number | null = null;
    let originalPolicy: string | null = null;

    try {
      originalPolicy = await getReceivingPhotoPolicy(request);
      await setReceivingPhotoPolicy(request, 'require_per_item');

      receivingId = await createUnmatchedCarton(request, 'policy');
      lineId = await addLine(request, receivingId, `E2E-POLICY-${uniq()}`);
      // Deliberately no item photo uploaded for this line — evaluateReceivingPhotoPolicy
      // must report it as missing evidence under require_per_item.

      // Minimal body: mark-received-po only needs receiving_id to reach the
      // gate (see docstring) — qa_status/disposition_code/etc. all default.
      const res = await request.post('/api/receiving/mark-received-po', {
        data: { receiving_id: receivingId },
      });
      expect(res.status(), await res.text()).toBe(409);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('PHOTO_POLICY');
      expect(Array.isArray(body.blockers), JSON.stringify(body)).toBeTruthy();
      expect(body.blockers.length).toBeGreaterThan(0);
      // perItemBlocker (photo-policy.ts) names the SKU-less line as "line #<id>".
      expect(String(body.blockers[0])).toMatch(/needs an? item photo/i);
    } finally {
      // Restore FIRST — this is the shared org setting; do it even if the
      // fixture cleanup below has problems.
      if (originalPolicy) {
        await setReceivingPhotoPolicy(
          request,
          originalPolicy as 'optional' | 'require_one' | 'require_per_item',
        ).catch(() => {});
      }
      await cleanupLine(request, lineId);
      await cleanupCarton(request, receivingId);
    }
  });
});

/**
 * §4 soft block — the override half.
 *
 * The gate's verdict is unchanged; what changed is what the route does with a
 * `!ok` verdict when the body carries `photo_policy_override`:
 *   absent      → the same 409 as above (asserted in the sibling describe)
 *   forged      → 400 INVALID_PHOTO_POLICY_OVERRIDE, before any mutation
 *   PHOTO_WAIVED_* → 200, with `warnings[]` carrying the same code + blockers,
 *                    plus a receiving_exceptions row and an audit row
 *
 * `receive_intent: 'local_receive'` on the waived call is deliberate: it still
 * runs the gate (only `scan_only` skips it) but never issues a Zoho purchase
 * receive, so a synthetic unmatched carton can be received for real without
 * touching an external system. It is also exactly what the phone sends for an
 * unmatched carton, so the path under test is a real one.
 *
 * NOT asserted here: the `receiving_exceptions` row and the audit row. Neither
 * has a read endpoint, so they are covered by the unit suites instead
 * (`src/lib/receiving/photo-policy-gate.test.ts` →
 * `recordPhotoPolicyOverride` + the route-wiring guard).
 *
 * Same blast radius, same gate, same restore-in-finally discipline as above.
 */
test.describe('Photo evidence policy — a PHOTO_WAIVED_* override soft-blocks the gate', () => {
  test.skip(!process.env.E2E_PHOTO_POLICY_GATE, 'Set E2E_PHOTO_POLICY_GATE=1 to run this org-setting-mutating test (see file docstring)');
  test.skip(({ isMobile }) => isMobile, 'API test — desktop project only');

  test('absent → 409; forged → 400; PHOTO_WAIVED_* → 200 with warnings[]', async ({ request }) => {
    let receivingId: number | null = null;
    let lineId: number | null = null;
    let originalPolicy: string | null = null;

    try {
      originalPolicy = await getReceivingPhotoPolicy(request);
      await setReceivingPhotoPolicy(request, 'require_per_item');

      receivingId = await createUnmatchedCarton(request, 'override');
      lineId = await addLine(request, receivingId, `E2E-OVERRIDE-${uniq()}`);
      // Deliberately no item photo — the gate must block this line.

      // (b) No override → the byte-identical 409. This is the control: without
      // it, a green override assertion could just mean the gate never fired.
      const blocked = await request.post('/api/receiving/mark-received-po', {
        data: { receiving_id: receivingId, receive_intent: 'local_receive' },
      });
      expect(blocked.status(), await blocked.text()).toBe(409);
      const blockedBody = await blocked.json();
      expect(blockedBody.error).toBe('PHOTO_POLICY');
      expect(Array.isArray(blockedBody.blockers)).toBeTruthy();
      expect(blockedBody.blockers.length).toBeGreaterThan(0);

      // (d) A forged code is rejected outright — never a silent waiver, and
      // never a 409 that would tell the operator to go shoot more photos.
      for (const forged of ['PHOTO_WAIVED_LOL', 'NO_PO', 'any']) {
        const bad = await request.post('/api/receiving/mark-received-po', {
          data: {
            receiving_id: receivingId,
            receive_intent: 'local_receive',
            photo_policy_override: forged,
          },
        });
        expect(bad.status(), `forged "${forged}": ${await bad.text()}`).toBe(400);
        const badBody = await bad.json();
        expect(badBody.error).toBe('INVALID_PHOTO_POLICY_OVERRIDE');
        expect(Array.isArray(badBody.allowed)).toBeTruthy();
        expect(badBody.allowed).toContain('PHOTO_WAIVED_NO_DEVICE');
      }

      // Still blocked after the rejected attempts — a forged override must not
      // have mutated anything on its way out.
      const stillBlocked = await request.post('/api/receiving/mark-received-po', {
        data: { receiving_id: receivingId, receive_intent: 'local_receive' },
      });
      expect(stillBlocked.status(), await stillBlocked.text()).toBe(409);

      // (a) A real override receives, and says what it waived.
      const waived = await request.post('/api/receiving/mark-received-po', {
        data: {
          receiving_id: receivingId,
          receive_intent: 'local_receive',
          photo_policy_override: 'PHOTO_WAIVED_NO_DEVICE',
        },
      });
      expect(waived.status(), await waived.text()).toBe(200);
      const waivedBody = await waived.json();
      expect(waivedBody.success).toBe(true);
      expect(Array.isArray(waivedBody.warnings), JSON.stringify(waivedBody)).toBeTruthy();
      const warning = waivedBody.warnings[0];
      // Mirrors the 409 payload: same wire code, same blockers, plus the code
      // the operator chose.
      expect(warning.code).toBe('PHOTO_POLICY');
      expect(warning.reason_code).toBe('PHOTO_WAIVED_NO_DEVICE');
      expect(warning.blockers).toEqual(blockedBody.blockers);
    } finally {
      // Restore FIRST — shared org setting.
      if (originalPolicy) {
        await setReceivingPhotoPolicy(
          request,
          originalPolicy as 'optional' | 'require_one' | 'require_per_item',
        ).catch(() => {});
      }
      await cleanupLine(request, lineId);
      await cleanupCarton(request, receivingId);
    }
  });

  test('a receive that PASSES the gate carries no warnings, override or not', async ({ request }) => {
    // Guard against the inverse bug: a waiver announced on a receive that was
    // never blocked would teach operators to ignore the warning.
    let receivingId: number | null = null;
    let lineId: number | null = null;
    let originalPolicy: string | null = null;

    try {
      originalPolicy = await getReceivingPhotoPolicy(request);
      await setReceivingPhotoPolicy(request, 'optional');

      receivingId = await createUnmatchedCarton(request, 'nowarn');
      lineId = await addLine(request, receivingId, `E2E-NOWARN-${uniq()}`);

      const res = await request.post('/api/receiving/mark-received-po', {
        data: {
          receiving_id: receivingId,
          receive_intent: 'local_receive',
          photo_policy_override: 'PHOTO_WAIVED_NO_DEVICE',
        },
      });
      expect(res.status(), await res.text()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.warnings, JSON.stringify(body)).toBeUndefined();
    } finally {
      if (originalPolicy) {
        await setReceivingPhotoPolicy(
          request,
          originalPolicy as 'optional' | 'require_one' | 'require_per_item',
        ).catch(() => {});
      }
      await cleanupLine(request, lineId);
      await cleanupCarton(request, receivingId);
    }
  });
});
