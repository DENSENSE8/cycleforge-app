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
 * P2-KSK-01 — Kiosk tablet customer-intake flow (device-principal auth).
 *
 * The /kiosk surface (FOH/BOH split, doc 06) authenticates as a DEVICE, never a
 * staff session: a tablet is enrolled by a manager, pairs with a one-time code
 * to receive the httpOnly `cf_kiosk` device token, and thereafter writes intakes
 * as itself via `withKioskAuth`. This spec exercises that whole lifecycle over
 * REAL HTTP against the running dev server — both the API contract and the
 * rendered tablet UI.
 *
 * ── The two-context model (the crux of kiosk E2E) ─────────────────────────────
 *   • STAFF context  — the default Playwright fixtures (`request` / `page`) carry
 *     tests/.auth/admin.json (global-setup signs in as PW_STAFF_NAME on the
 *     `usav` tenant = org 01). Used for the manager surfaces: enroll / revoke /
 *     list / the Settings → Kiosk-devices page. The admin holds
 *     `walk_in.enroll_kiosk`.
 *   • TABLET context — a FRESH context with an explicitly EMPTY cookie jar
 *     (`storageState: { cookies: [], origins: [] }`), so it never carries the
 *     staff `cf_sid`. It receives `cf_kiosk` only by pairing. This is the same
 *     "override the inherited storageState" trick realtime-token.spec.ts uses for
 *     its anonymous case — without it a manually-made context arrives authed.
 *
 * ── Form factors ──────────────────────────────────────────────────────────────
 * The kiosk is tablet-first, so the UI happy-paths run at BOTH a desktop viewport
 * and an iPad-landscape descriptor (created per-test via `browser.newContext`, so
 * we don't have to add a whole third project to playwright.config.ts and re-run
 * every unrelated spec under it). API-contract tests are form-factor agnostic.
 *
 * NON-DESTRUCTIVE: every device this spec enrolls is revoked again before the
 * test ends (revoked is the terminal, soft-deleted state), and labels are unique
 * per run so retries/parallel workers never collide. No customer intake persists
 * beyond an audit row (the doc-03 seam is audit-only today).
 *
 * HOW TO RUN
 *   1. Start the app:   pnpm dev                 (main lane → :3000)
 *   2. Run this spec:   npx playwright test tests/e2e/kiosk-intake-flow.spec.ts --project=desktop
 */

const EMPTY_STORAGE = { cookies: [], origins: [] };

/** Unique, obviously-E2E label so retries/workers never collide and cleanup is greppable. */
function uniqueLabel(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
}

// ── Manager-surface helpers (STAFF context) ──────────────────────────────────

interface Enrollment {
  deviceId: number;
  code: string;
  expiresAt: string;
}

/** Mint a one-time pairing code for a new tablet (manager action; needs `walk_in.enroll_kiosk`). */
async function enrollDevice(request: APIRequestContext, label: string): Promise<Enrollment> {
  const r = await request.post('/api/kiosk/enroll', {
    data: { label },
    headers: { 'content-type': 'application/json' },
  });
  expect(r.ok(), `enroll "${label}" should succeed (HTTP ${r.status()})`).toBeTruthy();
  const body = (await r.json()) as { deviceId: number | string; code: string; expiresAt: string };
  // `deviceId` comes back as a bigint (pg serializes it as a string on some paths);
  // /api/kiosk/revoke's Zod body requires a real number, so normalize here.
  return { deviceId: Number(body.deviceId), code: String(body.code), expiresAt: body.expiresAt };
}

/** Revoke a device (manager action). Best-effort cleanup — never throws the test. */
async function revokeDevice(request: APIRequestContext, deviceId: number): Promise<void> {
  await request
    .post('/api/kiosk/revoke', {
      data: { deviceId },
      headers: { 'content-type': 'application/json' },
    })
    .catch(() => { /* cleanup is advisory */ });
}

// ── Tablet-context helpers (FRESH, unauthed → device principal) ───────────────

/** A fresh API-only tablet context: empty cookie jar, real baseURL, so `cf_kiosk` is the only credential it can hold. */
async function newTabletApiContext(baseURL: string): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL, storageState: EMPTY_STORAGE });
}

/** A fresh browser tablet page: empty cookie jar + a form-factor descriptor. */
async function newTabletPage(
  browser: Browser,
  baseURL: string,
  descriptor: Record<string, unknown>,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, ...descriptor, storageState: EMPTY_STORAGE });
  const page = await context.newPage();
  return { context, page };
}

/** Drive the tablet's on-screen pairing flow on the proven `/kiosk` welcome floor. */
async function pairViaUi(page: Page, code: string): Promise<void> {
  await page.goto('/kiosk');
  await page.getByRole('button', { name: /set up this tablet/i }).click();
  await expect(page.getByRole('heading', { name: /pair this tablet/i })).toBeVisible();
  await page.getByPlaceholder(/setup code/i).fill(code);
  await page.getByRole('button', { name: /pair tablet/i }).click();
  await expect(page.getByRole('heading', { name: /how can we help/i })).toBeVisible();
}

/** Pair on `/kiosk/v2` (landscape shell) — unpaired devices auto-route to pair via settings 401. */
async function pairViaUiV2(page: Page, code: string): Promise<void> {
  await page.goto('/kiosk/v2');
  await expect(page.getByRole('heading', { name: /pair this tablet/i })).toBeVisible();
  await page.getByPlaceholder(/setup code/i).fill(code);
  await page.getByRole('button', { name: /pair tablet/i }).click();
  await expect(page.getByRole('button', { name: /buy \/ sell/i })).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
// A. API auth contract — enroll → pair → intake, plus every guard rail.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Kiosk API — device-principal auth contract', () => {
  test('full lifecycle: manager enrolls → tablet pairs → device-authed intake (org read from the row)', async ({
    request,
    baseURL,
  }) => {
    const label = uniqueLabel('E2E Lifecycle');
    const { deviceId, code } = await enrollDevice(request, label);
    const tablet = await newTabletApiContext(baseURL!);
    try {
      // Pair: the CODE is the capability — no staff cookie on this context.
      const pairRes = await tablet.post('/api/kiosk/pair', {
        data: { code },
        headers: { 'content-type': 'application/json' },
      });
      expect(pairRes.status(), 'pair should 200').toBe(200);
      const pairBody = (await pairRes.json()) as { ok: boolean; deviceId: string; label: string };
      expect(pairBody.ok).toBe(true);
      expect(Number(pairBody.deviceId)).toBe(deviceId);
      expect(pairBody.label).toBe(label);

      // The device token now rides the context's cookie jar. Intake as the device.
      const intakeRes = await tablet.post('/api/kiosk/intake', {
        data: { service: 'sales' },
        headers: { 'content-type': 'application/json' },
      });
      expect(intakeRes.status(), 'device-authed intake should 200').toBe(200);
      const intakeBody = (await intakeRes.json()) as {
        ok: boolean;
        service: string;
        deviceId: string;
        steppedUp: boolean;
      };
      expect(intakeBody.ok).toBe(true);
      expect(intakeBody.service).toBe('sales');
      expect(Number(intakeBody.deviceId)).toBe(deviceId);
      expect(intakeBody.steppedUp, 'base intake is anonymous — no step-up').toBe(false);
    } finally {
      await tablet.dispose();
      await revokeDevice(request, deviceId);
    }
  });

  test('unpaired gate: an intake with no device token is refused 401 KIOSK_UNPAIRED', async ({ baseURL }) => {
    const tablet = await newTabletApiContext(baseURL!);
    try {
      const res = await tablet.post('/api/kiosk/intake', {
        data: { service: 'sales' },
        headers: { 'content-type': 'application/json' },
        maxRedirects: 0,
      });
      expect(res.status()).toBe(401);
      expect((await res.json()).error).toBe('KIOSK_UNPAIRED');
    } finally {
      await tablet.dispose();
    }
  });

  test('revoke kills the device instantly: intake 200 → revoke → intake 401', async ({ request, baseURL }) => {
    const { deviceId, code } = await enrollDevice(request, uniqueLabel('E2E Revoke'));
    const tablet = await newTabletApiContext(baseURL!);
    try {
      await tablet.post('/api/kiosk/pair', {
        data: { code },
        headers: { 'content-type': 'application/json' },
      });
      const before = await tablet.post('/api/kiosk/intake', {
        data: { service: 'pickup' },
        headers: { 'content-type': 'application/json' },
      });
      expect(before.status(), 'intake works while active').toBe(200);

      await revokeDevice(request, deviceId);

      const after = await tablet.post('/api/kiosk/intake', {
        data: { service: 'pickup' },
        headers: { 'content-type': 'application/json' },
        maxRedirects: 0,
      });
      expect(after.status(), 'revoked device is dead').toBe(401);
      expect((await after.json()).error).toBe('KIOSK_UNPAIRED');
    } finally {
      await tablet.dispose();
      await revokeDevice(request, deviceId);
    }
  });

  test('the manager surfaces are staff-gated: anonymous enroll / revoke / list are refused', async ({ baseURL }) => {
    const anon = await newTabletApiContext(baseURL!);
    try {
      const enroll = await anon.post('/api/kiosk/enroll', {
        data: { label: uniqueLabel('E2E ShouldFail') },
        headers: { 'content-type': 'application/json' },
        maxRedirects: 0,
      });
      expect(enroll.status(), 'anonymous enroll is rejected').toBe(401);

      const revoke = await anon.post('/api/kiosk/revoke', {
        data: { deviceId: 1 },
        headers: { 'content-type': 'application/json' },
        maxRedirects: 0,
      });
      expect(revoke.status(), 'anonymous revoke is rejected').toBe(401);

      const list = await anon.get('/api/kiosk/devices', { maxRedirects: 0 });
      expect(list.status(), 'anonymous device list is rejected').toBe(401);
    } finally {
      await anon.dispose();
    }
  });

  test('pairing codes are single-use and validated: replay + bogus + too-short all fail', async ({ request, baseURL }) => {
    const { deviceId, code } = await enrollDevice(request, uniqueLabel('E2E SingleUse'));
    const tablet = await newTabletApiContext(baseURL!);
    try {
      // First exchange consumes the code.
      const first = await tablet.post('/api/kiosk/pair', {
        data: { code },
        headers: { 'content-type': 'application/json' },
      });
      expect(first.status()).toBe(200);

      // Replay of the same code matches nothing (row is now 'active').
      const replay = await newTabletApiContext(baseURL!);
      try {
        const res = await replay.post('/api/kiosk/pair', {
          data: { code },
          headers: { 'content-type': 'application/json' },
        });
        expect(res.status(), 'a consumed code cannot be replayed').toBe(404);
        expect((await res.json()).error).toBe('INVALID_PAIRING_CODE');
      } finally {
        await replay.dispose();
      }

      // A well-formed but unknown code → 404 (no oracle: same shape as expired/used).
      const bogus = await tablet.post('/api/kiosk/pair', {
        data: { code: 'ZZZZ-not-a-real-code-000' },
        headers: { 'content-type': 'application/json' },
      });
      expect(bogus.status()).toBe(404);

      // A too-short code is a 400 (fails the Zod min(8) before any DB lookup).
      const short = await tablet.post('/api/kiosk/pair', {
        data: { code: 'short' },
        headers: { 'content-type': 'application/json' },
      });
      expect(short.status()).toBe(400);
    } finally {
      await tablet.dispose();
      await revokeDevice(request, deviceId);
    }
  });

  test('input validation: empty enroll label, bad intake service, and unknown revoke target', async ({
    request,
    baseURL,
  }) => {
    // Enroll with a blank label → 400 (Zod min(1)).
    const badEnroll = await request.post('/api/kiosk/enroll', {
      data: { label: '   ' },
      headers: { 'content-type': 'application/json' },
    });
    expect(badEnroll.status(), 'blank label rejected').toBe(400);

    // Revoke a device that isn't in this org → 404 NOT_FOUND (never a cross-org leak).
    const ghost = await request.post('/api/kiosk/revoke', {
      data: { deviceId: 999_999_999 },
      headers: { 'content-type': 'application/json' },
    });
    expect(ghost.status(), 'unknown device revoke is 404').toBe(404);
    expect((await ghost.json()).error).toBe('NOT_FOUND');

    // A paired device sending a service outside the enum → 400.
    const { deviceId, code } = await enrollDevice(request, uniqueLabel('E2E BadService'));
    const tablet = await newTabletApiContext(baseURL!);
    try {
      await tablet.post('/api/kiosk/pair', {
        data: { code },
        headers: { 'content-type': 'application/json' },
      });
      const badService = await tablet.post('/api/kiosk/intake', {
        data: { service: 'not-a-service' },
        headers: { 'content-type': 'application/json' },
      });
      expect(badService.status(), 'service enum enforced').toBe(400);
    } finally {
      await tablet.dispose();
      await revokeDevice(request, deviceId);
    }
  });

  test('PIN step-up: incomplete step-up is 400, a bad PIN is a hard 403 (never a silent anonymous write)', async ({
    request,
    baseURL,
  }) => {
    const { deviceId, code } = await enrollDevice(request, uniqueLabel('E2E StepUp'));
    const tablet = await newTabletApiContext(baseURL!);
    try {
      await tablet.post('/api/kiosk/pair', {
        data: { code },
        headers: { 'content-type': 'application/json' },
      });

      // staffId present but no PIN → STEPUP_INCOMPLETE (400).
      const noPin = await tablet.post('/api/kiosk/intake', {
        data: { service: 'repair', staffId: 1 },
        headers: { 'content-type': 'application/json' },
      });
      expect(noPin.status()).toBe(400);
      expect((await noPin.json()).error).toBe('STEPUP_INCOMPLETE');

      // PIN present but no staffId → STEPUP_INCOMPLETE (400).
      const noStaff = await tablet.post('/api/kiosk/intake', {
        data: { service: 'repair', pin: '0000' },
        headers: { 'content-type': 'application/json' },
      });
      expect(noStaff.status()).toBe(400);
      expect((await noStaff.json()).error).toBe('STEPUP_INCOMPLETE');

      // Complete but WRONG → STEPUP_FAILED (403), not a fall-through to anonymous.
      const badPin = await tablet.post('/api/kiosk/intake', {
        data: { service: 'repair', staffId: 1, pin: 'definitely-wrong-pin' },
        headers: { 'content-type': 'application/json' },
      });
      expect(badPin.status()).toBe(403);
      expect((await badPin.json()).error).toBe('STEPUP_FAILED');

      // And the plain (anonymous) intake still succeeds on the same device.
      const base = await tablet.post('/api/kiosk/intake', {
        data: { service: 'repair' },
        headers: { 'content-type': 'application/json' },
      });
      expect(base.status(), 'base intake stays anonymous & works').toBe(200);
      expect((await base.json()).steppedUp).toBe(false);
    } finally {
      await tablet.dispose();
      await revokeDevice(request, deviceId);
    }
  });

  test('staff-for-stepup + pickup lookup: device-authed, miss is oracle-safe 404', async ({
    request,
    baseURL,
  }) => {
    const { deviceId, code } = await enrollDevice(request, uniqueLabel('E2E Pickup'));
    const tablet = await newTabletApiContext(baseURL!);
    try {
      await tablet.post('/api/kiosk/pair', {
        data: { code },
        headers: { 'content-type': 'application/json' },
      });

      const roster = await tablet.get('/api/kiosk/staff-for-stepup');
      expect(roster.status(), 'step-up roster should 200').toBe(200);
      const rosterBody = (await roster.json()) as { staff: Array<{ id: number; name: string }> };
      expect(Array.isArray(rosterBody.staff)).toBe(true);

      const miss = await tablet.post('/api/kiosk/pickup/lookup', {
        data: { orderNumber: 'RS-999999999', phone: '5551234567' },
        headers: { 'content-type': 'application/json' },
      });
      expect(miss.status()).toBe(404);
      expect((await miss.json()).error).toBe('NOT_FOUND');

      const collectMiss = await tablet.post('/api/kiosk/pickup/collect', {
        data: { repairId: 999_999_999, phone: '5551234567' },
        headers: { 'content-type': 'application/json' },
      });
      expect(collectMiss.status()).toBe(404);
      expect((await collectMiss.json()).error).toBe('NOT_FOUND');
    } finally {
      await tablet.dispose();
      await revokeDevice(request, deviceId);
    }
  });

  test('device list reflects lifecycle: an enrolled device appears awaiting-pairing, then revoked', async ({
    request,
  }) => {
    const label = uniqueLabel('E2E Listed');
    const { deviceId } = await enrollDevice(request, label);
    try {
      const listed = await request.get('/api/kiosk/devices');
      expect(listed.ok()).toBeTruthy();
      const rows = ((await listed.json()) as { devices: Array<{ id: number; label: string; status: string }> })
        .devices;
      const mine = rows.find((d) => Number(d.id) === deviceId);
      expect(mine, 'freshly enrolled device is listed').toBeTruthy();
      expect(mine!.label).toBe(label);
      expect(mine!.status, 'enrolled, not yet paired').toBe('enrolled');

      await revokeDevice(request, deviceId);

      const after = await request.get('/api/kiosk/devices');
      const rows2 = ((await after.json()) as { devices: Array<{ id: number; status: string }> }).devices;
      expect(rows2.find((d) => Number(d.id) === deviceId)?.status, 'now revoked').toBe('revoked');
    } finally {
      await revokeDevice(request, deviceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A2. Kiosk host gating — `{slug}.kiosk.app.cycleforge.ai` (Host-header E2E).
// Connects to the local baseURL but stamps Host so proxy / pair see a kiosk host.
// ─────────────────────────────────────────────────────────────────────────────

function dogfoodKioskHost(): string {
  const explicit = (process.env.NEXT_PUBLIC_KIOSK_HOST_SUFFIX || '').trim().toLowerCase();
  if (explicit) return `usav.${explicit.replace(/^\.+/, '')}`;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (appUrl) {
    try {
      return `usav.kiosk.${new URL(appUrl).hostname.toLowerCase()}`;
    } catch {
      /* fall through */
    }
  }
  return 'usav.kiosk.app.cycleforge.ai';
}

function dogfoodStaffHost(): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (appUrl) {
    try {
      return `usav.${new URL(appUrl).hostname.toLowerCase()}`;
    } catch {
      /* fall through */
    }
  }
  return 'usav.app.cycleforge.ai';
}

test.describe('Kiosk host — subdomain gating', () => {
  test('kiosk host 404s staff enroll / revoke / devices APIs', async ({ baseURL }) => {
    const host = dogfoodKioskHost();
    const ctx = await pwRequest.newContext({
      baseURL: baseURL!,
      storageState: EMPTY_STORAGE,
      extraHTTPHeaders: { Host: host },
    });
    try {
      const enroll = await ctx.post('/api/kiosk/enroll', {
        data: { label: uniqueLabel('E2E KioskHost Enroll') },
        headers: { 'content-type': 'application/json' },
        maxRedirects: 0,
      });
      expect(enroll.status(), `enroll blocked on ${host}`).toBe(404);

      const revoke = await ctx.post('/api/kiosk/revoke', {
        data: { deviceId: 1 },
        headers: { 'content-type': 'application/json' },
        maxRedirects: 0,
      });
      expect(revoke.status(), 'revoke blocked on kiosk host').toBe(404);

      const list = await ctx.get('/api/kiosk/devices', { maxRedirects: 0 });
      expect(list.status(), 'devices list blocked on kiosk host').toBe(404);
    } finally {
      await ctx.dispose();
    }
  });

  test('kiosk host blocks staff surfaces (e.g. /settings → 404)', async ({ baseURL }) => {
    const host = dogfoodKioskHost();
    const ctx = await pwRequest.newContext({
      baseURL: baseURL!,
      storageState: EMPTY_STORAGE,
      extraHTTPHeaders: { Host: host },
    });
    try {
      const res = await ctx.get('/settings', { maxRedirects: 0 });
      expect(res.status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });

  test('pair + intake succeed on the dogfood kiosk Host', async ({ request, baseURL }) => {
    const host = dogfoodKioskHost();
    const label = uniqueLabel('E2E KioskHost Pair');
    const { deviceId, code } = await enrollDevice(request, label);
    const tablet = await pwRequest.newContext({
      baseURL: baseURL!,
      storageState: EMPTY_STORAGE,
      extraHTTPHeaders: { Host: host },
    });
    try {
      const pairRes = await tablet.post('/api/kiosk/pair', {
        data: { code },
        headers: { 'content-type': 'application/json' },
      });
      expect(pairRes.status(), `pair on ${host}`).toBe(200);

      const intakeRes = await tablet.post('/api/kiosk/intake', {
        data: { service: 'sales' },
        headers: { 'content-type': 'application/json' },
      });
      expect(intakeRes.status(), 'intake on kiosk host').toBe(200);
    } finally {
      await tablet.dispose();
      await revokeDevice(request, deviceId);
    }
  });

  test('staff-host /kiosk 308s to the tenant kiosk origin when Host has a slug', async ({ baseURL }) => {
    const staffHost = dogfoodStaffHost();
    const kioskHost = dogfoodKioskHost();
    const ctx = await pwRequest.newContext({
      baseURL: baseURL!,
      storageState: EMPTY_STORAGE,
      extraHTTPHeaders: { Host: staffHost },
    });
    try {
      const res = await ctx.get('/kiosk', { maxRedirects: 0 });
      expect(res.status(), `GET /kiosk on ${staffHost}`).toBe(308);
      const location = res.headers()['location'] || '';
      expect(location, 'Location points at kiosk origin').toContain(kioskHost);
    } finally {
      await ctx.dispose();
    }
  });

  // Production apex + DEFAULT_TENANT_SLUG → same kiosk origin is covered by
  // unit tests on staffKioskRedirectOrigin (proxy only applies that branch when
  // NODE_ENV=production; local E2E keeps serving /kiosk on apex for tablet UI).
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Tablet UI — the rendered customer surface, across desktop + iPad landscape.
// ─────────────────────────────────────────────────────────────────────────────

const TABLET_FACTORS: ReadonlyArray<{ name: string; descriptor: Record<string, unknown> }> = [
  { name: 'desktop', descriptor: { viewport: { width: 1440, height: 900 } } },
  { name: 'iPad landscape', descriptor: { ...devices['iPad Pro 11 landscape'] } },
];

for (const factor of TABLET_FACTORS) {
  test.describe(`Kiosk tablet UI — ${factor.name}`, () => {
    test('pair on-screen, then open a live service tile on /kiosk', async ({
      request,
      browser,
      baseURL,
    }) => {
      const { deviceId, code } = await enrollDevice(request, uniqueLabel(`E2E UI ${factor.name}`));
      const { context, page } = await newTabletPage(browser, baseURL!, factor.descriptor);
      try {
        await pairViaUi(page, code);

        await expect(page.getByRole('heading', { name: /how can we help/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /repair drop-off/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /buy \/ sell/i })).toBeVisible();
      } finally {
        await context.close();
        await revokeDevice(request, deviceId);
      }
    });

    test('landscape shell on /kiosk/v2: dock modes + catalog rail', async ({
      request,
      browser,
      baseURL,
    }) => {
      const { deviceId, code } = await enrollDevice(request, uniqueLabel(`E2E Shell ${factor.name}`));
      const { context, page } = await newTabletPage(browser, baseURL!, factor.descriptor);
      try {
        await pairViaUiV2(page, code);

        await expect(page.getByRole('heading', { name: /catalog/i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /repair details/i })).toBeVisible();

        await page.getByRole('button', { name: /buy \/ sell/i }).click();
        await expect(page.getByRole('heading', { name: /buy \/ sell details/i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /products/i })).toBeVisible();

        await page.getByRole('button', { name: /^pickup$/i }).click();
        await expect(page.getByRole('heading', { name: /pickup details/i })).toBeVisible();
        await expect(page.getByText(/find your order/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /look up order/i })).toBeVisible();
      } finally {
        await context.close();
        await revokeDevice(request, deviceId);
      }
    });

    test('an unpaired tablet can open the pairing screen on /kiosk', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await newTabletPage(browser, baseURL!, factor.descriptor);
      try {
        await page.goto('/kiosk');
        await page.getByRole('button', { name: /set up this tablet/i }).click();
        await expect(page.getByRole('heading', { name: /pair this tablet/i })).toBeVisible();
        await expect(page.getByPlaceholder(/setup code/i)).toBeVisible();
      } finally {
        await context.close();
      }
    });

    test('a bad setup code shows a teaching error, not a pair', async ({ browser, baseURL }) => {
      const { context, page } = await newTabletPage(browser, baseURL!, factor.descriptor);
      try {
        await page.goto('/kiosk');
        await page.getByRole('button', { name: /set up this tablet/i }).click();
        await expect(page.getByRole('heading', { name: /pair this tablet/i })).toBeVisible();

        // 8+ chars so it passes the client length gate and actually POSTs → 404.
        await page.getByPlaceholder(/setup code/i).fill('bogus-code-123');
        await page.getByRole('button', { name: /pair tablet/i }).click();
        await expect(page.getByText(/invalid or expired/i)).toBeVisible();

        await expect(page.getByRole('heading', { name: /pair this tablet/i })).toBeVisible();
      } finally {
        await context.close();
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// C. Manager UI — Settings → Kiosk devices (enroll shows the one-time code, revoke).
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Settings → Kiosk devices (manager surface)', () => {
  test('enroll a tablet from Settings: one-time code is shown, row appears, revoke terminates it', async ({
    page,
  }) => {
    const label = uniqueLabel('E2E Settings');
    // The KioskDevicesSection revoke uses window.confirm — auto-accept it.
    page.on('dialog', (d) => void d.accept());

    await page.goto('/settings?section=devices');

    // Enroll form.
    await page.getByPlaceholder(/tablet name/i).fill(label);
    await page.getByRole('button', { name: /generate code/i }).click();

    // The one-time pairing code panel surfaces (shown once, never re-fetchable).
    await expect(page.getByText(/pairing code.*shown once/i)).toBeVisible();

    // The new device shows up in the list, awaiting pairing.
    const row = page.getByRole('row').filter({ hasText: label });
    await expect(row).toBeVisible();
    await expect(row.getByText(/awaiting pairing/i)).toBeVisible();

    // Revoke it from the row → status flips to Revoked and the action disappears.
    await row.getByRole('button', { name: /revoke/i }).click();
    await expect(row.getByText(/revoked/i)).toBeVisible();
    await expect(row.getByRole('button', { name: /revoke/i })).toHaveCount(0);
  });
});
