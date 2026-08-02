/**
 * Platform-owned Digital Link minting — Cycle Forge host, tenant via slug.
 *
 * Stickers encode `https://{slug}.app.cycleforge.ai/...`. Consumers land on a
 * Cycle Forge interstitial; staff wedge ignores the host via `routeScan()`.
 * Compose {@link staffOriginForSlug} — do not invent a second host scheme.
 */

import {
  mobileQrUrl,
  gs1DigitalLinkUrl,
  gs1LocationUrl,
  gs1UnitAi,
  locationLabelPayload,
  receivingHandle,
  receivingLineHandle,
  serialUnitHandle,
  ticketHandle,
  type LocationSegments,
} from '@/lib/barcode-routing';
import { staffOriginForSlug } from '@/lib/tenancy/kiosk-host';

/** Origin for printed QR codes for a tenant slug (no trailing slash). */
export function platformQrOriginForSlug(orgSlug: string | null | undefined): string | null {
  const slug = String(orgSlug ?? '').trim().toLowerCase();
  if (!slug) return null;
  try {
    return staffOriginForSlug(slug);
  } catch {
    return null;
  }
}

/**
 * Absolute carton Digital Link on the platform host.
 * Falls back to bare `R-{id}` when slug is missing (preview / offline).
 */
export function receivingPlatformLink(
  receivingId: number,
  orgSlug: string | null | undefined,
): string {
  const base = platformQrOriginForSlug(orgSlug);
  if (!base) return receivingHandle(receivingId);
  return mobileQrUrl('r', receivingId, { baseUrl: base });
}

/** Absolute GS1 Digital Link URL on the platform host (unit labels). */
export function unitPlatformDigitalLink(opts: {
  orgSlug: string | null | undefined;
  gtin: string;
  serial?: string | null;
  batch?: string | null;
}): string | null {
  const base = platformQrOriginForSlug(opts.orgSlug);
  if (!base) return null;
  return gs1DigitalLinkUrl({
    gtin: opts.gtin,
    serial: opts.serial,
    batch: opts.batch,
    baseUrl: base,
  });
}

// ─── The printable-matrix SoT ────────────────────────────────────────────────

/**
 * What a printer actually needs to draw one matrix: the encoded string, the
 * symbology to draw it in, and the typeable handle printed underneath.
 *
 * These three travel together on purpose. They were previously decided in five
 * places — the face adapter, the raw TSPL/ZPL command builder, the workspace
 * preview, and two `print*Label` entry points — and they drifted: the workspace
 * unit preview showed a bare serial while the printer encoded a Digital Link
 * URL, and the raw command path dropped `orgSlug` entirely.
 */
export interface PrintMatrix {
  value: string;
  symbology: 'datamatrix' | 'gs1datamatrix';
  /**
   * Human-readable handle under the matrix — always the *typeable* form
   * (`R-42`), never the URL, so an operator with an unreadable sticker can key
   * it into the scan bar. `undefined` when nothing typeable exists.
   */
  hri?: string;
}

/** A caller-supplied string that wins over every derivation below. */
type MatrixOverride = { override?: string | null };

type PrintMatrixArgs =
  | (MatrixOverride & {
      kind: 'carton';
      orgSlug: string | null | undefined;
      receivingId?: number | null;
      /** Human PO / `RCV-{id}` used only when there is no numeric id. */
      fallbackValue?: string | null;
    })
  | (MatrixOverride & {
      kind: 'unit';
      orgSlug: string | null | undefined;
      sku: string;
      serialNumber?: string | null;
      gtin?: string | null;
    })
  | (MatrixOverride & {
      kind: 'as_listed';
      orgSlug: string | null | undefined;
      receivingLineId?: number | null;
      receivingId?: number | null;
      fallbackValue?: string | null;
    })
  | (MatrixOverride & {
      kind: 'ticket';
      orgSlug: string | null | undefined;
      /** Provider (Zendesk) digits, no `#`. */
      ticketDigits: string;
    })
  | (MatrixOverride & {
      kind: 'location';
      /** Needed for the Digital Link rung — same role as every other kind. */
      orgSlug?: string | null;
      /**
       * Zone / aisle / bay / level / position. A RACK label is the same kind
       * with `position: 0` — pass `rackToLocation(rackSegments)`. Rack-vs-bin
       * is decided by the code on the way back out (`isRackCode`), never by a
       * second encode path.
       */
      segments: LocationSegments;
      /** The tenant's GLN. Only a *licensed* one can name a GS1 location. */
      gln?: string | null;
    });

const TYPEABLE_HANDLE_RE = /^(?:R|RCV|L|U|T)-[A-Za-z0-9._-]+$/i;

function isFinitePositive(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

/** HRI for a value that may or may not already be a bare handle. */
function handleHri(value: string): string | undefined {
  return TYPEABLE_HANDLE_RE.test(value) ? value.toUpperCase() : undefined;
}

/**
 * A caller-supplied payload can be a GS1 element string (`(01)…(21)…`) rather
 * than a URL or handle; those must be drawn as GS1 DataMatrix so a scanner
 * emits the FNC1 group separators.
 */
function symbologyForOverride(value: string): PrintMatrix['symbology'] {
  return /\((?:01|21|10|17|414|254)\)/.test(value) ? 'gs1datamatrix' : 'datamatrix';
}

/**
 * **The** encode decision for every printable matrix that leaves this app.
 *
 * ## One ladder, four rungs — every kind descends the same one
 *
 * ```
 *   1. GS1 Digital Link URI   https://{slug}…/01/{gtin}/21/{serial}
 *                             https://{slug}…/414/{gln}/254/{code}
 *      ↑ needs a LICENSED GS1 key + a tenant host
 *
 *   2. GS1 element string     (01){gtin}(21){serial}   ·  (414){gln}(254){code}
 *      ↑ licensed key, no host — same identity, no domain to resolve it
 *
 *   3. Platform Digital Link  https://{slug}…/m/r/{id}
 *      ↑ no licensed key, but the path HAS an anonymous landing
 *
 *   4. Bare handle            R-1234 · L-567 · U-SN1 · T-9395 · A0101101
 *      ↑ no key, no host, or no anon landing — still resolves at a staff wedge
 * ```
 *
 * **Rung 1 is not reachable by wanting it.** A GS1 key (GTIN, GLN) is
 * *licensed* to the company that holds its prefix. Minting one you do not hold
 * is a false identity claim, not a placeholder — that is precisely what
 * `DEFAULT_GLN = '0614141000005'` (GS1's own documentation GLN) did to every
 * location label printed before 2026-08-02. So a carton, a receiving line, a
 * ticket, a handling unit and an un-licensed shelf **cannot** become GS1
 * Digital Links; they are internal identities and they descend to rung 3 or 4.
 * Closing that gap is a GS1 Company Prefix purchase, not a refactor.
 *
 * **Rungs 3→4 turn on whether an anonymous phone lands somewhere.** A URL is
 * only worth printing if scanning it with a camera works; minting one for a
 * path that bounces a visitor to `/signin` is worse than printing the handle,
 * and it costs matrix area on a small sticker.
 *
 * Kind coverage today — the rung each one currently reaches:
 *   unit      → 1 (GTIN) · 2 (GTIN, no slug) · 4 (`U-{serial}` / bare SKU)
 *   location  → 1 (licensed GLN) · 2 (licensed GLN, no slug) · 4 (flat code)
 *   carton    → 3 (`/m/r/{id}` has a dual-audience landing) · 4 (no slug)
 *   as_listed → 4 — `/m/l/*` is a proxy REWRITE onto a staff page, so it has
 *               no anon landing yet. Folded in here so the day it gets one,
 *               this is the only edit.
 *   ticket    → 4 — same reason; `/support?ticket=` is staff-only.
 *
 * The licensed-GLN decision itself is `locationLabelPayload`, which exists only
 * because `barcode-routing` cannot import this module back — it is the location
 * case's private helper, not a second encoder. Pinned by
 * `print-matrix-sot.guard.test.ts`.
 */
export function encodePrintMatrix(args: PrintMatrixArgs): PrintMatrix {
  const override = (args.override ?? '').trim();
  if (override) {
    return {
      value: override,
      symbology: symbologyForOverride(override),
      hri: handleHri(override),
    };
  }

  switch (args.kind) {
    case 'carton': {
      if (isFinitePositive(args.receivingId)) {
        const handle = receivingHandle(args.receivingId);
        return {
          value: receivingPlatformLink(args.receivingId, args.orgSlug),
          symbology: 'datamatrix',
          hri: handle,
        };
      }
      const fallback = (args.fallbackValue ?? '').trim();
      return { value: fallback, symbology: 'datamatrix', hri: handleHri(fallback) };
    }

    case 'unit': {
      const gtin = (args.gtin ?? '').trim();
      const serial = (args.serialNumber ?? '').trim();
      if (gtin) {
        const link = unitPlatformDigitalLink({
          orgSlug: args.orgSlug,
          gtin,
          serial: serial || null,
        });
        if (link) return { value: link, symbology: 'datamatrix' };
        // No slug (offline / unauthenticated preview): the GS1 element string
        // still carries both AIs, so the sticker keeps its full identity.
        if (serial) {
          return { value: gs1UnitAi({ gtin, serial }), symbology: 'gs1datamatrix' };
        }
      }
      if (serial) {
        return { value: serialUnitHandle(serial), symbology: 'datamatrix' };
      }
      return { value: args.sku.trim(), symbology: 'datamatrix' };
    }

    case 'as_listed': {
      if (isFinitePositive(args.receivingLineId)) {
        const handle = receivingLineHandle(args.receivingLineId);
        return { value: handle, symbology: 'datamatrix', hri: handle };
      }
      if (isFinitePositive(args.receivingId)) {
        const handle = receivingHandle(args.receivingId);
        return { value: handle, symbology: 'datamatrix', hri: handle };
      }
      const fallback = (args.fallbackValue ?? '').trim();
      return { value: fallback, symbology: 'datamatrix', hri: handleHri(fallback) };
    }

    case 'ticket': {
      const digits = String(args.ticketDigits ?? '').replace(/\D/g, '');
      if (!digits) return { value: '', symbology: 'datamatrix' };
      const handle = ticketHandle(digits);
      return { value: handle, symbology: 'datamatrix', hri: handle };
    }

    case 'location': {
      const payload = locationLabelPayload(args.segments, { gln: args.gln });
      // Rung 1 — the same promotion `unit` already makes: a licensed key plus
      // a tenant host is a real GS1 Digital Link. `payload.gln` is non-null
      // ONLY when `isLicensedGln` passed, so this can never mint a borrowed
      // AI 414; with no licence it is not reachable at all.
      if (payload.gln) {
        const base = platformQrOriginForSlug(args.orgSlug);
        if (base) {
          return {
            // A Digital Link is a URI, so it draws as a PLAIN DataMatrix —
            // `gs1datamatrix` would frame it as an AI string and bwip-js
            // rejects a payload with no AIs. Same as the unit DL branch.
            value: gs1LocationUrl(args.segments, { gln: payload.gln, baseUrl: base }),
            symbology: 'datamatrix',
            hri: payload.code,
          };
        }
      }
      // Rung 2 (licensed, no host) or rung 4 (no licence) — decided already.
      // The flat code is typeable AND is what `routeScan` resolves, so it is
      // the honest HRI on every rung.
      return { value: payload.value, symbology: payload.symbology, hri: payload.code };
    }
  }
}
