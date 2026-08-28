import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Platform → receiving-type dependency (`platform_type_rules`).
 *
 * Platform is the CONTROLLING field, type is the DEPENDENT one. The seeded rule
 * is `fba → {RETURN}, default RETURN`; every other platform is unconstrained.
 *
 * Covers the three layers the feature is enforced at, because each catches a
 * different failure and none of them subsumes the others:
 *   1. the read model  — the matrix the UI and the route both narrow with
 *   2. the write path  — a named illegal type is rejected; a platform change
 *                        that orphans the type reconciles instead of 400ing
 *   3. the UI          — the type picker offers only what the platform allows
 *   4. authoring       — an admin adds/promotes/removes a rule in Settings and
 *                        the constraint follows, including the mode flip back
 *                        to open when the last rule goes
 *
 * Run: npx playwright test tests/e2e/platform-type-rules.spec.ts --project=desktop
 */

const RULES_URL = '/api/catalog/platform-type-rules';

interface Rule {
  id?: number;
  platformId?: number;
  typeId?: number;
  platform: string;
  type: string;
  typeLabel?: string;
  isDefault: boolean;
}

async function rules(request: APIRequestContext): Promise<Rule[]> {
  const res = await request.get(RULES_URL);
  expect(res.ok(), `${RULES_URL} → ${res.status()}`).toBe(true);
  const body = (await res.json()) as { success: boolean; rules: Rule[] };
  return body.rules ?? [];
}

/** A carton we can safely re-file: read its current pair so we can put it back. */
async function pickCarton(
  request: APIRequestContext,
): Promise<{ id: number; platform: string | null; intake: string | null } | null> {
  const res = await request.get('/api/receiving-lines?view=recent&limit=100');
  if (!res.ok()) return null;
  const body = (await res.json()) as { receiving_lines?: Array<Record<string, unknown>> };
  // `id` is the LINE; `receiving_id` is the carton this feature is filed on, and
  // only some rows carry one — never fall back to `id` or the PATCH 404s.
  const line = (body.receiving_lines ?? []).find((l) => Number(l.receiving_id) > 0);
  if (!line) return null;
  return {
    id: Number(line.receiving_id),
    platform: (line.source_platform as string | null) ?? null,
    intake: (line.intake_type as string | null) ?? null,
  };
}

async function patch(request: APIRequestContext, id: number, data: Record<string, unknown>) {
  return request.patch(`/api/receiving/${id}`, { data });
}

/** Put the carton back the way we found it. */
async function restore(
  request: APIRequestContext,
  carton: { id: number; platform: string | null; intake: string | null },
) {
  await patch(request, carton.id, {
    source_platform: carton.platform ?? '',
    intake_type: carton.intake ?? '',
  });
}

async function readCarton(request: APIRequestContext, id: number) {
  const res = await request.get(`/api/receiving/${id}`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { receiving?: Record<string, any> };
  const row = body.receiving ?? {};
  return {
    platform: (row.source_platform ?? null) as string | null,
    intake: (row.intake_type ?? null) as string | null,
  };
}

test.describe('platform → type dependency', () => {
  test('the matrix is served, and constrains fba only', async ({ request }) => {
    const all = await rules(request);
    const fba = all.filter((r) => r.platform.toLowerCase() === 'fba');

    expect(fba.length, 'fba must be constrained by the seeded rule').toBeGreaterThan(0);
    expect(fba.map((r) => r.type.toUpperCase())).toEqual(['RETURN']);
    expect(fba.some((r) => r.isDefault), 'fba → RETURN is the default').toBe(true);

    // Open-by-default is the whole ergonomics of the design: constraining one
    // platform must not silently constrain the others.
    expect(all.filter((r) => r.platform.toLowerCase() === 'ebay')).toHaveLength(0);
  });

  test('a named illegal type is rejected; a legal one is accepted', async ({ request }) => {
    const carton = await pickCarton(request);
    test.skip(!carton, 'no receiving cartons on this tenant');

    // Put the carton on the constrained platform first.
    const setup = await patch(request, carton!.id, { source_platform: 'fba' });
    expect(setup.ok(), await setup.text()).toBe(true);

    // Caller NAMED a type the platform forbids → 400, they said something wrong.
    const bad = await patch(request, carton!.id, { source_platform: 'fba', intake_type: 'PO' });
    expect(bad.status(), await bad.text()).toBe(400);
    expect(await bad.text()).toContain('intake_type');

    // The pair the platform does allow still goes through.
    const good = await patch(request, carton!.id, { source_platform: 'fba', intake_type: 'RETURN' });
    expect(good.ok(), await good.text()).toBe(true);
    expect((await readCarton(request, carton!.id)).intake?.toUpperCase()).toBe('RETURN');

    // Restore.
    await patch(request, carton!.id, {
      source_platform: carton!.platform ?? '',
      intake_type: carton!.intake ?? '',
    });
  });

  test('changing platform reconciles an orphaned type instead of failing', async ({ request }) => {
    const carton = await pickCarton(request);
    test.skip(!carton, 'no receiving cartons on this tenant');

    // File it as a PO on an unconstrained platform.
    const seed = await patch(request, carton!.id, { source_platform: 'ebay', intake_type: 'PO' });
    expect(seed.ok(), await seed.text()).toBe(true);
    expect((await readCarton(request, carton!.id)).intake?.toUpperCase()).toBe('PO');

    // Now move it to FBA and say NOTHING about the type. Rejecting here would
    // make the platform pill unusable on a mis-filed carton; instead the one
    // legal answer is applied for the operator.
    const moved = await patch(request, carton!.id, { source_platform: 'fba' });
    expect(moved.ok(), await moved.text()).toBe(true);

    const after = await readCarton(request, carton!.id);
    expect(after.platform?.toLowerCase()).toBe('fba');
    expect(after.intake?.toUpperCase(), 'PO must not survive the move to FBA').toBe('RETURN');

    // Restore.
    await patch(request, carton!.id, {
      source_platform: carton!.platform ?? '',
      intake_type: carton!.intake ?? '',
    });
  });

  test('moving to FBA files the carton as a Return with no type given', async ({ request }) => {
    const carton = await pickCarton(request);
    test.skip(!carton, 'no receiving cartons on this tenant');

    // Typeless on an unconstrained platform — the state a fresh carton is in.
    const seed = await patch(request, carton!.id, { source_platform: 'ebay', intake_type: '' });
    expect(seed.ok(), await seed.text()).toBe(true);
    expect((await readCarton(request, carton!.id)).intake ?? '').toBe('');

    // Say only "this is FBA". The rule supplies the rest.
    const moved = await patch(request, carton!.id, { source_platform: 'fba' });
    expect(moved.ok(), await moved.text()).toBe(true);
    expect((await readCarton(request, carton!.id)).intake?.toUpperCase()).toBe('RETURN');

    await restore(request, carton!);
  });

  test('clearing the type on FBA snaps back to Return, never to typeless', async ({ request }) => {
    const carton = await pickCarton(request);
    test.skip(!carton, 'no receiving cartons on this tenant');

    const seed = await patch(request, carton!.id, { source_platform: 'fba', intake_type: 'RETURN' });
    expect(seed.ok(), await seed.text()).toBe(true);

    // A typeless FBA carton renders as "PO" through the effective-type
    // fallback, so an empty type is not a state this platform can be left in.
    // (This path also writes intake_type twice in one UPDATE if the route
    // pushes per-branch — Postgres rejects that, so a 200 here is load-bearing.)
    const cleared = await patch(request, carton!.id, { intake_type: '' });
    expect(cleared.ok(), await cleared.text()).toBe(true);
    expect((await readCarton(request, carton!.id)).intake?.toUpperCase()).toBe('RETURN');

    await restore(request, carton!);
  });

  test('a settled constrained carton stops asking; the pill states the type', async ({
    page,
    request,
  }) => {
    const carton = await pickCarton(request);
    test.skip(!carton, 'no receiving cartons on this tenant');

    const setup = await patch(request, carton!.id, {
      source_platform: 'fba',
      intake_type: 'RETURN',
    });
    expect(setup.ok(), await setup.text()).toBe(true);

    const host = await openCartonBar(page, carton!.id);
    const classify = page.getByTestId('carton-context-classify-pills');
    await expect(classify).toBeVisible({ timeout: 20_000 });

    await expect(classify).toHaveAttribute('data-type-locked', 'true');
    await expect(classify).toContainText(/return/i);

    if (host === 'unbox') {
      // Locked means locked: the type pill advertises no menu, so the one legal
      // answer cannot be turned into an illegal one from here. Asserted on the
      // pill's own affordance, not "no menu exists on the page" — the bar has
      // other hover menus and a page-wide count catches those instead.
      // Skipped on /carton, where every pill is read-only and this is vacuous;
      // the lock rule itself is covered in platform-type-rules.test.ts.
      const typePill = classify.locator('[data-inline-pill]').last().locator('button').first();
      await expect(typePill).not.toHaveAttribute('aria-haspopup', 'menu');
    }

    await restore(request, carton!);
  });

  test('a grandfathered illegal pair stays editable — a rule never strands a carton', async ({
    page,
    request,
  }) => {
    const carton = await pickCarton(request);
    test.skip(!carton, 'no receiving cartons on this tenant');

    // Reach the state a pre-rule carton is in: on FBA, still filed as a PO.
    // The route reconciles a bare platform move, so set the illegal pair the
    // way history did — type first, then platform, without re-stating the type.
    const setup = await patch(request, carton!.id, { source_platform: 'ebay', intake_type: 'PO' });
    expect(setup.ok(), await setup.text()).toBe(true);

    await openCartonBar(page, carton!.id);
    const classify = page.getByTestId('carton-context-classify-pills');
    await expect(classify).toBeVisible({ timeout: 20_000 });

    // Unconstrained platform → nothing narrowed, pill is a live question.
    await expect(classify).toHaveAttribute('data-type-locked', 'false');
    await expect(classify).toContainText(/po/i);

    await restore(request, carton!);
  });
});

/**
 * Open a specific carton's identity bar.
 *
 * Unbox first, because that is where the pills are live. But filing a carton as
 * a RETURN moves it off the Unbox spine entirely (returns are Triage's work),
 * so a test that just set the type it is about to assert would find an empty
 * deck. `/carton/:id` renders the same `CartonContextCard` for any carton
 * regardless of workflow, so it is the fallback rather than a flaky retry.
 *
 * Returns which host answered — the classify pills are read-only on
 * `/carton/:id`, so an interactivity assertion is only meaningful on unbox.
 */
async function openCartonBar(page: Page, receivingId: number): Promise<'unbox' | 'carton'> {
  await page.goto(`/unbox?unboxview=all&openReceivingId=${receivingId}`);
  const bar = page.getByTestId('carton-context-one-row');
  if (await bar.isVisible({ timeout: 12_000 }).catch(() => false)) return 'unbox';

  await page.goto(`/carton/${receivingId}`);
  await expect(bar).toBeVisible({ timeout: 25_000 });
  return 'carton';
}

/**
 * Authoring — Settings → Platforms & Types → gear on a platform.
 *
 * Uses `walmart`, which the seed leaves unconstrained, so these never fight the
 * FBA tests above. Every test removes what it created: a leftover rule would
 * silently constrain a platform for every later run.
 */
test.describe('authoring rules', () => {
  const PLATFORM = 'walmart';

  async function catalogIds(request: APIRequestContext) {
    const [pRes, tRes] = await Promise.all([
      request.get('/api/catalog/platforms'),
      request.get('/api/catalog/types'),
    ]);
    const platforms = ((await pRes.json()) as any).platforms ?? [];
    const types = ((await tRes.json()) as any).types ?? [];
    const platform = platforms.find((p: any) => p.slug === PLATFORM);
    const pick = (slug: string) => types.find((t: any) => t.slug.toLowerCase() === slug);
    return { platform, repair: pick('repair'), trade: pick('trade_in') };
  }

  /**
   * `Number()` on both sides — BIGSERIAL ids arrive as strings from the catalog
   * endpoints and as numbers from the rules endpoint, so a bare `===` here
   * matches nothing and leaves rules behind that constrain later runs.
   */
  /**
   * Rule ids this file created, so cleanup never depends on a read.
   *
   * The rules GET is cached server-side (L1 map + Redis, invalidated on write)
   * and the Redis clear is fire-and-forget, so a read issued straight after a
   * write can be served either the old list OR the new one. A cleanup loop that
   * stops when a GET looks empty can therefore stop on a STALE empty and leave
   * a rule behind, which silently constrains every later run. Deleting by id
   * cannot be fooled that way.
   */
  const created: number[] = [];

  async function track(request: APIRequestContext, res: { json: () => Promise<any> }) {
    const id = Number((await res.json()).id);
    if (Number.isFinite(id) && id > 0) created.push(id);
    return id;
  }

  /** Best-effort sweep of anything an earlier interrupted run left on `platformId`. */
  async function clearRules(request: APIRequestContext, platformId: number | string) {
    const want = Number(platformId);
    for (let pass = 0; pass < 4; pass++) {
      const mine = (await rules(request)).filter((r) => Number(r.platformId) === want && r.id);
      if (!mine.length && pass > 0) break;
      for (const r of mine) await request.delete(`${RULES_URL}/${r.id}`);
    }
  }

  /** The platform's allowed types, polled — read-after-write is eventual here. */
  async function expectAllowed(
    request: APIRequestContext,
    platformId: number | string,
    expected: string[],
  ) {
    const want = Number(platformId);
    await expect
      .poll(
        async () =>
          (await rules(request))
            .filter((r) => Number(r.platformId) === want)
            .map((r) => r.type)
            .sort(),
        { timeout: 15_000 },
      )
      .toEqual([...expected].sort());
  }

  test.afterEach(async ({ request }) => {
    while (created.length) {
      await request.delete(`${RULES_URL}/${created.pop()}`);
    }
  });

  test('adding the first rule closes the platform; removing it reopens', async ({ request }) => {
    const { platform, repair } = await catalogIds(request);
    test.skip(!platform || !repair, 'walmart / repair not in this org catalog');
    await clearRules(request, platform.id);

    // Open by default: no rules, so any type is legal.
    await expectAllowed(request, platform.id, []);

    const res = await request.post(RULES_URL, {
      data: { platformId: platform.id, typeId: repair.id, isDefault: true },
    });
    expect(res.status(), await res.text()).toBe(201);
    const ruleId = await track(request, res);

    // Now closed to exactly that set — and the write path enforces it.
    await expectAllowed(request, platform.id, ['REPAIR']);

    const carton = await pickCarton(request);
    if (carton) {
      const bad = await patch(request, carton.id, {
        source_platform: PLATFORM,
        intake_type: 'PO',
      });
      expect(bad.status(), 'a rule authored in the UI must bind the API').toBe(400);
      await restore(request, carton);
    }

    // Removing the last rule REOPENS the platform — it does not forbid everything.
    const gone = await request.delete(`${RULES_URL}/${ruleId}`);
    expect(gone.ok(), await gone.text()).toBe(true);
    created.pop();
    await expectAllowed(request, platform.id, []);

    if (carton) {
      const ok = await patch(request, carton.id, { source_platform: PLATFORM, intake_type: 'PO' });
      expect(ok.ok(), 'reopened platform accepts any type again').toBe(true);
      await restore(request, carton);
    }
  });

  test('promoting a default demotes the old one in one step', async ({ request }) => {
    const { platform, repair, trade } = await catalogIds(request);
    test.skip(!platform || !repair || !trade, 'walmart / repair / trade_in not in this org catalog');
    await clearRules(request, platform.id);

    const a = await request.post(RULES_URL, {
      data: { platformId: platform.id, typeId: repair.id, isDefault: true },
    });
    expect(a.status(), await a.text()).toBe(201);
    await track(request, a);

    const b = await request.post(RULES_URL, { data: { platformId: platform.id, typeId: trade.id } });
    expect(b.status(), await b.text()).toBe(201);
    const bId = await track(request, b);

    // Promote the second. The partial unique index forbids two defaults, so if
    // this were clear-then-set from the client it would 23505 here.
    const promoted = await request.patch(`${RULES_URL}/${bId}`, { data: { isDefault: true } });
    expect(promoted.ok(), await promoted.text()).toBe(true);

    await expect
      .poll(
        async () =>
          (await rules(request))
            .filter((r) => Number(r.platformId) === Number(platform.id) && r.isDefault)
            .map((r) => r.type),
        { timeout: 15_000 },
      )
      .toEqual(['TRADE_IN']);
  });

  test('a duplicate rule is rejected, not silently doubled', async ({ request }) => {
    const { platform, repair } = await catalogIds(request);
    test.skip(!platform || !repair, 'walmart / repair not in this org catalog');
    await clearRules(request, platform.id);

    const first = await request.post(RULES_URL, {
      data: { platformId: platform.id, typeId: repair.id },
    });
    expect(first.status(), await first.text()).toBe(201);
    await track(request, first);

    const dupe = await request.post(RULES_URL, {
      data: { platformId: platform.id, typeId: repair.id },
    });
    expect(dupe.status(), await dupe.text()).toBe(409);

    await expectAllowed(request, platform.id, ['REPAIR']);
  });

  test('the editor is reachable from Settings and states the open default', async ({
    page,
    request,
  }) => {
    const { platform } = await catalogIds(request);
    test.skip(!platform, 'walmart not in this org catalog');
    await clearRules(request, platform.id);

    await page.goto('/settings?section=catalog');
    const row = page.locator('li', { hasText: 'Walmart' }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    await row.getByRole('button', { name: /allowed types for Walmart/i }).click();

    const editor = page.getByText(/every type is allowed/i);
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('platform-type-rule-add-select')).toBeVisible();
  });
});
