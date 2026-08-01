import { test, expect, type Page } from '@playwright/test';

/**
 * URL param isolation for the surfaces migrated in the 2026-07-29 pass —
 * `/sourcing`, `/test`, `/walk-in` — plus the two LIVE defects that pass
 * uncovered, which are the assertions worth having most.
 *
 * Sibling of `receiving-param-isolation.spec.ts`: same guarantee, different
 * family. The unit tests in `src/lib/routing/route-params.test.ts` pin the
 * mechanism; these pin the observable behaviour through the real router and the
 * real `useSurfaceParamHygiene` hook.
 *
 * The two regressions this locks down were both invisible to the ownership
 * guard, because the params are read through a CONSTANT from a shared module
 * outside every surface tree:
 *
 *   1. `?pane=` — `RouteShell`'s mobile pane toggle. Undeclared, the hygiene hook
 *      stripped it on the commit after the tap and the pane snapped back.
 *   2. `?layout=` / `?density=` / `?weekOffset=` — the station-table contract that
 *      `SAVED_VIEW_PARAM_KEYS` captures. Undeclared, applying a saved view wrote
 *      them and they vanished, so the view silently reverted.
 */

/** Query params on the current URL, as a plain object. */
const paramsOf = (page: Page): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(new URL(page.url()).search));

/**
 * Land on `path`, or skip when this project has no session. Mirrors the sibling
 * spec: `tests/.auth/qa-admin.json` is minted empty in some environments, and a
 * spec that always fails there teaches nothing.
 */
async function gotoAuthed(page: Page, path: string): Promise<void> {
  await page.goto(path);
  if (new URL(page.url()).pathname === '/signin') {
    test.skip(true, `no session for this project (tests/.auth is empty) — cannot reach ${path}`);
  }
}

/**
 * A key NO route spec declares, so the hygiene hook must always drop it.
 *
 * It is the settle SIGNAL: once it is gone, the boundary parse has demonstrably
 * run on this surface and the URL is final.
 */
const PROBE = '__isolation_probe';

/**
 * Land on `path` with the probe attached, wait for the boundary parse to prove it
 * ran, then assert on the settled params.
 *
 * **Why a probe and not "wait until the URL stops changing".** That was the first
 * version and it was wrong in the worst way — two consecutive reads match almost
 * immediately, *before* the effect fires, so it reported "settled" pre-parse.
 * Every "this param survived" test then passed vacuously (the param was still
 * there because nothing had run yet) and two "this param is dropped" tests failed
 * for a reason that had nothing to do with the code. A guard that cannot fail is
 * worse than no guard; so is one that fails for the wrong reason.
 */
async function assertParamsAfterParse(
  page: Page,
  path: string,
  assertion: (params: Record<string, string>) => void,
): Promise<void> {
  const url = new URL(path, 'http://localhost');
  url.searchParams.set(PROBE, '1');
  await gotoAuthed(page, `${url.pathname}${url.search}`);
  // The hook drops the probe; until it does, we have not observed a parse.
  await expect
    .poll(() => paramsOf(page)[PROBE], { timeout: 15_000 })
    .toBeUndefined();
  assertion(paramsOf(page));
}

test.describe('surface param isolation — the boundary parse', () => {
  test.skip(({ isMobile }) => !!isMobile, 'these assert desktop chrome; the pane test is mobile-only');

  /**
   * `/sourcing` used to render the `ParkedSurface` stand-in, so `SourcingPage`
   * — and therefore its hygiene hook — never mounted and these were skipped.
   * Dogfood parking is retired and the real workspace now mounts, so the
   * boundary parse is observable: unskipped as that comment promised.
   */
  test.describe('/sourcing', () => {
    test('drops a foreign param but keeps its own declared set', async ({ page }) => {
    // `skuId` belongs to /products; `by` and `range` belong here and were the two
    // keys BOTH of this surface's old clear lists forgot.
    await assertParamsAfterParse(page, '/sourcing?mode=scout&by=serial&skuId=4821', (params) => {
      expect(params.mode).toBe('scout');
      expect(params.by).toBe('serial');
      expect(params.skuId).toBeUndefined();
    });
  });

    test('refuses a value outside its vocabulary', async ({ page }) => {
    await assertParamsAfterParse(page, '/sourcing?by=hacked&range=7d', (params) => {
      expect(params.by).toBeUndefined();
      expect(params.range).toBeUndefined();
      });
    });
  });

  test('/test keeps the tab params that are read through a constant', async ({ page }) => {
    // `ship` / `testTab` come from `@/utils/*-workspace-state` via a constant, so
    // no literal grep and no guard regex could see them. If they are ever dropped
    // again, the workspace tab silently reverts to its default.
    await assertParamsAfterParse(page, '/test?view=testing&testTab=pending', (params) => {
      expect(params.view).toBe('testing');
      expect(params.testTab).toBe('pending');
    });
  });

  test('/test actually runs the boundary parse (guards the tests above from passing vacuously)', async ({ page }) => {
    // Every "param survived" assertion here would pass if the hygiene hook simply
    // never ran — the param would still be on the URL because nothing removed it.
    // This drops a param NO route declares, so it can only pass when the hook is
    // genuinely mounted and parsing. That distinction is not academic: /sourcing
    // mounted the hook in a conditionally-rendered sidebar panel, and this shape
    // of test is what exposed it.
    await assertParamsAfterParse(page, '/test?triq=BOX-9&view=testing', (params) => {
      expect(params.triq).toBeUndefined();
      expect(params.view).toBe('testing');
    });
  });

  test('/test preserves the station-table contract (the saved-views regression)', async ({ page }) => {
    // The exact set `SAVED_VIEW_PARAM_KEYS` captures for `testing_history`.
    await assertParamsAfterParse(page, '/test?layout=board&density=compact&weekOffset=2', (params) => {
      expect(params.layout).toBe('board');
      expect(params.density).toBe('compact');
      expect(params.weekOffset).toBe('2');
    });
  });

  test('/receiving/history preserves the station-table contract', async ({ page }) => {
    // Same regression, on the surface where it was already live before this pass.
    await assertParamsAfterParse(page, '/receiving/history?layout=board&density=compact', (params) => {
      expect(params.layout).toBe('board');
      expect(params.density).toBe('compact');
    });
  });

  test('/inventory keeps the selection + filter set the old clear list missed', async ({ page }) => {
    // The nav targets nulled only `mode`/`section`/`open`, so these eight rode a
    // mode switch into the next mode. Declared, they survive a paste; the mode
    // switch now drops them by construction instead of by remembering.
    await assertParamsAfterParse(
      page,
      '/inventory?sku=CABLE-001&state=IN_STOCK&condition=used&field=serial&filter=a,b',
      (params) => {
        expect(params.sku).toBe('CABLE-001');
        expect(params.state).toBe('IN_STOCK');
        expect(params.condition).toBe('used');
        expect(params.field).toBe('serial');
        expect(params.filter).toBe('a,b');
      },
    );
  });

  test('/inventory owns its sub-routes and refuses a bad graph direction', async ({ page }) => {
    // One spec covers the sub-routes by prefix; `parts` is a live value the
    // `SkuGraphMode` type omits, so a round-trip on the type would drop it.
    await assertParamsAfterParse(page, '/inventory/graph?view=parts&triq=BOX-9', (params) => {
      expect(params.view).toBe('parts');
      expect(params.triq).toBeUndefined();
    });
    await assertParamsAfterParse(page, '/inventory/graph?view=nope', (params) => {
      expect(params.view).toBeUndefined();
    });
  });

  test('/review keeps its per-mode record ids and drops a sibling surface', async ({ page }) => {
    // All three nav targets used to null `rtab`/`packerLogId`/`orderId`/`choreId`
    // by hand — the widest of the remaining clear lists.
    await assertParamsAfterParse(
      page,
      '/review?mode=pairing&rtab=shipped&packerLogId=5&search=x&triq=BOX-9',
      (params) => {
        expect(params.mode).toBe('pairing');
        expect(params.rtab).toBe('shipped');
        expect(params.packerLogId).toBe('5');
        expect(params.search).toBe('x');
        expect(params.triq).toBeUndefined();
      },
    );
  });

  test('/warehouse keeps the keys its conditional clear list never stripped', async ({ page }) => {
    // `setTab` stripped status/q/room leaving Bins and code leaving Racks, but
    // never serial/showEmpty/view — so those rode every tab switch.
    await assertParamsAfterParse(
      page,
      '/warehouse?tab=bins&serial=SN1&showEmpty=1&room=R1&status=full',
      (params) => {
        expect(params.tab).toBe('bins');
        expect(params.serial).toBe('SN1');
        expect(params.showEmpty).toBe('1');
        expect(params.room).toBe('R1');
        expect(params.status).toBe('full');
      },
    );
  });

  test('/pack keeps the tab param read through a constant', async ({ page }) => {
    // `packview` comes from `PACK_WORKSPACE_TAB_PARAM` — the same constant-keyed
    // blind spot as `?ship=` / `?testTab=` on /test.
    await assertParamsAfterParse(page, '/pack?packview=history&packMode=fragile&triq=B', (params) => {
      expect(params.packview).toBe('history');
      expect(params.packMode).toBe('fragile');
      expect(params.triq).toBeUndefined();
    });
  });

  test('/dashboard drops a foreign param and keeps a declared presence flag', async ({ page }) => {
    // Last surface to mount SurfaceParamHygiene (2026-07-30). `triq` belongs to
    // Triage; `shipped` is a bare presence flag that used to die under paramText.
    await assertParamsAfterParse(page, '/dashboard?triq=BOX-9&shipped', (params) => {
      expect(params.triq).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(params, 'shipped')).toBe(true);
    });
  });

  test('/dashboard keeps shipped-tab filters the ownership guard could not see', async ({ page }) => {
    // Lived under `components/shipped`, outside OWNED_TREES until the hygiene pass
    // — the literal grep of `components/dashboard` alone would have missed them.
    await assertParamsAfterParse(
      page,
      '/dashboard?shipped&shippedFilter=orders&shippedSearchField=tracking&shippedWeekOffset=2',
      (params) => {
        expect(Object.prototype.hasOwnProperty.call(params, 'shipped')).toBe(true);
        expect(params.shippedFilter).toBe('orders');
        expect(params.shippedSearchField).toBe('tracking');
        expect(params.shippedWeekOffset).toBe('2');
      },
    );
  });

  test('/walk-in keeps the legacy deep-link keys its redirect hands off', async ({ page }) => {
    // `?openRepair=` is read only to forward the operator to /pickup?job=repair.
    // Dropped at the boundary, the link would land on a plain history page — so
    // the assertion is that we LEAVE /walk-in, carrying the id.
    await gotoAuthed(page, '/walk-in?openRepair=1');
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 5_000 })
      .not.toBe('/walk-in');
    expect(new URL(page.url()).search).toContain('openRepair=1');
  });

  test('/walk-in drops the proxy-only legacy category key', async ({ page }) => {
    // `?category=` has no client reader — the proxy handles the repair value
    // server-side and deletes it. A non-repair value must not survive here.
    await assertParamsAfterParse(page, '/walk-in?category=sales&mode=pickup', (params) => {
      expect(params.category).toBeUndefined();
      expect(params.mode).toBe('pickup');
    });
  });
});

test.describe('mobile RouteShell pane toggle', () => {
  test.skip(({ isMobile }) => !isMobile, 'the pane toggle only renders below the mobile breakpoint');

  test('?pane= survives the hygiene hook so the tab does not snap back', async ({ page }) => {
    // The live defect: tapping Actions wrote `?pane=actions`, the hook stripped
    // it, and the pane reverted to History on the next commit.
    await assertParamsAfterParse(page, '/test?pane=actions', (params) => {
      expect(params.pane).toBe('actions');
    });
  });

  test('?pane= is still a closed vocabulary', async ({ page }) => {
    await assertParamsAfterParse(page, '/test?pane=bogus', (params) => {
      expect(params.pane).toBeUndefined();
    });
  });
});

/**
 * The boundary parse must run on the MOBILE `RouteShell` branch too.
 *
 * `/products` and the receiving routes used to mount the hook in their sidebar
 * PANEL. On desktop that works — `SidebarContextPanel` mounts the panel by route
 * key — but on mobile the panel rides `RouteShell`'s `actions` slot, and mobile
 * renders one pane at a time defaulting to `history`. So on a phone the parse
 * never ran and a stale deep-link kept every undeclared param. Confirmed live on
 * `/products` before the fix; both now mount at the route level
 * (`app/products/layout.tsx`, `app/receiving/layout.tsx`, and each graduated scan
 * page) via `SurfaceParamHygiene`.
 *
 * `isMobile` is viewport-derived (`UIModeProvider` → `useDeviceMode` →
 * `innerWidth`), so a narrow viewport reproduces the branch on whichever auth
 * project is healthy — the `mobile` project's own session minting is flaky.
 */
test.describe('the parse runs on the mobile RouteShell branch', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const route of [
    '/products',
    '/unbox',
    '/triage',
    '/incoming',
    '/pickup',
    '/repair',
    '/receiving/history',
  ]) {
    test(`${route} parses at mobile width`, async ({ page }) => {
      // The probe's removal IS the assertion — see `assertParamsAfterParse`.
      await assertParamsAfterParse(page, route, () => {});
    });
  }
});
