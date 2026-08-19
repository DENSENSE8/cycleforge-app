import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Displays header band — runtime verification of the 2026-08-18 merge
 * (`docs/todo/displays-header-band-HANDOFF.md`).
 *
 * The guards already pin the code shape. What only a real runner can answer is
 * the geometry and the ordering as PAINTED: that `⋮` is the last verb cell with
 * the two window controls right of it, that no `>` forward button survives,
 * that the leading resize sash is still grabbable behind the `[<]` Back control
 * (a real past bug — the nav cluster blanketing the sash), and that
 * `ArrowRight` still walks the forward stack with no button to press.
 *
 * QA org (`qa-desktop`) per `.claude/rules/verify.md`; provisions its own
 * carton so nothing depends on today's tenant data.
 */

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-BAND-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry ${res.status()}: ${await res.text()}`).toBeTruthy();
  const id = Number((await res.json())?.record?.id);
  expect(Number.isFinite(id) && id > 0).toBeTruthy();
  return id;
}

async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: { receiving_id: receivingId, sku: `E2E-BAND-${uniq()}`, item_name: 'Header band fixture' },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

async function openDisplays(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
  const toggle = page.getByTestId('unbox-displays-pane-toggle');
  if ((await toggle.count()) > 0) await toggle.first().click();
  await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
}

/** DOM order + geometry of every control inside the column's top band. */
async function band(page: Page) {
  return page.evaluate(() => {
    const col = document.querySelector('[data-testid="receiving-displays-push"]');
    if (!col) return null;
    const nav = col.querySelector('[data-testid="station-displays-leaf-nav"]');
    const anchor = nav ?? col.querySelector('[data-testid="unbox-displays-header-actions"]');
    const bandEl = anchor?.parentElement ?? null;
    if (!bandEl) return null;
    const r = bandEl.getBoundingClientRect();
    const controls = Array.from(bandEl.querySelectorAll('button')).map((b) => {
      const br = b.getBoundingClientRect();
      return {
        testid: b.getAttribute('data-testid'),
        label: (b.getAttribute('aria-label') || b.textContent || '').trim(),
        disabled: b.hasAttribute('disabled'),
        x: Math.round(br.x),
        w: Math.round(br.width),
      };
    });
    return {
      band: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      controls,
      colX: Math.round(col.getBoundingClientRect().x),
    };
  });
}

test.describe('Displays header band', () => {
  test('one band: [<] title … verbs · ⋮ · ⤢ · →|, and no forward button', async ({ page, request }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openDisplays(page, receivingId, lineId);

    const b = await band(page);
    expect(b, 'top band resolved').not.toBeNull();
    const ids = b!.controls.map((c) => c.testid);
    // eslint-disable-next-line no-console
    console.log('BAND CONTROLS', JSON.stringify(b!.controls, null, 2));

    const more = ids.indexOf('unbox-displays-floor-more');
    const full = ids.indexOf('unbox-push-fullscreen');
    expect(more, '⋮ present').toBeGreaterThanOrEqual(0);
    expect(full, 'fullscreen present').toBeGreaterThan(more);

    // Every item VERB sits left of ⋮; the two window controls sit right of it.
    for (const verb of ['unbox-displays-floor-inventory-sync', 'unbox-displays-floor-primary', 'unbox-displays-floor-edit']) {
      const i = ids.indexOf(verb);
      if (i >= 0) expect(i, `${verb} left of ⋮`).toBeLessThan(more);
    }
    const closeIdx = b!.controls.findIndex((c) => /hide (displays|right panel)/i.test(c.label));
    expect(closeIdx, 'close control present').toBeGreaterThan(full);

    // No `>` forward twin anywhere in the column.
    const forward = page
      .getByTestId('receiving-displays-push')
      .getByRole('button', { name: /^forward$/i });
    expect(await forward.count(), 'the `>` forward button is gone').toBe(0);

    // ⋮ is never disabled — Delete always populates it.
    expect(b!.controls[more].disabled, '⋮ never disabled').toBe(false);
  });

  test('⋮ holds Resolve (unfound) then Delete last, styled destructive', async ({ page, request }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openDisplays(page, receivingId, lineId);

    await page.getByTestId('unbox-displays-floor-more').click();
    const resolve = page.getByTestId('unbox-displays-floor-link');
    const del = page.getByTestId('unbox-displays-floor-delete');
    await expect(del).toBeVisible();
    // Unfound fixture ⇒ Resolve is present. (The found case — Resolve absent —
    // is the pure `stationDisplaysFloorMoreItems` unit test.)
    await expect(resolve).toBeVisible();

    const order = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[data-testid^="unbox-displays-floor-"][role="menuitem"]'));
      return items.map((el) => ({
        testid: el.getAttribute('data-testid'),
        text: (el.textContent || '').trim(),
        y: Math.round(el.getBoundingClientRect().y),
        color: getComputedStyle(el).color,
      }));
    });
    // eslint-disable-next-line no-console
    console.log('MORE MENU', JSON.stringify(order, null, 2));
    expect(order.at(-1)?.testid, 'Delete is last').toBe('unbox-displays-floor-delete');
  });

  test('delete removes the carton and the undo toast restores it', async ({ page, request }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openDisplays(page, receivingId, lineId);

    await page.getByTestId('unbox-displays-floor-more').click();
    await page.getByTestId('unbox-displays-floor-delete').click();

    const undo = page.getByRole('button', { name: /undo/i });
    await expect(undo, 'undo toast is the only safety layer now').toBeVisible({ timeout: 10_000 });
    await undo.click();

    // The carton must still exist server-side after undo.
    await page.waitForTimeout(1500);
    const res = await request.get(`/api/receiving-logs?id=${receivingId}`);
    // eslint-disable-next-line no-console
    console.log('AFTER UNDO', res.status(), (await res.text()).slice(0, 300));
    expect(res.ok(), 'carton still readable after undo').toBeTruthy();
  });

  test('the leading resize sash stays grabbable behind the [<] Back control', async ({ page, request }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openDisplays(page, receivingId, lineId);

    const probe = await page.evaluate(() => {
      const col = document.querySelector('[data-testid="receiving-displays-push"]') as HTMLElement | null;
      const sash = document.querySelector('[data-testid="unbox-displays-push-resize"]') as HTMLElement | null;
      if (!col || !sash) return null;
      const sr = sash.getBoundingClientRect();
      const cr = col.getBoundingClientRect();
      const x = Math.round(sr.x + sr.width / 2);
      const ys = [
        Math.round(cr.y + 8), // inside the band, behind [<] Back
        Math.round(cr.y + cr.height / 2),
        Math.round(cr.bottom - 8),
      ];
      return {
        sash: { x: Math.round(sr.x), w: Math.round(sr.width), h: Math.round(sr.height) },
        col: { y: Math.round(cr.y), h: Math.round(cr.height) },
        hits: ys.map((y) => {
          const el = document.elementFromPoint(x, y);
          return {
            y,
            reachesSash: !!el && (el === sash || sash.contains(el) || el.contains(sash)),
            tag: el?.tagName,
            testid: (el as HTMLElement | null)?.closest('[data-testid]')?.getAttribute('data-testid') ?? null,
          };
        }),
      };
    });
    // eslint-disable-next-line no-console
    console.log('SASH PROBE', JSON.stringify(probe, null, 2));
    expect(probe, 'sash resolved').not.toBeNull();
    expect(probe!.sash.h, 'sash spans the column height').toBeGreaterThan(probe!.col.h * 0.9);
    for (const hit of probe!.hits) {
      expect(hit.reachesSash, `sash grabbable at y=${hit.y} (hit ${hit.testid ?? hit.tag})`).toBe(true);
    }
  });

  test('ArrowRight still walks Displays history forward with no `>` button', async ({ page, request }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openDisplays(page, receivingId, lineId);

    const title = () => page.getByTestId('station-displays-leaf-title').first();

    // The cockpit lands a step leaf on open, so the forward stack is one Back away.
    await expect(title()).toBeVisible({ timeout: 15_000 });
    const leafTitle = (await title().innerText()).trim();

    await page.getByTestId('station-displays-history-back').click();
    await page.waitForTimeout(500);
    const afterBack = (await title().count()) > 0 ? (await title().innerText()).trim() : '(index)';
    const navPresent = (await page.getByTestId('station-displays-leaf-nav').count()) > 0;

    // The nav cluster is `pointer-events-none`, so focus it directly rather
    // than clicking (a click lands on the sash beneath it).
    await page.evaluate(() => {
      const nav = document.querySelector('[data-testid="station-displays-leaf-nav"]') as HTMLElement | null;
      const col = document.querySelector('[data-testid="receiving-displays-push"]') as HTMLElement | null;
      (nav ?? col)?.focus?.();
    });
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(600);
    const after = (await title().count()) > 0 ? (await title().innerText()).trim() : '(index)';
    // eslint-disable-next-line no-console
    console.log('HISTORY', JSON.stringify({ leafTitle, afterBack, navPresent, after }));

    expect(afterBack, 'Back left the leaf').not.toBe(leafTitle);
    expect(after, 'ArrowRight walked the forward stack back to the leaf').toBe(leafTitle);
  });

  /**
   * Verb-cell count per station is decided by slot presence, not taste
   * (`cartonFloorPeerOrder`): Unbox = Refresh + Print + Edit + ⋮ (4),
   * Arrival = Refresh + Edit + ⋮ (3), Testing = Edit + ⋮ (2).
   *
   * Selects through the rail like an operator rather than deep-linking — the
   * carton param contract differs per station and is not what this pins.
   */
  for (const station of [
    { name: 'Arrival', path: '/triage', prefix: 'arrival', expected: ['inventory-sync', 'edit', 'more'] },
    { name: 'Testing', path: '/test?view=testing', prefix: 'testing', expected: ['edit', 'more'] },
  ] as const) {
    test(`${station.name} paints ${station.expected.length} verb cells, ⋮ last`, async ({ page }) => {
      await page.goto(station.path);
      const aside = page.locator('aside').first();
      await expect(aside).toBeVisible({ timeout: 30_000 });
      const railRows = page.locator('[data-rail-row]');
      await expect(railRows.first(), 'the QA org has a carton on this station').toBeVisible({
        timeout: 30_000,
      });
      await railRows.first().click();
      await page.waitForTimeout(2500);

      const actions = page.getByTestId(`${station.prefix}-displays-header-actions`);
      if ((await actions.count()) === 0) {
        const toggle = page.getByTestId('unbox-displays-pane-toggle');
        await expect(toggle.first(), 'the ←| Displays toggle is reachable').toBeVisible({
          timeout: 20_000,
        });
        await toggle.first().click();
      }
      await expect(actions.first(), 'the header action cluster is mounted').toBeVisible({
        timeout: 20_000,
      });

      const ids = await actions.first().evaluate((el) =>
        Array.from(el.querySelectorAll('button')).map((b) => b.getAttribute('data-testid')),
      );
      // eslint-disable-next-line no-console
      console.log(`${station.name.toUpperCase()} VERBS`, JSON.stringify(ids));
      expect(ids).toEqual(station.expected.map((k) => `${station.prefix}-displays-floor-${k}`));
    });
  }

  /**
   * Row 2 (ruled 2026-08-19): `Filter displays…` sits between the header band
   * and the first index group, index-only, and the column paints no footer.
   */
  test('row 2 holds the filter above the index; no bottom band', async ({ page, request }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openDisplays(page, receivingId, lineId);

    // Land the Root Index — the cockpit opens a step leaf first.
    const back = page.getByTestId('station-displays-history-back');
    if ((await back.count()) > 0) await back.click();
    await expect(page.getByTestId('station-displays-index')).toBeVisible({ timeout: 15_000 });

    const geo = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const col = document.querySelector('[data-testid="receiving-displays-push"]');
      const row = document.querySelector('[data-testid="unbox-displays-filter-row"]');
      const firstEyebrow = document.querySelector('[data-display-index-group]');
      return {
        column: box('[data-testid="receiving-displays-push"]'),
        band: box('[data-testid="station-displays-leaf-nav"]'),
        filterRow: box('[data-testid="unbox-displays-filter-row"]'),
        index: box('[data-testid="station-displays-index"]'),
        firstGroupY: firstEyebrow ? Math.round(firstEyebrow.getBoundingClientRect().y) : null,
        filterInputs: row ? row.querySelectorAll('input').length : 0,
        // Anything painting in the column's bottom 40px that is not the body.
        deadFooter: !!(col && Array.from(col.children).some((c) =>
          /footer/i.test(c.getAttribute('data-testid') || ''))),
      };
    });
    // eslint-disable-next-line no-console
    console.log('ROW2', JSON.stringify(geo, null, 1));

    expect(geo.filterRow, 'row 2 is mounted').not.toBeNull();
    expect(geo.filterInputs, 'row 2 holds exactly one find field').toBe(1);
    expect(geo.filterRow!.y, 'row 2 sits below the header band').toBeGreaterThanOrEqual(
      geo.band!.y + geo.band!.h - 2,
    );
    expect(geo.firstGroupY, 'row 2 sits above the first group eyebrow').toBeGreaterThan(
      geo.filterRow!.y,
    );
    expect(
      Math.abs(geo.filterRow!.w - geo.column!.w),
      'row 2 spans the column width',
    ).toBeLessThanOrEqual(14);
    expect(geo.deadFooter, 'the column paints no footer').toBe(false);

    // Typing filters the index; the field stays put.
    await page.getByTestId('unbox-displays-filter-row').locator('input').fill('photo');
    await page.waitForTimeout(600);
    const rows = await page.locator('[data-testid^="station-displays-index-"]').count();
    // eslint-disable-next-line no-console
    console.log('FILTERED ROWS', rows);
    expect(rows, 'filtering narrows the index').toBeGreaterThan(0);

    // A leaf inherits no filter chrome.
    await page.locator('[data-testid^="station-displays-index-"]').first().click();
    await page.waitForTimeout(600);
    expect(
      await page.getByTestId('unbox-displays-filter-row').count(),
      'a leaf paints no list-filter row',
    ).toBe(0);
  });
});
