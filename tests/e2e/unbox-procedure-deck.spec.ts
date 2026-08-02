import { test, expect, type APIRequestContext, type Page, type Locator } from '@playwright/test';
import { captureStepVocabulary } from '../../src/components/receiving/workspace/derive-capture-step-states';

/**
 * Unbox procedure focus deck — the rendered half of its invariants.
 *
 * The deck shipped with three defects that typecheck, lint and every existing
 * guard were blind to, and that were only found by putting it on a screen. Two of
 * them are the kind that come back on the next refactor, so they are pinned here:
 *
 *  1. **The pile un-tucked.** Tailwind v4 compiles `space-y-N` to
 *     `margin-block-END` on the *preceding* sibling, so the queued cards' own
 *     negative `margin-top` could not cancel it. It rendered 12px apart while
 *     both the computed margin and the class list read exactly as intended.
 *  2. **The peek was pointer-dead.** Every queued card carried the peek's
 *     `z-20`; the covered ones are later siblings, so they painted *over* the
 *     peek and swallowed every click on its sliver. The deck's only forward
 *     affordance did not work and the screenshot was perfect.
 *  3. Three translucent layers double-imaged the queued labels — the *record*
 *     going illegible, which occlusion is never allowed to touch. Cut to one.
 *
 * The structural half (no filter/sort, one face height, rem geometry, layer
 * order) is pinned without a browser in
 * `src/design-system/components/procedure/procedure-deck-order.guard.test.ts`.
 *
 * ## Assert the invariant, not a sample
 *
 * The sliver is `PROCEDURE_PEEK_REM`, which moves with the root font size (the
 * Settings text-size control), so a pixel literal here would be right at exactly
 * one setting. Everything below is a relationship between measured boxes:
 * covered cards are *coincident with* the peek, the sliver is *a fraction of* a
 * face, the pile costs *one* peek unit however long the queue is.
 *
 * **Never `waitForLoadState('networkidle')` on /unbox** — the carton subscribes
 * to a realtime photo channel and the page never settles. It costs a full 60s
 * timeout.
 *
 * QA org only (`.claude/rules/verify.md`):
 *   pnpm provision:qa-org
 *   npx playwright test tests/e2e/unbox-procedure-deck.spec.ts --project=qa-desktop
 */

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** The shape the fixture below produces: no PO, shipped, not a return. */
const UNFOUND_VARIANT = { isUnfound: true, isLocalPickup: false, isReturn: false };

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-DECK-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.record?.id);
}

async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: { receiving_id: receivingId, sku: `E2E-DK-${uniq()}`, item_name: 'Deck fixture' },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

async function openDeck(page: Page, receivingId: number, lineId: number): Promise<Locator> {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
  const deck = page.locator('[data-procedure-deck]');
  // The deck renders a flat skeleton until the photo counts settle; the real
  // cards carry the step keys.
  await expect(deck.locator('[data-procedure-step]').first()).toBeVisible({ timeout: 30_000 });
  return deck;
}

const stepKeys = (deck: Locator) =>
  deck.locator('[data-procedure-step]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-procedure-step') ?? ''),
  );

const zones = (deck: Locator) =>
  deck.locator('[data-procedure-step]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-procedure-zone') ?? ''),
  );

/** Measured boxes in DOM order, so relationships can be asserted between them. */
const boxes = (deck: Locator) =>
  deck.locator('[data-procedure-step]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        key: el.getAttribute('data-procedure-step') ?? '',
        zone: el.getAttribute('data-procedure-zone') ?? '',
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        hasButton: !!el.querySelector('button'),
      };
    }),
  );

test.describe('unbox procedure deck', () => {
  test('every declared step is mounted, in vocabulary order, with exactly one in focus', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    const deck = await openDeck(page, receivingId, lineId);

    // The deck is a TRANSFORM: nothing is filtered out, nothing is re-sorted.
    // This is attempt #1's exact defect (`UnboxCaptureStack`, deleted at
    // 33a3eb609) — it hid pending steps and re-sorted completed ones.
    const expected = captureStepVocabulary(UNFOUND_VARIANT).map((s) => s.key);
    expect(expected.length).toBeGreaterThan(3);
    expect(
      await stepKeys(deck),
      'the deck must mount every declared step in declaration order — an unmatched ' +
        'carton with no PO resolves the unfound vocabulary',
    ).toEqual(expected);

    const focused = (await zones(deck)).filter((z) => z === 'focus');
    expect(focused, 'exactly one card holds the focus slot').toHaveLength(1);
  });

  test('exactly one queued card peeks; the rest collapse behind it and take no clicks', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    const deck = await openDeck(page, receivingId, lineId);

    const measured = await boxes(deck);
    const focus = measured.find((b) => b.zone === 'focus');
    const queued = measured.filter((b) => b.zone === 'queued');

    expect(focus, 'the fixture must leave a step in focus').toBeTruthy();
    expect(
      queued.length,
      'the fixture must leave a queue behind the focus card, or there is no pile to measure',
    ).toBeGreaterThan(1);

    const [peek, ...covered] = queued;

    // The sliver: below the focus card, by strictly less than a whole face.
    // Expressed against the peek's own measured height rather than a px literal,
    // because the unit is rem and moves with the text-size setting.
    const sliver = peek.bottom - focus!.bottom;
    expect(sliver, 'the peek must show BELOW the focus card').toBeGreaterThan(0);
    expect(
      sliver,
      'the peek must be a sliver, not a second full card — one peek says "there is ' +
        'more after this"; a second layer buys no information and costs the focus ' +
        'card its adjacency to the composer',
    ).toBeLessThan(peek.height);

    for (const card of covered) {
      // Coincident with the peek to within a rounding pixel: nothing of a covered
      // card is ever on screen, however many of them there are.
      expect(
        Math.abs(card.bottom - peek.bottom),
        `"${card.key}" is not collapsed behind the peek — the pile is showing a ` +
          'second visible layer, which reads as a card that failed to paint',
      ).toBeLessThanOrEqual(1);
      expect(
        card.hasButton,
        `"${card.key}" is covered but renders a <button>. It cannot be seen or clicked, ` +
          'yet it still takes Tab — a phantom affordance. The right-edge checklist is ' +
          'where those steps are reached.',
      ).toBe(false);
    }
  });

  test('clicking the peek sliver promotes it, and hands focus back to the scan bar', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    const deck = await openDeck(page, receivingId, lineId);

    const measured = await boxes(deck);
    const focusKey = measured.find((b) => b.zone === 'focus')?.key;
    const peek = measured.filter((b) => b.zone === 'queued')[0];
    expect(peek, 'no queued card to promote').toBeTruthy();

    const peekEl = deck.locator(`[data-procedure-step="${peek.key}"]`);
    const box = await peekEl.boundingBox();
    expect(box).toBeTruthy();

    // Click INSIDE the visible sliver, not the element centre — the centre sits
    // behind the focus card, and a centre click would silently hit that instead.
    // Playwright's hit-target check makes this a real assertion that the sliver
    // is the topmost element there, which is exactly the defect that shipped.
    await peekEl.click({ position: { x: box!.width / 2, y: box!.height - 3 } });

    await expect
      .poll(() => deck.locator(`[data-procedure-step="${peek.key}"]`).getAttribute('data-procedure-zone'), {
        timeout: 10_000,
        message: 'clicking the sliver must promote that step into the focus slot',
      })
      .toBe('focus');

    expect(
      await deck.locator(`[data-procedure-step="${focusKey}"]`).getAttribute('data-procedure-zone'),
      'the step that was focused becomes history — the deck never holds two focus cards',
    ).not.toBe('focus');

    // A face is a real <button>, so the click leaves focus on it and the next
    // wedge scan would type into a button whose Enter re-activates it. The
    // failure mode is invisible, which is what makes it expensive.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.activeElement?.hasAttribute('data-station-scan-input') ? 'scan-bar' : 'other',
          ),
        {
          timeout: 10_000,
          message: 'every pointer control on this surface must hand focus back to the wedge',
        },
      )
      .toBe('scan-bar');
  });

  test('the deck adds no second scroll port — the page itself never scrolls', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openDeck(page, receivingId, lineId);

    // An operator with a scanner in one hand cannot be asked which of two
    // scrollers they are in. The station host owns the one port; a nested
    // `flex-1 overflow-y-auto` here has no basis and shipped as dead CSS that
    // still occupied space.
    const overflows = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return el.scrollHeight - el.clientHeight;
    });
    expect(overflows, 'the document must not scroll — the workbench port does').toBeLessThanOrEqual(1);
  });
});
