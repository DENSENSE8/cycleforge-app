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
  gs1UnitAi,
  receivingHandle,
  receivingLineHandle,
  serialUnitHandle,
  ticketHandle,
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
 * One rule across kinds: mint an absolute platform Digital Link
 * (`https://{slug}.app.cycleforge.ai/…`) when the tenant slug is known **and
 * that path has a landing surface**; otherwise fall back to the bare handle,
 * which `routeScan()` still resolves at a staff wedge. A URL is only worth
 * printing if someone scanning it with a phone lands somewhere — minting one
 * for a path that bounces an anonymous visitor to `/signin` is worse than
 * printing the handle.
 *
 * Kind coverage today:
 *   carton    → `/m/r/{id}` (dual-audience landing shipped)
 *   unit      → `/01/{gtin}[/21/{serial}]` (dual-audience landing shipped)
 *   as_listed → bare `L-{id}` / `R-{id}` — `/m/l/*` is a proxy REWRITE onto a
 *               staff page, so it has no anon landing yet. Folded in here so
 *               the day it gets one, this is the only edit.
 *   ticket    → bare `T-{digits}` — same reason; `/support?ticket=` is staff-only.
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
  }
}
