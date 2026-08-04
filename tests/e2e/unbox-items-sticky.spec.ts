import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Unbox Items sticky pin — must sit BELOW the floating carton identity, and
 * must WIN paint against ProcedureDeck faces when they scroll through the
 * sticky Y-band. Negative margin into the identity band let the procedure
 * scroll under the bookmark and clip step faces ("Arrival photos" cut off).
 *
 * Assert geometry + elementFromPoint, not screenshots.
 * Never `waitForLoadState('networkidle')` on /unbox (realtime photo channel).
 *
 * QA org only:
 *   npx playwright test tests/e2e/unbox-items-sticky.spec.ts --project=qa-desktop
 */

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Identity may overhang Items by at most a hairline (subpixel / border). */
const HAIRLINE_PX = 2;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-ITEMS-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.record?.id);
}

async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: {
      receiving_id: receivingId,
      sku: `E2E-IT-${uniq()}`,
      item_name: 'Items sticky fixture',
    },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

async function openUnbox(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('unbox-station-center')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-unbox-items-panel]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('station-identity')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-procedure-deck] [data-procedure-step]').first()).toBeVisible({
    timeout: 30_000,
  });
}

interface LayerBoxes {
  identityBottom: number;
  itemsTop: number;
  itemsBottom: number;
  itemsCenterX: number;
  itemsCenterY: number;
  /** First procedure step that still has any pixels below the identity. */
  firstStepBelowIdentity: {
    key: string;
    top: number;
    bottom: number;
  } | null;
  /** True when any procedure step rect intersects the Items sticky Y-band. */
  stepOverlapsItems: boolean;
}

async function measureLayers(page: Page): Promise<LayerBoxes> {
  return page.evaluate(() => {
    const identity = document.querySelector('[data-testid="station-identity"]');
    const items = document.querySelector('[data-unbox-items-panel]');
    if (!identity || !items) {
      throw new Error('missing identity or items panel');
    }
    const idR = identity.getBoundingClientRect();
    const itR = items.getBoundingClientRect();
    const steps = Array.from(
      document.querySelectorAll('[data-procedure-deck] [data-procedure-step]'),
    );
    let firstStepBelowIdentity: LayerBoxes['firstStepBelowIdentity'] = null;
    let stepOverlapsItems = false;
    for (const el of steps) {
      const r = el.getBoundingClientRect();
      if (r.bottom > idR.bottom + 1 && !firstStepBelowIdentity) {
        firstStepBelowIdentity = {
          key: el.getAttribute('data-procedure-step') ?? '',
          top: r.top,
          bottom: r.bottom,
        };
      }
      if (r.bottom > itR.top + 1 && r.top < itR.bottom - 1) {
        stepOverlapsItems = true;
      }
    }
    return {
      identityBottom: idR.bottom,
      itemsTop: itR.top,
      itemsBottom: itR.bottom,
      itemsCenterX: itR.left + itR.width / 2,
      itemsCenterY: itR.top + itR.height / 2,
      firstStepBelowIdentity,
      stepOverlapsItems,
    };
  });
}

async function scrollStationBody(page: Page, scrollTop: number) {
  const scrollHost = page
    .getByTestId('unbox-station-center')
    .locator('.overflow-y-auto')
    .first();
  await scrollHost.evaluate((el, top) => {
    el.scrollTop = top;
  }, scrollTop);
  await page.waitForTimeout(150);
}

test.describe('unbox items sticky vs carton identity', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desktop station layout');

  test('Items sits below identity; scroll does not clip procedure under the bookmark', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    const atRest = await measureLayers(page);
    expect(
      atRest.itemsTop,
      `Items top (${atRest.itemsTop}) must be at/below identity bottom (${atRest.identityBottom})`,
    ).toBeGreaterThanOrEqual(atRest.identityBottom - HAIRLINE_PX);

    if (atRest.firstStepBelowIdentity) {
      expect(
        atRest.firstStepBelowIdentity.top,
        `step "${atRest.firstStepBelowIdentity.key}" top clipped under identity`,
      ).toBeGreaterThanOrEqual(atRest.identityBottom - HAIRLINE_PX);
    }

    // Scroll the station workbench body — procedure should move; Items sticky.
    await scrollStationBody(page, 240);

    const afterScroll = await measureLayers(page);
    expect(
      afterScroll.itemsTop,
      `after scroll, Items must still clear identity (sticky under bookmark)`,
    ).toBeGreaterThanOrEqual(afterScroll.identityBottom - HAIRLINE_PX);

    if (afterScroll.firstStepBelowIdentity) {
      expect(
        afterScroll.firstStepBelowIdentity.top,
        `after scroll, step "${afterScroll.firstStepBelowIdentity.key}" is clipped by identity`,
      ).toBeGreaterThanOrEqual(afterScroll.identityBottom - HAIRLINE_PX);
    }
  });

  test('Items wins paint over procedure faces in the sticky Y-band', async ({ page, request }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    const scrollHost = page
      .getByTestId('unbox-station-center')
      .locator('.overflow-y-auto')
      .first();
    const maxScroll = await scrollHost.evaluate((el) =>
      Math.max(0, el.scrollHeight - el.clientHeight),
    );
    expect(maxScroll, 'station body must be scrollable to overlap Items').toBeGreaterThan(0);

    let overlapped = false;
    let layers: LayerBoxes | null = null;
    // Walk scroll until a procedure face intersects the sticky Items band.
    for (let top = 80; top <= maxScroll; top += 80) {
      await scrollStationBody(page, top);
      layers = await measureLayers(page);
      if (layers.stepOverlapsItems) {
        overlapped = true;
        break;
      }
    }
    expect(
      overlapped,
      'could not scroll a procedure face into the Items sticky Y-band',
    ).toBe(true);
    expect(layers).not.toBeNull();

    const winner = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        inItems: !!el?.closest('[data-unbox-items-panel]'),
        inStep: !!el?.closest('[data-procedure-step]'),
        tag: el?.tagName ?? null,
      };
    }, { x: layers!.itemsCenterX, y: layers!.itemsCenterY });

    expect(winner.inItems, 'Items must win hit-test under its own rect').toBe(true);
    expect(winner.inStep, 'procedure face must not steal Items paint').toBe(false);
  });
});
