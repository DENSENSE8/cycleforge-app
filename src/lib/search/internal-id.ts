/** Header Internal ID — Cycle Forge keys and printed QR payloads. */

import {
  decodedHandle,
  scannedReceivingId,
  scannedUnitKey,
  type ScanRoute,
} from '@/lib/barcode-routing';
import { formatSearchSel } from '@/lib/search/search-selection';

interface InternalIdKeys {
  receivingIds: number[];
  receivingLineIds: number[];
  shipmentIds: number[];
  orderPks: number[];
  unitKeys: string[];
  handlingUnitIds: number[];
  /**
   * A printed handle / QR decoded to one entity. Bare digits are not
   * exact: they may be a shipment id, an R-id, or an order PK.
   */
  exactHandle: boolean;
}

function positiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function uniquePositives(values: Array<number | null | undefined>): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const v of values) {
    if (v == null || !Number.isSafeInteger(v) || v <= 0 || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function idFromRedirect(redirect: string | undefined, pattern: RegExp): number | null {
  if (!redirect) return null;
  return positiveInt(pattern.exec(redirect)?.[1]);
}

/** Pull Cycle Forge keys out of a find/scan payload. */
export function parseInternalIdQuery(raw: string): InternalIdKeys | null {
  const q = String(raw ?? '').trim();
  if (!q) return null;

  const receivingId = scannedReceivingId(q);
  const unitKey = scannedUnitKey(q);
  const route = decodedHandle(q);

  if (route || receivingId != null || unitKey) {
    const lineId =
      route?.type === 'receiving-line'
        ? idFromRedirect(route.redirect, /^\/m\/l\/(\d+)/)
        : null;
    const huId =
      route?.type === 'handling-unit'
        ? idFromRedirect(route.redirect, /^\/m\/h\/(\d+)/)
        : null;
    const keys: InternalIdKeys = {
      receivingIds: uniquePositives([receivingId]),
      receivingLineIds: uniquePositives([lineId]),
      shipmentIds: [],
      orderPks: [],
      unitKeys: uniqueStrings([route?.type === 'serial-unit' ? unitKey : null]),
      handlingUnitIds: uniquePositives([huId]),
      exactHandle: true,
    };
    if (
      keys.receivingIds.length === 0 &&
      keys.receivingLineIds.length === 0 &&
      keys.unitKeys.length === 0 &&
      keys.handlingUnitIds.length === 0
    ) {
      return null;
    }
    return keys;
  }

  if (/^\d+$/.test(q)) {
    const n = positiveInt(q);
    if (n == null) return null;
    return {
      receivingIds: [n],
      receivingLineIds: [],
      shipmentIds: [n],
      orderPks: [n],
      unitKeys: [String(n)],
      handlingUnitIds: [n],
      exactHandle: false,
    };
  }

  return null;
}

export function hasInternalIdKeys(keys: InternalIdKeys | null): keys is InternalIdKeys {
  if (!keys) return false;
  return (
    keys.receivingIds.length > 0 ||
    keys.receivingLineIds.length > 0 ||
    keys.shipmentIds.length > 0 ||
    keys.orderPks.length > 0 ||
    keys.unitKeys.length > 0 ||
    keys.handlingUnitIds.length > 0
  );
}

/** True when the payload is one of our printed labels — not a typed query. */
export function isPrintedHandlePayload(raw: string): boolean {
  return decodedHandle(raw) != null;
}

function pathOnly(href: string): string {
  const raw = String(href ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      return `${u.pathname}${u.search}`;
    } catch {
      return raw;
    }
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function pathnameOf(href: string): string {
  const path = pathOnly(href);
  const q = path.indexOf('?');
  return q >= 0 ? path.slice(0, q) : path;
}

/**
 * Desktop Search must never open a phone Digital Link (`/m/…`, `/01/…`).
 * Maps printed-handle redirects onto search / staff record URLs.
 */
export function desktopSearchHref(href: string): string {
  const path = pathOnly(href);
  const pathname = pathnameOf(href);
  if (!pathname.startsWith('/m/') && !pathname.startsWith('/01/')) {
    return path || '/search';
  }

  const receiving = /^\/m\/r\/(\d+)(?:\/|$)/.exec(pathname);
  if (receiving) return `/search?sel=${formatSearchSel('receiving', Number(receiving[1]))}`;

  const unitNum = /^\/m\/u\/(\d+)(?:\/|$)/.exec(pathname);
  if (unitNum) return `/search?sel=${formatSearchSel('unit', Number(unitNum[1]))}`;
  const unitAny = /^\/m\/u\/([^/]+)/.exec(pathname);
  if (unitAny) return `/serial/${encodeURIComponent(decodeURIComponent(unitAny[1]))}`;

  const line = /^\/m\/l\/(\d+)(?:\/|$)/.exec(pathname);
  if (line) return `/receiving/lines/${line[1]}`;

  const repair = /^\/m\/rs\/(\d+)(?:\/|$)/.exec(pathname);
  if (repair) return `/search?sel=${formatSearchSel('repair', Number(repair[1]))}`;

  const bin = /^\/m\/b\/([^/]+)/.exec(pathname);
  if (bin) return `/bin/${encodeURIComponent(decodeURIComponent(bin[1]))}`;

  const box = /^\/m\/h\/(\d+)(?:\/|$)/.exec(pathname);
  if (box) return `/search?q=${encodeURIComponent(`H-${box[1]}`)}`;

  const gs1 = /^\/01\/\d+(?:\/21\/([^/]+))?/.exec(pathname);
  if (gs1?.[1]) {
    return `/search?q=${encodeURIComponent(decodeURIComponent(gs1[1]))}`;
  }
  if (pathname.startsWith('/01/')) return '/search';

  return '/search';
}

/**
 * Header find destination for a printed handle. Never returns `/m/` or `/01/`.
 * Null only when there is no redirect to map (callers fall through to preview).
 */
export function searchPageHrefForScanRoute(route: {
  type: string;
  redirect?: string;
}): string | null {
  const redirect = String(route.redirect ?? '').trim();
  if (!redirect) return null;
  return desktopSearchHref(redirect);
}

/** Direct-open destination for a TYPED printed handle whose desktop landing is NOT `/search` — a location (`/inventory?bin=`), a QC line… */
export function directOpenForTypedHandle(
  raw: string,
): { href: string; route: ScanRoute } | null {
  const route = decodedHandle(raw);
  if (!route) return null;
  const href = searchPageHrefForScanRoute(route);
  if (!href) return null;
  const q = href.indexOf('?');
  const pathname = q >= 0 ? href.slice(0, q) : href;
  if (pathname === '/search') return null;
  return { href, route };
}
