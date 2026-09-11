import {
  test,
  expect,
  devices,
  request as pwRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

/**
 * P6 — one cart, two devices: the desk drives, the tablet mirrors.
 *
 * This is the spec the whole counter-session plan exists for
 * (`docs/todo/kiosk-desk-session-channel-PLAN.md`). Everything before it can be
 * true in isolation and still fail the only question that matters: does a line
 * typed at the desk appear on the screen the customer is looking at?
 *
 * ── Two contexts, two principals ─────────────────────────────────────────────
 *   • DESK   — the qa-desktop fixtures (tests/.auth/qa-admin.json), a real staff
 *              session on the QA org. Drives `/counter` with real clicks.
 *   • TABLET — a FRESH context with an explicitly EMPTY cookie jar, so it can
 *              never carry the staff `cf_sid`. It gets `cf_kiosk` only by
 *              pairing, exactly as a real tablet does. Rendered at the
 *              `iPad Pro 11 landscape` descriptor (created per-test rather than
 *              adding a third project, the same trick kiosk-intake-flow uses).
 *
 * ── Why the assertions are asymmetric ────────────────────────────────────────
 * Line writes only ever flow desk → tablet (plan D5): the tablet's entire write
 * surface is set-customer, sign, confirm. So the reverse direction has exactly
 * two rows to prove, and the rest is proved by REFUSAL — a tablet that merely
 * lacks the buttons is not the same as one the server refuses, and only the
 * second is a security property.
 *
 * NON-DESTRUCTIVE: each run enrolls its own device (revoked in cleanup) and its
 * own session (voided in cleanup). Nothing persists but audit rows.
 *
 * HOW TO RUN
 *   1. pnpm provision:qa-org                     (idempotent)
 *   2. attach to the running dev server on :3050
 *   3. npx playwright test tests/e2e/counter-session-two-device.spec.ts --project=qa-desktop
 */

const EMPTY_STORAGE = { cookies: [], origins: [] };
const IPAD = devices['iPad Pro 11 landscape'];

/** How long a mirror may take. The tablet polls at 3s when no channel is live. */
const CONVERGE_MS = 12_000;

function uniqueLabel(): string {
  return `E2E counter ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

interface Bench {
  deviceId: number;
  sessionId: number;
  tablet: APIRequestContext;
}

async function enrollAndPair(
  staff: APIRequestContext,
  baseURL: string,
): Promise<{ deviceId: number; code: string; tablet: APIRequestContext }> {
  const enroll = await staff.post('/api/kiosk/enroll', {
    data: { label: uniqueLabel() },
    headers: { 'content-type': 'application/json' },
  });
  expect(enroll.ok(), `enroll should succeed (HTTP ${enroll.status()})`).toBeTruthy();
  const { deviceId, code } = (await enroll.json()) as { deviceId: number | string; code: string };

  const tablet = await pwRequest.newContext({ baseURL, storageState: EMPTY_STORAGE });
  const pair = await tablet.post('/api/kiosk/pair', {
    data: { code },
    headers: { 'content-type': 'application/json' },
  });
  expect(pair.status(), 'pair should 200').toBe(200);

  return { deviceId: Number(deviceId), code: String(code), tablet };
}

/** Open a session already bound to the paired tablet. */
async function openSession(staff: APIRequestContext, deviceId: number): Promise<number> {
  const res = await staff.post('/api/counter/session', {
    data: { clientEventId: crypto.randomUUID(), kioskDeviceId: deviceId },
    headers: { 'content-type': 'application/json' },
  });
  expect(res.ok(), `create session should succeed (HTTP ${res.status()})`).toBeTruthy();
  const body = (await res.json()) as { snapshot: { sessionId: number } };
  return body.snapshot.sessionId;
}

async function deskSnapshot(staff: APIRequestContext, sessionId: number) {
  const res = await staff.get(`/api/counter/session/${sessionId}`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    snapshot: {
      version: number;
      lines: Array<{ id: string; title: string; quantity: number; voidedAtMs: number | null }>;
      customer: { name: string; phone: string };
      claimedByStaffName: string | null;
    };
  };
  return body.snapshot;
}

async function tabletSession(tablet: APIRequestContext) {
  const res = await tablet.get('/api/kiosk/session');
  expect(res.ok(), `tablet read should succeed (HTTP ${res.status()})`).toBeTruthy();
  return (await res.json()) as {
    session: {
      sessionId: number;
      version: number;
      lines: Array<{ id: string; title: string; quantity: number }>;
      customerName: string;
      customerPhoneMasked: string;
      awaitingSignatureLineIds: string[];
    } | null;
    channel?: string;
  };
}

/** Add a line straight through the API — for rows whose subject is not the form. */
async function addLine(
  staff: APIRequestContext,
  sessionId: number,
  expectedVersion: number,
  line: { title: string; unitAmountCents: number; quantity?: number },
) {
  const res = await staff.post(`/api/counter/session/${sessionId}/lines`, {
    data: {
      expectedVersion,
      lineUuid: crypto.randomUUID(),
      type: 'RETAIL',
      title: line.title,
      quantity: line.quantity ?? 1,
      unitAmountCents: line.unitAmountCents,
      payload: { variationId: null, sku: 'E2E' },
      sortIndex: 0,
    },
    headers: { 'content-type': 'application/json' },
  });
  return res;
}

async function newTabletPage(
  browser: Browser,
  baseURL: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, ...IPAD, storageState: EMPTY_STORAGE });
  const page = await context.newPage();
  return { context, page };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. The headline: two real screens, one cart.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P6 · desk drives, tablet mirrors', () => {
  test('a line typed at the desk appears on the tablet the customer is watching', async ({
    page,
    request,
    browser,
    baseURL,
  }) => {
    const { deviceId, code, tablet } = await enrollAndPair(request, baseURL!);
    const sessionId = await openSession(request, deviceId);
    const { context: tabletContext, page: tabletPage } = await newTabletPage(browser, baseURL!);

    try {
      // The tablet pairs in the BROWSER context too — the API context's cookie
      // jar is its own, and a real tablet pairs once on the glass.
      await tabletPage.goto('/kiosk/v2');
      await expect(tabletPage.getByRole('heading', { name: /pair this tablet/i })).toBeVisible();
      await tabletPage.getByPlaceholder(/setup code/i).fill(code);
      await tabletPage.getByRole('button', { name: /pair tablet/i }).click();

      // Desk: type a line into the real form and press the real button.
      await page.goto(`/counter?session=${sessionId}`);
      // Generous: this is the first hit on /counter in a run, so it can pay the
      // dev-server compile. A tighter timeout here fails as "convergence broke"
      // when the truth is "the route had not been built yet".
      await expect(page.getByText(`#${sessionId}`)).toBeVisible({ timeout: 30_000 });
      await page.getByLabel('Item').fill('E2E convergence widget');
      await page.getByLabel('Price').fill('24.50');
      await page.getByRole('button', { name: /add line/i }).click();

      // Desk repaints from its own response…
      await expect(page.getByText('E2E convergence widget')).toBeVisible();

      // …and the tablet converges, by mirror or by poll. This is the assertion
      // the whole plan is for.
      await expect
        .poll(async () => (await tabletSession(tablet)).session?.lines.map((l) => l.title) ?? [], {
          timeout: CONVERGE_MS,
        })
        .toContain('E2E convergence widget');
    } finally {
      await tabletContext.close();
      await tablet.dispose();
      await request.post('/api/kiosk/revoke', { data: { deviceId } }).catch(() => {});
    }
  });

  test('quantity and void converge — and a voided line leaves the customer’s screen', async ({
    request,
    baseURL,
  }) => {
    const { deviceId, tablet } = await enrollAndPair(request, baseURL!);
    const sessionId = await openSession(request, deviceId);

    try {
      const added = await addLine(request, sessionId, 0, { title: 'Cable', unitAmountCents: 1999 });
      expect(added.ok()).toBeTruthy();
      const { snapshot } = (await added.json()) as {
        snapshot: { version: number; lines: Array<{ id: string }> };
      };
      const lineId = snapshot.lines[0].id;

      // Quantity → tablet.
      const bumped = await request.patch(
        `/api/counter/session/${sessionId}/lines/${lineId}`,
        {
          data: { expectedVersion: snapshot.version, quantity: 3 },
          headers: { 'content-type': 'application/json' },
        },
      );
      expect(bumped.ok()).toBeTruthy();
      await expect
        .poll(async () => (await tabletSession(tablet)).session?.lines[0]?.quantity, {
          timeout: CONVERGE_MS,
        })
        .toBe(3);

      // Void → gone from the tablet, still on the desk (evidence, not a delete).
      const voided = await request.delete(`/api/counter/session/${sessionId}/lines/${lineId}`, {
        data: { expectedVersion: snapshot.version + 1, reason: 'e2e void' },
        headers: { 'content-type': 'application/json' },
      });
      expect(voided.ok()).toBeTruthy();

      const desk = await deskSnapshot(request, sessionId);
      expect(desk.lines, 'the desk ledger keeps the voided line').toHaveLength(1);
      expect(desk.lines[0].voidedAtMs, 'and stamps when it was voided').not.toBeNull();

      await expect
        .poll(async () => (await tabletSession(tablet)).session?.lines.length, {
          timeout: CONVERGE_MS,
        })
        .toBe(0);
    } finally {
      await tablet.dispose();
      await request.post('/api/kiosk/revoke', { data: { deviceId } }).catch(() => {});
    }
  });

  test('the two verbs that flow the other way: identity and signature', async ({
    request,
    baseURL,
  }) => {
    const { deviceId, tablet } = await enrollAndPair(request, baseURL!);
    const sessionId = await openSession(request, deviceId);

    try {
      // Tablet → desk: the customer is standing at the tablet, so identity is
      // its verb to hold.
      const before = await deskSnapshot(request, sessionId);
      const setCustomer = await tablet.patch('/api/kiosk/session/customer', {
        data: { expectedVersion: before.version, phone: '5551234567', name: 'Dana' },
        headers: { 'content-type': 'application/json' },
      });
      expect(setCustomer.ok(), `tablet may set the customer (HTTP ${setCustomer.status()})`).toBeTruthy();

      const after = await deskSnapshot(request, sessionId);
      expect(after.customer.name).toBe('Dana');
      expect(after.customer.phone).toBe('5551234567');

      // …and the tablet only ever reads it back MASKED (D6).
      const projected = await tabletSession(tablet);
      expect(projected.session?.customerPhoneMasked).toBe('••• ••• 4567');
      expect(JSON.stringify(projected.session)).not.toContain('5551234567');
    } finally {
      await tablet.dispose();
      await request.post('/api/kiosk/revoke', { data: { deviceId } }).catch(() => {});
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Refusal — the properties that a missing button does NOT prove.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P6 · the money boundary (D5, revised 2026-08-20)', () => {
  test('the tablet co-edits, but every MONEY verb is refused at the door', async ({
    request,
    baseURL,
  }) => {
    const { deviceId, tablet } = await enrollAndPair(request, baseURL!);
    const sessionId = await openSession(request, deviceId);

    try {
      const added = await addLine(request, sessionId, 0, { title: 'Case', unitAmountCents: 1500 });
      const { snapshot } = (await added.json()) as {
        snapshot: { version: number; lines: Array<{ id: string }> };
      };
      const lineId = snapshot.lines[0].id;
      const body = { headers: { 'content-type': 'application/json' } };

      // The counter is a form two people fill at once, so the tablet CAN stage
      // and correct lines — through its own routes, at zero price:
      const staged = await tablet.post('/api/kiosk/session/lines', {
        ...body,
        data: {
          expectedVersion: snapshot.version,
          lineUuid: crypto.randomUUID(),
          type: 'REPAIR',
          title: 'Customer-described repair',
          quantity: 1,
          payload: { productModel: 'Pixel 8', serialNumber: 'SN-CUST', price: '0' },
          sortIndex: 1,
        },
      });
      expect(staged.ok(), `tablet may stage a line (HTTP ${staged.status()})`).toBeTruthy();

      // …and what it must never reach is MONEY. These are desk routes (withAuth),
      // so a device principal cannot touch them at all.
      const attempts = [
        tablet.post(`/api/counter/session/${sessionId}/lines`, {
          ...body,
          data: {
            expectedVersion: snapshot.version,
            lineUuid: crypto.randomUUID(),
            type: 'RETAIL',
            title: 'Free stuff',
            quantity: 1,
            unitAmountCents: 0,
            payload: { variationId: null, sku: 'X' },
            sortIndex: 0,
          },
        }),
        tablet.patch(`/api/counter/session/${sessionId}/lines/${lineId}`, {
          ...body,
          data: { expectedVersion: snapshot.version, unitAmountCents: 0 },
        }),
        tablet.delete(`/api/counter/session/${sessionId}/lines/${lineId}`, {
          ...body,
          data: { expectedVersion: snapshot.version },
        }),
        tablet.post(`/api/counter/session/${sessionId}/claim`, {
          ...body,
          data: { expectedVersion: snapshot.version },
        }),
        tablet.post(`/api/counter/session/${sessionId}/status`, {
          ...body,
          data: { expectedVersion: snapshot.version, status: 'voided' },
        }),
      ];

      for (const attempt of attempts) {
        const res = await attempt;
        expect(
          res.status(),
          'a device principal must never reach a desk route',
        ).toBeGreaterThanOrEqual(401);
        expect(res.status()).toBeLessThan(500);
      }

      // The desk's own line is untouched; the customer's staged line is there.
      const desk = await deskSnapshot(request, sessionId);
      expect(desk.lines).toHaveLength(2);
      expect(desk.lines.find((l) => l.title === 'Case')?.quantity).toBe(1);
      expect(desk.lines.some((l) => l.title === 'Customer-described repair')).toBe(true);
    } finally {
      await tablet.dispose();
      await request.post('/api/kiosk/revoke', { data: { deviceId } }).catch(() => {});
    }
  });

  test('a revoked tablet goes dark immediately', async ({ request, baseURL }) => {
    const { deviceId, tablet } = await enrollAndPair(request, baseURL!);
    await openSession(request, deviceId);

    try {
      expect((await tablet.get('/api/kiosk/session')).ok()).toBeTruthy();

      await request.post('/api/kiosk/revoke', {
        data: { deviceId },
        headers: { 'content-type': 'application/json' },
      });

      const after = await tablet.get('/api/kiosk/session');
      expect(after.status(), 'revocation kills the device principal at once').toBe(401);

      const token = await tablet.post('/api/realtime/kiosk-token');
      expect(token.status(), 'and it can no longer mint a realtime token').toBe(401);
    } finally {
      await tablet.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. The version contract — what makes two writers safe.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P6 · version discipline (D3)', () => {
  test('a stale write is refused with the CURRENT snapshot, not a partial one', async ({
    request,
    baseURL,
  }) => {
    const { deviceId, tablet } = await enrollAndPair(request, baseURL!);
    const sessionId = await openSession(request, deviceId);

    try {
      const first = await addLine(request, sessionId, 0, { title: 'First', unitAmountCents: 100 });
      expect(first.ok()).toBeTruthy();

      // Same expectedVersion again — exactly what a second desk holding a stale
      // snapshot would send.
      const stale = await addLine(request, sessionId, 0, {
        title: 'Stale',
        unitAmountCents: 200,
      });
      expect(stale.status(), 'a lost race is a 409').toBe(409);

      const body = (await stale.json()) as {
        error: string;
        snapshot: { version: number; lines: Array<{ title: string }> };
      };
      expect(body.error).toBe('VERSION_CONFLICT');
      expect(body.snapshot.version, 'the refusal carries the truth to re-render from').toBe(1);
      expect(body.snapshot.lines.map((l) => l.title)).toEqual(['First']);

      // And nothing was half-written.
      const desk = await deskSnapshot(request, sessionId);
      expect(desk.lines.map((l) => l.title)).toEqual(['First']);
    } finally {
      await tablet.dispose();
      await request.post('/api/kiosk/revoke', { data: { deviceId } }).catch(() => {});
    }
  });

  test('the tablet is told which channel to listen on (it cannot build the name)', async ({
    request,
    baseURL,
  }) => {
    const { deviceId, tablet } = await enrollAndPair(request, baseURL!);
    await openSession(request, deviceId);

    try {
      const read = await tabletSession(tablet);
      expect(read.channel, 'the device payload carries its bridge').toBeTruthy();
      expect(read.channel).toMatch(/^org:[0-9a-f-]{36}:kiosk:\d+$/i);
      expect(read.channel).toContain(`:kiosk:${deviceId}`);
    } finally {
      await tablet.dispose();
      await request.post('/api/kiosk/revoke', { data: { deviceId } }).catch(() => {});
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 0 — desk → this iPad after the visit already exists.
// `docs/todo/kiosk-counter-consult-PLAN.md`: create desk-only, then bind;
// DEVICE_BUSY; unbind returns the tablet to its local cart.
// Playwright qa-desktop runs this file. APIs: POST /api/counter/session,
// POST /api/counter/session/{id}/device, GET /api/kiosk/session.
// Schema: counter_sessions.kiosk_device_id (one open visit per tablet).
// User: "Great, continue to build out phase 0."
// ─────────────────────────────────────────────────────────────────────────────

async function openDeskOnlySession(staff: APIRequestContext): Promise<{ sessionId: number; version: number }> {
  const res = await staff.post('/api/counter/session', {
    data: { clientEventId: crypto.randomUUID(), kioskDeviceId: null },
    headers: { 'content-type': 'application/json' },
  });
  expect(res.ok(), `desk-only create should succeed (HTTP ${res.status()})`).toBeTruthy();
  const body = (await res.json()) as { snapshot: { sessionId: number; version: number } };
  return { sessionId: body.snapshot.sessionId, version: body.snapshot.version };
}

async function bindDevice(
  staff: APIRequestContext,
  sessionId: number,
  expectedVersion: number,
  kioskDeviceId: number | null,
) {
  return staff.post(`/api/counter/session/${sessionId}/device`, {
    data: { expectedVersion, kioskDeviceId },
    headers: { 'content-type': 'application/json' },
  });
}

test.describe('Phase 0 · bind an open visit onto a tablet', () => {
  test('a desk-only visit paints on the iPad only after POST /device', async ({
    request,
    baseURL,
  }) => {
    const { deviceId, tablet } = await enrollAndPair(request, baseURL!);
    const { sessionId, version } = await openDeskOnlySession(request);

    try {
      expect((await tabletSession(tablet)).session, 'unbound tablet is idle').toBeNull();

      const bound = await bindDevice(request, sessionId, version, deviceId);
      expect(bound.ok(), `bind should succeed (HTTP ${bound.status()})`).toBeTruthy();

      await expect
        .poll(async () => (await tabletSession(tablet)).session?.sessionId ?? null, {
          timeout: CONVERGE_MS,
        })
        .toBe(sessionId);
    } finally {
      await tablet.dispose();
      await request.post('/api/kiosk/revoke', { data: { deviceId } }).catch(() => {});
    }
  });

  test('DEVICE_BUSY refuses a silent steal when another open visit holds the tablet', async ({
    request,
    baseURL,
  }) => {
    const { deviceId, tablet } = await enrollAndPair(request, baseURL!);
    const holderId = await openSession(request, deviceId);
    const { sessionId: otherId, version } = await openDeskOnlySession(request);

    try {
      const steal = await bindDevice(request, otherId, version, deviceId);
      expect(steal.status(), 'busy tablet is a 409').toBe(409);
      const body = (await steal.json()) as { error: string };
      expect(body.error).toBe('DEVICE_BUSY');

      const still = await tabletSession(tablet);
      expect(still.session?.sessionId, 'the first visit keeps the tablet').toBe(holderId);
    } finally {
      await tablet.dispose();
      await request.post('/api/kiosk/revoke', { data: { deviceId } }).catch(() => {});
    }
  });

  test('unbind hands the iPad back — GET /api/kiosk/session is idle, desk visit stays', async ({
    request,
    baseURL,
  }) => {
    const { deviceId, tablet } = await enrollAndPair(request, baseURL!);
    const sessionId = await openSession(request, deviceId);

    try {
      expect((await tabletSession(tablet)).session?.sessionId).toBe(sessionId);

      const before = await deskSnapshot(request, sessionId);
      const unbound = await bindDevice(request, sessionId, before.version, null);
      expect(unbound.ok(), `unbind should succeed (HTTP ${unbound.status()})`).toBeTruthy();

      await expect
        .poll(async () => (await tabletSession(tablet)).session, { timeout: CONVERGE_MS })
        .toBeNull();

      const desk = await deskSnapshot(request, sessionId);
      expect(desk.version, 'the desk visit is still open').toBeGreaterThanOrEqual(before.version);
    } finally {
      await tablet.dispose();
      await request.post('/api/kiosk/revoke', { data: { deviceId } }).catch(() => {});
    }
  });
});
