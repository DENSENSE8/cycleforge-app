/**
 * SSR first-paint stand-in for the landscape kiosk shell.
 *
 * Callers: `/kiosk` + `/kiosk/v2` loading + `KioskV2Runtime` bind wait.
 * Affected API: none.
 * Data schemas: none.
 * User: "Converting the left sidebar into just a top left drop down so repair
 * or sales or more and then an exit button so you can exit out of the kiosk
 * mode. The right sidebar should also be removed as well and everything placed
 * into the top header, the cart, the paperwork, the work, show, verify, etc."
 *
 * One trail row: command ghost, search glyph, All-products ghost, utilities.
 * Server-safe — no `'use client'`.
 *
 * ## It must wear the SAME tokens the live trail wears
 *
 * This mounted `KIOSK_PANE_HEADER_BAND` until 2026-09-15 — the band bolted to
 * a PANE, which is opaque card-white and carries `border-b border-border-soft`.
 * Its own docblock says that fill and seam are wrong inside the trail. The live
 * row is {@link KIOSK_POS_TRAIL_BAND}: transparent, no seam. So every reload
 * flashed a bottom hairline under the header and the All-products row that the
 * hydrated surface does not have (operator 2026-09-15: *"there seems to be
 * hard-coded CSS that is displaying the mode bottom hairline for the header and
 * all products on page reload"*).
 *
 * The ghosts were hand-written literals for the same reason, so the skeleton
 * was a second, differently-shaped design of one row: bare text where the live
 * control is a bordered pill (`KIOSK_POS_TRAIL_CONTROL`), `HEADER_ICON_WRAP`
 * squares where the live glyph is a round chip (`KIOSK_POS_TRAIL_ICON`), and
 * two inline chevron `<svg>`s where the icon SoT exports `ChevronDown`.
 *
 * Rule for this file: NO literal paint. Ground, band, pill and glyph all come
 * from the kiosk axis (`ds_tokens({ axis: 'kiosk' })`), so the skeleton cannot
 * drift from the thing it stands in for.
 */

import { cn } from '@/utils/_cn';
import { ChevronDown } from '@/components/Icons';
import { HEADER_ICON_CLUSTER } from '@/components/layout/header-shell';
import {
  KIOSK_EAGER_TILE_COUNT,
  KIOSK_POS_CANVAS,
  KIOSK_POS_CARD,
  KIOSK_POS_GRID,
  KIOSK_POS_IMAGE_WELL,
  KIOSK_POS_TRAIL_BAND,
  KIOSK_POS_TRAIL_CONTROL,
  KIOSK_POS_TRAIL_ICON,
} from './kiosk-pos-surface';
import type { KioskCatalogSeed } from '@/lib/kiosk/seed-catalog';

/** Ghost word-control — the command and All-products pills, pre-hydration. */
function TrailWordGhost({ children }: { children: string }) {
  return (
    <span className={cn(KIOSK_POS_TRAIL_CONTROL, 'shrink-0 gap-1.5 text-sm font-medium')}>
      {children}
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-faint" />
    </span>
  );
}

/**
 * The seeded first row, painted as real `<img>` tags in the SERVER HTML.
 *
 * This is the whole point of the seed: `lcp-discovery` failed
 * `requestDiscoverable` because the LCP photo's URL only existed after JS had
 * booted and fetched the catalog — a measured 3.5 s of resource-load DELAY.
 * Emitting the first screen's URLs here lets the browser start those requests
 * while the runtime is still hydrating, and the live grid then renders the same
 * `src` values, so React reconciles without re-requesting a byte.
 *
 * Geometry is the real grid's (`KIOSK_POS_GRID` + `KIOSK_POS_CARD` +
 * `KIOSK_POS_IMAGE_WELL`), so nothing shifts when the live grid replaces this
 * one — CLS stays where it is. Captions are deliberately absent: a price the
 * server read a second ago is a number the live grid may correct, and a
 * corrected price is worse than a price that arrives with the row.
 */
function SeededTiles({ seed }: { seed: KioskCatalogSeed }) {
  const tiles = seed.products.filter((p) => p.thumbnailUrl).slice(0, KIOSK_EAGER_TILE_COUNT);
  if (tiles.length === 0) return null;
  return (
    <div
      className={KIOSK_POS_GRID}
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))' }}
      data-testid="kiosk-catalog-seed-grid"
      aria-hidden
    >
      {tiles.map((product) => (
        <div key={product.id} className={KIOSK_POS_CARD}>
          <div className={KIOSK_POS_IMAGE_WELL}>
            {/* eslint-disable-next-line @next/next/no-img-element -- vendor CDN URL, same tag the live grid uses; next/image would re-host a third-party photo the picker already renders raw */}
            <img
              src={product.thumbnailUrl as string}
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="sync"
              width={400}
              height={400}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function KioskCatalogFirstPaint({
  className,
  seed = null,
}: {
  className?: string;
  /**
   * First catalog page read on the server. `null` is normal (unpaired tablet,
   * cold projection) and simply paints the bare trail, exactly as before.
   */
  seed?: KioskCatalogSeed | null;
}) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden text-text-default',
        KIOSK_POS_CANVAS,
        className,
      )}
      aria-busy="true"
      aria-label="Kiosk catalog"
      data-testid="kiosk-catalog-first-paint"
    >
      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', KIOSK_POS_CANVAS)}>
        <div className={cn(KIOSK_POS_TRAIL_BAND, 'pl-2 pr-2')} data-testid="kiosk-catalog-trail">
          <TrailWordGhost>Repair</TrailWordGhost>
          {/* Search glyph chip — the collapsed find-bar slot, second. */}
          <span className={cn(KIOSK_POS_TRAIL_ICON, 'shrink-0')} aria-hidden />
          {/* The live trail lands on Favorites (2026-09-16), so the ghost word
              has to be that one — a skeleton that says All products and then
              swaps to Favorites is a visible relabel on first paint. */}
          <TrailWordGhost>Favorites</TrailWordGhost>
          <div className={cn(HEADER_ICON_CLUSTER, 'ml-auto')} aria-hidden>
            {/* stance · paperwork · cart — the live trail's trailing cluster. */}
            <span className={KIOSK_POS_TRAIL_ICON} />
            <span className={KIOSK_POS_TRAIL_ICON} />
            <span className={KIOSK_POS_TRAIL_ICON} />
          </div>
        </div>
        {seed ? <SeededTiles seed={seed} /> : null}
      </div>
    </div>
  );
}
