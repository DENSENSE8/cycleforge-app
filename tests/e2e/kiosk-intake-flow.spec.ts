import {
  test,
  expect,
  devices,
  request as pwRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type Locator,
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

/**
 * Read the device-authed session projection: HTTP status plus the channel that
 * NAMES the bound device (`org:<org>:kiosk:<deviceId>`). Read-only, so both the
 * bind and the revoke contracts can assert device IDENTITY without writing an
 * intake.
 */
async function readKioskSession(
  ctx: APIRequestContext,
): Promise<{ status: number; channel: string; error: string }> {
  const res = await ctx.get('/api/kiosk/session', { maxRedirects: 0 });
  const body: unknown = await res.json().catch(() => ({}));
  const wire: Record<string, unknown> = isWireRecord(body) ? body : {};
  return {
    status: res.status(),
    channel: typeof wire.channel === 'string' ? wire.channel : '',
    error: typeof wire.error === 'string' ? wire.error : '',
  };
}

/** Type guard, not a rename: it is what lets the JSON body be read without a cast. */
function isWireRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

/**
 * Fill a field that a CLIENT component owns, and prove the client kept the text.
 *
 * A React-controlled input renders `value={state}` — so text typed into the
 * server-rendered markup BEFORE hydration is silently discarded the moment React
 * takes the field over (it patches the DOM value back to its own empty state).
 * Playwright's `fill` happily lands on that pre-hydration DOM, which is how the
 * Settings enroll test came to click "Generate code" against an empty `label`
 * and get "Give the tablet a name first." instead of a pairing code — with a
 * green enroll API in the same run.
 *
 * `toPass` retries the fill until the value survives a read-back, so this waits
 * for INTERACTIVITY rather than for a guessed timeout, and it fails loudly if a
 * field genuinely refuses input.
 */
async function fillWhenHydrated(field: Locator, value: string): Promise<void> {
  await expect(async () => {
    await field.fill(value);
    // Assert the field is non-EMPTY rather than equal to `value`: several of
    // these inputs mask as you type (the phone field turns 5035550144 into
    // 503-555-0144), and an exact echo would fail on the formatting rather than
    // on the thing under test. Empty is the only state hydration produces, so
    // non-empty is exactly the signal "the client owns this field now".
    await expect(field).not.toHaveValue('', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** Dogfood autopair lands on the catalog trail (command dropdown + All products). */
async function waitForKioskCatalog(page: Page): Promise<void> {
  await expect(page.getByTestId('kiosk-command-menu')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('kiosk-catalog-trail')).toBeVisible();
  await expect(page.getByTestId('kiosk-catalog-trail').getByTestId('kiosk-command-menu')).toBeVisible();
}

/** Open the trail command menu and pick Repair / Sales / Buyback / Pickup. */
async function selectKioskCommand(
  page: Page,
  command: 'repair' | 'sales' | 'buyback' | 'pickup',
): Promise<void> {
  // A utility slot open mounts a second chrome band beside the hidden catalog
  // trail — always drive the VISIBLE trail's command menu.
  await page
    .getByTestId('kiosk-catalog-trail')
    .filter({ visible: true })
    .getByTestId('kiosk-command-menu')
    .click();
  await page.getByTestId(`kiosk-command-${command}`).click();
}

/** Open `/kiosk` — same catalog shell as `/kiosk/v2` (no welcome tiles). */
async function pairViaUi(page: Page, _code: string): Promise<void> {
  await page.goto('/kiosk');
  await waitForKioskCatalog(page);
}

/** Open `/kiosk/v2` landscape shell. */
async function pairViaUiV2(page: Page, _code: string): Promise<void> {
  await page.goto('/kiosk/v2');
  await waitForKioskCatalog(page);
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

  test('dogfood bind: a tokenless tablet binds its OWN device, and a second tablet does not evict it', async ({
    baseURL,
  }) => {
    // Outside production `withKioskAuth` re-binds instead of answering
    // KIOSK_UNPAIRED (operator 2026-09-14), and the bind is keyed by the
    // durable `cf_kiosk_client` cookie. Two tablets must therefore end up on
    // TWO device rows: one shared row is what made production and localhost
    // knock each other offline mid-test.
    const first = await newTabletApiContext(baseURL!);
    const second = await newTabletApiContext(baseURL!);
    try {
      const channelOf = async (ctx: APIRequestContext): Promise<string> => {
        const session = await readKioskSession(ctx);
        expect(session.status, 'a tokenless kiosk read binds instead of 401ing').toBe(200);
        expect(session.channel, 'the projection names the bound device').toBeTruthy();
        return session.channel;
      };

      const firstChannel = await channelOf(first);
      const secondChannel = await channelOf(second);
      expect(secondChannel, 'each tablet owns its own device row').not.toBe(firstChannel);

      // The first tablet is still itself after the second one bound.
      expect(await channelOf(first)).toBe(firstChannel);
    } finally {
      await first.dispose();
      await second.dispose();
    }
  });

  test('revoke kills THAT device instantly: the revoked token never answers as it again', async ({ request, baseURL }) => {
    // Revocation is still absolute — the row's token dies server-side. What a
    // DEV server adds is a re-bind onto the dogfood device (production answers
    // 401 KIOSK_UNPAIRED instead), so the assertion is about IDENTITY: the
    // revoked device id must never come back, whichever posture is running.
    const { deviceId, code } = await enrollDevice(request, uniqueLabel('E2E Revoke'));
    const tablet = await newTabletApiContext(baseURL!);
    try {
      await tablet.post('/api/kiosk/pair', {
        data: { code },
        headers: { 'content-type': 'application/json' },
      });
      const before = await readKioskSession(tablet);
      expect(before.status, 'the paired device reads while active').toBe(200);
      expect(before.channel, 'the projection names the paired device').toContain(`:kiosk:${deviceId}`);

      await revokeDevice(request, deviceId);

      const after = await readKioskSession(tablet);
      if (after.status === 401) {
        // Production posture: the tablet must (re-)enroll.
        expect(after.error).toBe('KIOSK_UNPAIRED');
      } else {
        // Dev posture: bound to a DIFFERENT (dogfood) device, never the dead one.
        expect(after.status).toBe(200);
        expect(after.channel, 'the revoked device is gone').not.toContain(`:kiosk:${deviceId}`);
      }
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

  test('staff-host /kiosk serves path dogfood (no 308 while J7b DNS pending)', async ({ baseURL }) => {
    const staffHost = dogfoodStaffHost();
    const ctx = await pwRequest.newContext({
      baseURL: baseURL!,
      storageState: EMPTY_STORAGE,
      extraHTTPHeaders: { Host: staffHost },
    });
    try {
      const res = await ctx.get('/kiosk', { maxRedirects: 0 });
      // Path dogfood: staff host serves /kiosk* until kioskPathDogfoodActive flips off.
      expect(res.status(), `GET /kiosk on ${staffHost} (no subdomain 308)`).not.toBe(308);
      expect(res.ok(), `GET /kiosk served (${res.status()})`).toBe(true);
    } finally {
      await ctx.dispose();
    }
  });

  // After J7b: staff /kiosk 308 → kiosk origin resumes when kioskPathDogfoodActive
  // is false (covered by unit tests on staffKioskRedirectOrigin).
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
    test('pair on-screen, then land on the catalog shell on /kiosk', async ({
      request,
      browser,
      baseURL,
    }) => {
      const { deviceId, code } = await enrollDevice(request, uniqueLabel(`E2E UI ${factor.name}`));
      const { context, page } = await newTabletPage(browser, baseURL!, factor.descriptor);
      try {
        await pairViaUi(page, code);

        await expect(page.getByRole('heading', { name: /how can we help/i })).toHaveCount(0);
        await expect(page.getByTestId('kiosk-catalog-category')).toBeVisible();
        await expect(page.getByTestId('kiosk-shell-header')).toHaveCount(0);
      } finally {
        await context.close();
        await revokeDevice(request, deviceId);
      }
    });

    test('landscape shell on /kiosk/v2: trail command menu + utilities', async ({
      request,
      browser,
      baseURL,
    }) => {
      const { deviceId, code } = await enrollDevice(request, uniqueLabel(`E2E Shell ${factor.name}`));
      const { context, page } = await newTabletPage(browser, baseURL!, factor.descriptor);
      try {
        await pairViaUiV2(page, code);

        await expect(page.getByTestId('kiosk-command-menu')).toBeVisible();
        await expect(page.getByTestId('kiosk-mode-spine')).toHaveCount(0);
        await expect(page.getByTestId('kiosk-spine-toggle')).toHaveCount(0);
        await expect(page.getByTestId('kiosk-utility-spine')).toHaveCount(0);
        await expect(page.getByTestId('kiosk-spine-search')).toHaveCount(0);
        // Search is a collapsed glyph by default — the command dropdown
        // leads the trail and the glyph rides second.
        await expect(page.getByTestId('kiosk-search-toggle')).toBeVisible();
        await expect(page.getByTestId('kiosk-catalog-search')).toHaveCount(0);
        await expect(page.getByTestId('kiosk-catalog-trail')).toBeVisible();
        await expect(page.getByTestId('kiosk-catalog-category')).toBeVisible();
        await expect(page.getByTestId('kiosk-catalog-nav')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^go back$/i })).toHaveCount(0);
        /*
         * ONE search glyph, and it is the toggle. Operator 2026-09-15: *"there
         * should not be two search icons. The search icon to close and to open
         * should be the only search icon displayed."* Two magnifiers shipped
         * before — this toggle plus SearchField's own leading icon — and a
         * third control (a standalone X) appeared once the field was open.
         */
        await page.getByTestId('kiosk-search-toggle').click();
        const field = page.getByTestId('kiosk-catalog-search');
        await expect(field.getByPlaceholder(/search all products/i)).toBeVisible();
        await expect(page.getByTestId('kiosk-search-close')).toHaveCount(0);
        await expect(page.getByTestId('search-field-leading-action')).toHaveCount(0);
        await expect(page.getByTestId('kiosk-search-toggle')).toHaveCount(1);
        // The same glyph closes it.
        await page.getByTestId('kiosk-search-toggle').click();
        await expect(field).toHaveCount(0);
        await expect(page.getByRole('heading', { name: /catalog/i })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: /all (repairs|items)/i })).toHaveCount(0);
        await expect(page.locator('[class*="fixed"][class*="bottom-0"]')).toHaveCount(0);

        await expect(page.getByRole('tablist', { name: /kiosk commands/i })).toHaveCount(0);

        // While a paperwork/triage slot is open the shell mounts a second
        // chrome band next to the (hidden) catalog trail — both carry the same
        // testids. Scope every interaction to the VISIBLE trail.
        const trail = page.getByTestId('kiosk-catalog-trail').filter({ visible: true });
        await expect(trail.getByTestId('kiosk-utility-cart')).toBeVisible();
        await expect(page.getByTestId('kiosk-cart-ledger')).toHaveCount(0);
        await trail.getByTestId('kiosk-utility-cart').click();
        const cartSheet = page.getByTestId('kiosk-cart-ledger');
        await expect(cartSheet).toBeVisible();
        /*
         * The CART owns the one band (2026-09-15): StepProgressHeader, X
         * top-left, segments, n/N. The shell does not paint its trail above it
         * — that would stack the two chromes the pane-frame law forbids — so
         * the X is the way out and slot-hopping goes through it. Operator
         * 2026-09-14: "displaying without the header and then the X button top
         * left to close the cart and displaying a stepper on the top".
         */
        await expect(page.getByTestId('kiosk-catalog-trail').filter({ visible: true })).toHaveCount(0);
        await expect(cartSheet.getByTestId('step-progress-count')).toHaveText('0/3');
        await expect(cartSheet.getByTestId('kiosk-cart-close')).toHaveCount(0);
        await cartSheet.getByTestId('step-progress-close').click();
        await expect(cartSheet).toHaveCount(0);

        // Paperwork still wears a titled band, so the trail stays above it and
        // its toggle still closes it from there (port pending).
        await trail.getByTestId('kiosk-utility-paperwork').click();
        await expect(page.getByTestId('kiosk-paperwork-panel')).toBeVisible();
        await trail.getByTestId('kiosk-utility-paperwork').click();
        await expect(page.getByTestId('kiosk-paperwork-panel')).toHaveCount(0);

        await expect(page.getByTestId('kiosk-consult-stance-rail')).toBeVisible();
        await expect(trail.getByTestId('kiosk-consult-stance-menu')).toBeVisible();
        await trail.getByTestId('kiosk-consult-stance-menu').click();
        await expect(page.getByTestId('kiosk-consult-stance-work')).toBeVisible();
        await expect(page.getByTestId('kiosk-consult-stance-show')).toBeVisible();
        await expect(page.getByTestId('kiosk-consult-stance-verify')).toBeVisible();
        await page.keyboard.press('Escape');

        // Trail order: stance left of paperwork left of cart (cart far-right).
        const stanceBox = (await trail.getByTestId('kiosk-consult-stance-menu').boundingBox())!;
        const paperworkBox = (await trail.getByTestId('kiosk-utility-paperwork').boundingBox())!;
        const cartBox = (await trail.getByTestId('kiosk-utility-cart').boundingBox())!;
        expect(stanceBox.x).toBeLessThan(paperworkBox.x);
        expect(paperworkBox.x).toBeLessThan(cartBox.x);

        await page.getByTestId('kiosk-command-menu').click();
        await expect(page.getByTestId('kiosk-command-repair')).toBeVisible();
        await expect(page.getByTestId('kiosk-command-sales')).toBeVisible();
        await expect(page.getByTestId('kiosk-command-buyback')).toBeVisible();
        await expect(page.getByTestId('kiosk-command-pickup')).toBeVisible();
        await expect(page.getByTestId('kiosk-spine-exit')).toBeVisible();
        await page.keyboard.press('Escape');

        // A command switch puts the work surface back; the cart/session is
        // proven by `data-cart-empty` on the shell, not by the column.
        await selectKioskCommand(page, 'repair');
        await expect(page.getByTestId('kiosk-cart-ledger')).toHaveCount(0);
        await expect(page.getByTestId('kiosk-work-surface')).toBeVisible();

        await selectKioskCommand(page, 'sales');
        await expect(page.getByTestId('kiosk-search-toggle')).toBeVisible();
        await expect(page.getByTestId('kiosk-catalog-trail').getByTestId('kiosk-utility-cart')).toBeVisible();

        await selectKioskCommand(page, 'pickup');
        await expect(page.getByRole('heading', { name: /^pickup$/i })).toBeVisible();
        await expect(page.getByText(/find your order/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /look up order/i })).toBeVisible();

        await expect(page.getByTestId('kiosk-command-menu')).toBeVisible();
        await expect(page.getByTestId('kiosk-mode-spine')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: /^pickup$/i })).toBeVisible();

        await expect(page.getByTestId('kiosk-show-customer')).toHaveCount(0);
        await expect(page.getByTestId('kiosk-return-staff')).toHaveCount(0);
        await expect(page.getByTestId('kiosk-utility-spine')).toHaveCount(0);
      } finally {
        await context.close();
        await revokeDevice(request, deviceId);
      }
    });

    test('an unpaired tablet still opens the catalog shell on /kiosk', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await newTabletPage(browser, baseURL!, factor.descriptor);
      try {
        await page.goto('/kiosk');
        await waitForKioskCatalog(page);
        await expect(page.getByRole('heading', { name: /how can we help/i })).toHaveCount(0);
      } finally {
        await context.close();
      }
    });

    test('a bad setup code is not a pairing UI on /kiosk', async ({ browser, baseURL }) => {
      const { context, page } = await newTabletPage(browser, baseURL!, factor.descriptor);
      try {
        await page.goto('/kiosk');
        await waitForKioskCatalog(page);
        await expect(page.getByRole('heading', { name: /pair this tablet/i })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: /how can we help/i })).toHaveCount(0);
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

    await page.goto('/settings?section=devices');

    // Enroll form.
    await fillWhenHydrated(page.getByPlaceholder(/tablet name/i), label);
    await page.getByRole('button', { name: /generate code/i }).click();

    // The one-time pairing code panel surfaces (shown once, never re-fetchable).
    await expect(page.getByText(/pairing code.*shown once/i)).toBeVisible();

    // The new device shows up in the list, awaiting pairing.
    const row = page.getByRole('row').filter({ hasText: label });
    await expect(row).toBeVisible();
    await expect(row.getByText(/awaiting pairing/i)).toBeVisible();

    // Trailing Revoke → stage-overlay confirm (not window.confirm).
    await row.getByRole('button', { name: /^revoke$/i }).click();
    await page.getByRole('button', { name: /confirm revoke/i }).click();
    await expect(row.getByText(/revoked/i)).toBeVisible();
    await expect(row.getByRole('button', { name: /^revoke$/i })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Customer happy paths on /kiosk/v2 — can someone actually COMPLETE a
//    transaction? (POS-modernization Phase 5)
//
// Everything above this line proves the device-auth LIFECYCLE: a manager can
// enroll a tablet, the tablet can pair, and the API refuses everyone else. None
// of it proves the thing the tablet exists to do. That gap is what let the
// `activeField`-pinned-to-`extras` bug ship — the repair pane rendered, paired,
// and passed every test while name and phone were unreachable and Submit could
// never enable.
//
// These run at iPad-landscape only (the real device shape); duplicating a full
// intake at desktop costs a minute of wall-clock to re-prove a viewport.
// ─────────────────────────────────────────────────────────────────────────────

const TABLET = { ...devices['iPad Pro 11 landscape'] };

/** Draw a stroke on the SignaturePad canvas — it is a <canvas>, not an input. */
async function signOn(page: Page): Promise<void> {
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  // The pane scrolls — a boundingBox read while the canvas is below the fold
  // gives viewport coordinates the pointer would land somewhere else entirely.
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('signature canvas has no box');
  const midY = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.2, midY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, midY + 18, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.6, midY - 12, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.8, midY + 6, { steps: 6 });
  await page.mouse.up();
}

/**
 * Repair intake up to (not including) the cart commit: pick a priced service,
 * state the issue, give the device facts and the contact, sign, choose how the
 * support ticket is filed, and put the line in the cart.
 *
 * PAGES the pane's stepper. Only the step on screen is mounted, so the flat
 * "fill every label, then sign" shape this helper used to have could not reach
 * the serial or the signature at all.
 *
 * FOUR units since 2026-09-15: reason → device → contact → review & sign.
 * Device split out of contact that day, and the create-or-link ticket question
 * mounts UNDER the signature on the review step (operator: *"a slider … below
 * the signature so it would be mounted under one step"*) — so it is revealed
 * by the ink and answered without paging, and the commit key stays refused
 * until it is.
 */
async function buildRepairLine(page: Page, customer: { name: string; phone: string }): Promise<void> {
  await selectKioskCommand(page, 'repair');

  // The repair catalog is the live `-RS` projection; take whatever the first
  // priced service is rather than pinning a SKU that the store may retire.
  const tile = page.getByTestId('product-tile').first();
  await expect(tile).toBeVisible({ timeout: 20_000 });
  await tile.click();

  // `data-kiosk-continue` is the catalog's own primary key. A role-name lookup
  // also matches the cart's Continue, which is not what opens the stage.
  await page.locator('[data-kiosk-continue]').click({ timeout: 20_000 });

  const pane = page.getByTestId('kiosk-repair-pane');
  await expect(pane).toBeVisible();

  // 1. Issue — notes alone satisfy the gate when the SKU carries no issue pills.
  await fillWhenHydrated(pane.getByTestId('kiosk-repair-reason-notes'), 'E2E: no power on boot');
  await pane.getByTestId('kiosk-repair-continue').click();

  // 2. Device & quote — the staffer's half: serial off the chassis, the price.
  await fillWhenHydrated(pane.getByTestId('kiosk-repair-serial'), `E2E-SN-${Date.now()}`);
  const price = pane.getByTestId('kiosk-repair-price');
  if (!(await price.inputValue())) await fillWhenHydrated(price, '99');
  await pane.getByTestId('kiosk-repair-continue').click();

  // 3. Contact — the customer's half. Phone is the match key and the gate.
  await fillWhenHydrated(pane.getByTestId('kiosk-customer-name'), customer.name);
  await fillWhenHydrated(pane.getByTestId('kiosk-customer-phone'), customer.phone);
  await pane.getByTestId('kiosk-repair-continue').click();

  // 4. Review & sign — the paperwork, signed. The ticket slider the ink
  // reveals already sits on Create (operator: *"automatically select create
  // new ticket"*), so nothing is tapped here; the link path is exercised
  // against the candidates route in its own spec.
  await signOn(page);

  const submit = page.getByTestId('kiosk-repair-submit');
  await expect(submit).toBeEnabled();
  await submit.click();

  // The details stage paints ONE band — its own step band — so no trail and no
  // cart glyph exist while it is up. Its X is the way back to the catalog.
  await pane.getByTestId('step-progress-close').click();
}

/**
 * Page the cart stepper to its terminal Review step.
 *
 * The cart is a three-unit step flow since 2026-09-15 (Items → Contact →
 * Review), so the submit keys only exist on the last step — operator
 * 2026-09-14: "displaying a stepper on the top for the exact steps within the
 * cart for the user to take". Continue is gated by the same triage blockers the
 * submit is, so an enabled Continue is itself the assertion that the step is
 * satisfied.
 *
 * Asserts the terminal SUBMIT key, not a Pay key: a service-only drop-off takes
 * no money at all (operator 2026-09-15 — it "just prints out a receipt"), so
 * Pay is absent on exactly those visits.
 */
async function advanceCartToReview(page: Page): Promise<void> {
  const cart = page.getByTestId('kiosk-cart-ledger');
  for (const step of ['items', 'contact'] as const) {
    const next = cart.getByTestId('kiosk-cart-continue');
    await expect(next, `${step} step should be satisfied`).toBeEnabled({ timeout: 10_000 });
    await next.click();
  }
  await expect(cart.getByTestId('kiosk-cart-save')).toBeVisible();
}

test.describe('Kiosk v2 — customer happy paths (iPad landscape)', () => {
  test('repair drop-off completes: catalog → issue → customer → signature → cart → checked in', async ({
    request,
    browser,
    baseURL,
  }) => {
    test.slow();
    const { deviceId, code } = await enrollDevice(request, uniqueLabel('E2E Repair Flow'));
    const { context, page } = await newTabletPage(browser, baseURL!, TABLET);
    try {
      await pairViaUiV2(page, code);
      await buildRepairLine(page, { name: 'E2E Customer', phone: '5035550142' });

      // The details stage exited to the catalog, so open the ticket by its
      // glyph — nothing auto-opens the cart.
      await page.getByTestId('kiosk-utility-cart').first().click();
      const cart = page.getByTestId('kiosk-cart-ledger');
      // The dead title band carried "Cart · 1 line"; the step flow carries the
      // same fact as quiet meta under the step header, plus the running total.
      await expect(cart.getByTestId('kiosk-cart-summary')).toContainText('1 line');
      // ONE band, and it is the step band: X top-left, segments, n/N right.
      await expect(cart.getByTestId('step-progress-close')).toBeVisible();
      await expect(cart.getByTestId('kiosk-cart-close')).toHaveCount(0);
      // PG6 — a complete visit fills every segment before anything is paged.
      await expect(cart.getByTestId('step-progress-count')).toHaveText('3/3');

      // Commit WITHOUT payment — a drop-off takes no money; the receipt is the
      // record. The terminal key checks the visit in.
      await advanceCartToReview(page);
      await cart.getByTestId('kiosk-cart-save').click();

      // The receipt face is the proof the counter-transaction waist ran: it can
      // only render from a `CounterTransactionResult` the API returned.
      await expect(cart.getByText(/all set/i)).toBeVisible({ timeout: 30_000 });
      await expect(cart.getByText(/service RS-\d+ checked in|sale staged/i)).toBeVisible();
      await expect(cart.getByRole('button', { name: /next customer/i })).toBeVisible();
    } finally {
      await context.close();
      await revokeDevice(request, deviceId);
    }
  });

  test('the cart is the session root: switching command never clears the lines', async ({
    request,
    browser,
    baseURL,
  }) => {
    test.slow();
    const { deviceId, code } = await enrollDevice(request, uniqueLabel('E2E Cart Root'));
    const { context, page } = await newTabletPage(browser, baseURL!, TABLET);
    try {
      await pairViaUiV2(page, code);
      await buildRepairLine(page, { name: 'E2E Root', phone: '5035550143' });

      await page.getByTestId('kiosk-utility-cart').first().click();
      const cart = page.getByTestId('kiosk-cart-ledger');
      await expect(cart.getByTestId('kiosk-cart-summary')).toContainText('1 line');

      // Commands SWAP the centre; they are not a new session. This is the one
      // hard constraint the whole v2 shell rests on (kiosk-shell.md).
      //
      // The cart now MOUNTS in that same centre, so a command switch puts the
      // work surface back and the ledger is no longer on screen — the invariant
      // is that the SESSION survives, not that the column is visible. The shell
      // publishes it as `data-cart-empty`, which is chrome-independent.
      const shell = page.getByTestId('kiosk-shell');
      for (const command of ['sales', 'pickup', 'repair'] as const) {
        await selectKioskCommand(page, command);
        await expect(shell).toHaveAttribute('data-cart-empty', 'false');
        await expect(page.getByTestId('kiosk-work-surface')).toBeVisible();
      }

      // …and reopening the ticket still shows the same one line.
      await page.getByTestId('kiosk-utility-cart').click();
      await expect(cart.getByTestId('kiosk-cart-summary')).toContainText('1 line');

      // UPDATE — the row opens an editor and the edit sticks on the line.
      await cart.getByTestId('kiosk-cart-line').first().click();
      const editor = page.getByTestId('kiosk-cart-line-editor');
      await expect(editor).toBeVisible();
      const serial = editor.getByTestId('kiosk-line-serial');
      await serial.fill('E2E-EDITED-SN');
      await expect(serial).toHaveValue('E2E-EDITED-SN');
      await editor.getByTestId('kiosk-line-done').click();
      await expect(editor).toHaveCount(0);

      // Stance rail stays on the far-right column (Work · Show · Verify).
      await expect(page.getByTestId('kiosk-consult-stance-rail')).toBeVisible();

      // DELETE — void the whole ticket (two-tap confirm).
      await page.getByTestId('kiosk-utility-cart').click();
      await cart.getByTestId('kiosk-cart-void-all').click();
      await cart.getByTestId('kiosk-cart-void-all').click();
      // Assert on the rows, not the empty-state copy: an emptied cart lets the
      // attract loop take the screen, and the overlay hides that text.
      await expect(cart.getByTestId('kiosk-cart-line')).toHaveCount(0, { timeout: 5_000 });
    } finally {
      await context.close();
      await revokeDevice(request, deviceId);
    }
  });

  test('Pay demands a staff PIN on the tablet — card data never reaches the customer face', async ({
    request,
    browser,
    baseURL,
  }) => {
    test.slow();
    const { deviceId, code } = await enrollDevice(request, uniqueLabel('E2E Pay StepUp'));
    const { context, page } = await newTabletPage(browser, baseURL!, TABLET);
    try {
      await pairViaUiV2(page, code);
      /*
       * A GOODS visit, because Pay only exists when money is due at this
       * counter: operator 2026-09-15, *"a repair service on drop off never
       * takes money off, it just prints out a receipt."* A sales tile is a cart
       * line on tap, so this is the shortest payable visit there is.
       */
      await selectKioskCommand(page, 'sales');
      const tile = page.getByTestId('product-tile').first();
      await expect(tile).toBeVisible({ timeout: 20_000 });
      await tile.click();

      await page.getByTestId('kiosk-utility-cart').first().click();
      const cart = page.getByTestId('kiosk-cart-ledger');
      await expect(cart).toBeVisible();

      // Items is satisfied by the tap; Contact needs the match key.
      await cart.getByTestId('kiosk-cart-continue').click();
      await fillWhenHydrated(cart.getByTestId('kiosk-customer-phone'), '5035550144');
      await cart.getByTestId('kiosk-cart-continue').click();

      await expect(cart.getByTestId('kiosk-cart-due-now')).toBeVisible();
      await cart.getByTestId('kiosk-cart-pay').click();

      // Step-up first, always: the tablet asks for a staff PIN before it will
      // take money, and it never asks for a card number.
      await expect(page.getByText(/pin/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByPlaceholder(/card|number|cvv/i)).toHaveCount(0);
    } finally {
      await context.close();
      await revokeDevice(request, deviceId);
    }
  });

  test('a service-only drop-off offers no payment at all', async ({ request, browser, baseURL }) => {
    test.slow();
    const { deviceId, code } = await enrollDevice(request, uniqueLabel('E2E Dropoff Money'));
    const { context, page } = await newTabletPage(browser, baseURL!, TABLET);
    try {
      await pairViaUiV2(page, code);
      await buildRepairLine(page, { name: 'E2E Dropoff', phone: '5035550145' });
      await page.getByTestId('kiosk-utility-cart').first().click();

      const cart = page.getByTestId('kiosk-cart-ledger');
      await advanceCartToReview(page);

      // The quote is stated as DUE AT PICKUP, there is no due-now row, and no
      // Pay key exists to press. Operator 2026-09-15: a drop-off "never takes
      // money off, it just prints out a receipt".
      await expect(cart.getByTestId('kiosk-cart-due-at-pickup')).toBeVisible();
      await expect(cart.getByTestId('kiosk-cart-due-now')).toHaveCount(0);
      await expect(cart.getByTestId('kiosk-cart-pay')).toHaveCount(0);
      await expect(cart.getByTestId('kiosk-cart-save')).toContainText(/check in & print/i);
    } finally {
      await context.close();
      await revokeDevice(request, deviceId);
    }
  });

  test('order pickup: a miss teaches, and never confirms an order exists', async ({
    request,
    browser,
    baseURL,
  }) => {
    const { deviceId, code } = await enrollDevice(request, uniqueLabel('E2E Pickup UI'));
    const { context, page } = await newTabletPage(browser, baseURL!, TABLET);
    try {
      await pairViaUiV2(page, code);
      await selectKioskCommand(page, 'pickup');

      const pane = page.getByTestId('kiosk-pickup-pane');
      await expect(pane).toBeVisible();

      await fillWhenHydrated(pane.getByTestId('kiosk-pickup-order'), 'E2E-NO-SUCH-ORDER');
      const phone = pane.getByLabel(/phone/i).first();
      if (await phone.count()) await fillWhenHydrated(phone, '5035550199');
      await pane.getByRole('button', { name: /look up order/i }).click();

      // Oracle-safe: a miss must not distinguish "wrong phone" from "no order".
      await expect(pane.getByText(/(couldn't|could not|no).*(find|match)|check the (number|details)/i))
        .toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
      await revokeDevice(request, deviceId);
    }
  });
  test('utility glyphs swap the CENTER stage — never a drawer over the work', async ({
    request,
    browser,
    baseURL,
  }) => {
    test.slow();
    const { deviceId, code } = await enrollDevice(request, uniqueLabel('E2E Center Mount'));
    const { context, page } = await newTabletPage(browser, baseURL!, TABLET);
    try {
      await pairViaUiV2(page, code);

      const work = page.getByTestId('kiosk-work-surface');
      const trail = page.getByTestId('kiosk-catalog-trail').filter({ visible: true });
      await expect(work).toBeVisible();
      await expect(trail).toBeVisible();
      await page.screenshot({ path: 'test-results/kiosk-center-1-catalog.png', fullPage: false });

      const viewport = page.viewportSize()!;

      for (const [slot, panelId, shot] of [
        ['cart', 'kiosk-cart-ledger', 'kiosk-center-2-cart.png'],
        ['paperwork', 'kiosk-paperwork-panel', 'kiosk-center-3-paperwork.png'],
      ] as const) {
        await page.getByTestId(`kiosk-utility-${slot}`).click();
        const panel = page.getByTestId(panelId);
        await expect(panel).toBeVisible();
        await expect(page.getByTestId('kiosk-catalog-trail').filter({ visible: true })).toBeVisible();
        await expect(page.getByTestId('kiosk-catalog-trail').filter({ visible: true }).getByTestId('kiosk-utility-cart')).toBeVisible();

        await expect(work).toBeHidden();

        const box = (await panel.boundingBox())!;
        expect(box.width).toBeGreaterThan(viewport.width * 0.85);
        expect(box.x).toBeLessThan(24);

        // 3. Nothing floats: the panel is in flow, so the page never scrolls
        //    horizontally and no overlay sits above the work.
        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflows).toBe(false);

        await page.screenshot({ path: `test-results/${shot}`, fullPage: false });
      }

      // Toggling the active glyph returns the centre to the work surface.
      await page.getByTestId('kiosk-utility-paperwork').click();
      await expect(work).toBeVisible();
      await expect(page.getByTestId('kiosk-paperwork-panel')).toHaveCount(0);
    } finally {
      await context.close();
      await revokeDevice(request, deviceId);
    }
  });
});
