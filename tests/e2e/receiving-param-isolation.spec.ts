import { test, expect, type Page } from '@playwright/test';

/**
 * Receiving URL param isolation (nav/routing refactor, Slice 1).
 *
 * The reported bug: a Triage-only param rode a mode switch into Unbox. The cause
 * was never routing — `updateMode` copied the whole query string forward and then
 * hand-deleted whatever `MODE_SCOPED_PARAMS` happened to list. Both denylists are
 * gone; each surface now declares what it owns
 * (`src/lib/routing/receiving-routes.ts`) and drops the rest at the boundary.
 *
 * These assert the guarantee end-to-end, through the real router and the real
 * hygiene hook — the unit tests pin the mechanism, this pins the behaviour.
 *
 * Desktop-only: the station nav column (and therefore the mode rail) does not
 * render on the mobile receiving surface, which is a photo feed.
 */

test.describe('receiving param isolation', () => {
  test.skip(({ isMobile }) => !!isMobile, 'station nav column is a desktop surface');

  /** Query params on the current URL, as a plain object. */
  const paramsOf = (page: Page): Record<string, string> =>
    Object.fromEntries(new URLSearchParams(new URL(page.url()).search));

  /**
   * Land on `path`, or skip when this project has no session. `tests/.auth/
   * qa-admin.json` is minted empty in some environments; a spec that always
   * fails there teaches nothing, and this starts passing the moment it is real.
   */
  async function gotoAuthed(page: Page, path: string): Promise<void> {
    await page.goto(path);
    if (new URL(page.url()).pathname === '/signin') {
      test.skip(true, 'no session for this project (tests/.auth is empty) — cannot reach /triage');
    }
  }

  /** Click a receiving mode in the station nav column, revealing it if collapsed. */
  async function switchMode(page: Page, label: string): Promise<void> {
    const sidebar = page.locator('aside');
    const modeButton = sidebar.getByRole('button', { name: label, exact: true }).first();
    if (!(await modeButton.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Show sidebar' }).click();
    }
    await modeButton.click();
  }

  test('a foreign param cannot survive landing on a receiving surface', async ({ page }) => {
    // `view`/`testTab` belong to Testing; `state`/`po_from` to Incoming. None is
    // declared by /triage, so all four are dropped on arrival — while Triage's
    // own params survive untouched.
    await gotoAuthed(
      page,
      '/triage?triq=BOX-9&triview=unfound&view=testing&testTab=returns&state=STALLED&po_from=2026-01-01',
    );
    await expect(page).toHaveURL(/\/triage/);
    await expect.poll(() => paramsOf(page).view, { timeout: 15_000 }).toBeUndefined();

    const params = paramsOf(page);
    expect(params.testTab).toBeUndefined();
    expect(params.state).toBeUndefined();
    expect(params.po_from).toBeUndefined();

    // Triage's own state is untouched — isolation is not amnesia.
    expect(params.triq).toBe('BOX-9');
    expect(params.triview).toBe('unfound');
  });

  test('a param with a valid name but a bogus value is dropped too', async ({ page }) => {
    await gotoAuthed(page, '/unbox?unboxview=not-a-tab&openReceivingId=0');
    await expect.poll(() => paramsOf(page).unboxview, { timeout: 15_000 }).toBeUndefined();
    expect(paramsOf(page).openReceivingId).toBeUndefined();
  });

  test('switching Triage → Unbox leaves no Triage state behind', async ({ page }) => {
    await gotoAuthed(page, '/triage?triq=BOX-9&triview=unfound');
    await expect(page).toHaveURL(/triq=BOX-9/);

    await switchMode(page, 'Unbox');
    await expect(page).toHaveURL(/\/unbox/);

    const params = paramsOf(page);
    expect(params.triq, 'the Triage carton filter must not ride into Unbox').toBeUndefined();
    expect(params.triview).toBeUndefined();
    // And the mode param itself: being on /unbox IS the mode.
    expect(params.mode).toBeUndefined();
  });

  test('the staff filter is the one thing a mode switch carries', async ({ page }) => {
    await gotoAuthed(page, '/triage?staff=1&triq=BOX-9');

    await switchMode(page, 'Unbox');
    await expect(page).toHaveURL(/\/unbox/);

    const params = paramsOf(page);
    expect(params.staff, 'staff is an operator preference, not mode state').toBe('1');
    expect(params.triq).toBeUndefined();
  });
});
