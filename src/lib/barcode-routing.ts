/**
 * Barcode routing helpers — used by the mobile scan flow and by anywhere
 * the app needs to classify an inbound scan or paste.
 *
 * Recognized inputs:
 *   - URL handles (printed by the receiving sidebar) — always start with
 *     "http(s)://…/m/r/{id}", "…/m/l/{id}", or "…/m/u/{id|serial}".
 *     The path is also recognized when the value is a bare path
 *     (e.g. "/m/r/42") so legacy or wedge-captured scans still resolve.
 *   - Legacy carton string "RCV-123".
 *   - Static SKU:   starts with a digit AND contains ":" (e.g. "12345:HP-PSU").
 *   - Bin barcode:  starts with a letter (e.g. "A12", "B04").
 *   - Anything else falls back to SKU lookup (safer default).
 */

import { inventoryLocationsHref } from '@/lib/inventory/locations-path';

export type ScanType =
  | 'sku'
  | 'bin'
  | 'receiving'        // R-class — carton handle
  | 'receiving-line'   // L-class — single line within a carton
  | 'serial-unit'      // U-class — one physical unit
  | 'handling-unit'    // H-class — a license-plated box/tray (LPN)
  | 'manifest'         // KIT-class — a preboxed kit master label (label_manifests)
  | 'support-ticket';   // T-class — provider ticket id → /support?ticket=

export interface ScanRoute {
  type: ScanType;
  value: string;
  /** When set, callers should navigate here (relative path within the app). */
  redirect?: string;
}

// The one shared answer to "is this GLN real?" — see the note where
// DEFAULT_GLN used to live. Pure + client-safe, so this stays a client module.
import { isLicensedGln } from '@/lib/interop/gs1-keys';

const MOBILE_PATH_RE = /\/m\/(r|l|u)\/([^/?#\s]+)/i;
const SKU_STOCK_LOCATION_RE = /\/sku-stock\/location\/([^/?#\s]+)/i;
// GS1 Digital Link — capture gtin and optional serial after /21/.
// Exported so the GS1 resolver (src/lib/gs1/parser.ts) can reuse the
// same fast-path regex without re-declaring it.
export const GS1_PATH_RE = /\/01\/(\d{8,14})(?:\/21\/([^/?#\s]+))?/i;
// GS1 Digital Link for a warehouse location: /414/{gln}/254/{code}
// where {code} is the flat location string (e.g. "A0101101"). Emitted by
// the Location Label Printer via gs1LocationUrl(); printed bin labels
// scan back to this path. Retained for back-compat with any pre-DataMatrix
// labels still in the wild.
export const GS1_LOCATION_RE = /\/414\/(\d+)\/254\/([^/?#\s]+)/i;

// Raw GS1 AI string emitted by industrial DataMatrix scanners. Two forms
// are common:
//   • FNC1-delimited:  "414{13-digit gln}\x1D254{code}"   (Zebra, Honeywell)
//   • Parens form:     "(414){gln}(254){code}"            (some Datalogics
//                                                          + paste-input)
// The {code} segment is variable-length AI 254, so an FNC1 (ASCII 0x1D /
// GS) terminator is what disambiguates the boundary — we accept either
// end-of-string or an explicit GS as the delimiter.
const GS1_AI_LOCATION_FNC1_RE = /414(\d{13})(?:\x1D|)?254([^\x1D]+)/i;
const GS1_AI_LOCATION_PARENS_RE = /\(414\)(\d{13})\(254\)([^()]+)/i;

// Unit/serial product label — `(01)gtin(21)serial[(10)batch]`. AI 01 is
// fixed 14 digits per GS1 so FNC1 isn't required between 01 and 21, but
// scanners typically emit it before the variable-length AI 21. Accept
// either form.
const GS1_AI_UNIT_FNC1_RE = /01(\d{14})(?:\x1D)?21([^\x1D]+?)(?:\x1D10([^\x1D]+))?$/i;
const GS1_AI_UNIT_PARENS_RE = /\(01\)(\d{14})\(21\)([^()]+)(?:\(10\)([^()]+))?/i;

// Human-readable dashed location code — `A-01-01-1` / `A-01-01-1-01`. A single
// zone letter then 2–4 hyphenated digit segments. Shared by the location
// branch AND by the U-/S- handle guards so a zone-letter location (e.g.
// `U-01-02-3`) is never swallowed by the unit/sku handle parsers above it.
const DASHED_LOCATION_RE = /^([A-Z])-(\d{2})-(\d{2})-(\d{1,2})(?:-(\d{2}))?$/i;

// Flat location code — the undashed form `locationCodeFlat()` emits and
// `locations.barcode` stores: zone letter + aisle(2) + bay(2) + level(1–2) +
// position(2) = a letter followed by 7 or 8 digits. This is the whole payload
// of a non-GS1 location DataMatrix.
const LOCATION_FLAT_RE = /^[A-Z]\d{7,8}$/i;

// Punctuation-stripped platform Digital Link — see the RECOVERY branch in
// `routeScan`. Right-anchored so a tenant slug containing `m` ("mycompany")
// cannot be mistaken for the `/m/` path segment.
const FLATTENED_MOBILE_LINK_RE = /^https?.*m([rlu])(\d+)$/i;

function pathToRoute(path: string, value: string): ScanRoute | null {
  const m = MOBILE_PATH_RE.exec(path);
  if (m) {
    const [, classKey, idRaw] = m;
    const id = decodeURIComponent(idRaw);
    switch (classKey.toLowerCase()) {
      case 'r':
        return { type: 'receiving',      value, redirect: `/m/r/${id}` };
      case 'l':
        return { type: 'receiving-line', value, redirect: `/m/l/${id}` };
      case 'u':
        return { type: 'serial-unit',    value, redirect: `/m/u/${id}` };
      default:
        return null;
    }
  }
  const binMatch = SKU_STOCK_LOCATION_RE.exec(path);
  if (binMatch) {
    const barcode = decodeURIComponent(binMatch[1]);
    return { type: 'bin', value, redirect: `/inventory?bin=${barcode}` };
  }
  // GS1 location label printed by the Location Label Printer. The QR
  // encodes the flat code in the 254 segment (locationCodeFlat()), which
  // is what we persist as `locations.barcode` in registerPrintedLocations.
  // Returning the code as `value` lets server-side lookups hit the row
  // directly without re-parsing the URL.
  const gs1Loc = GS1_LOCATION_RE.exec(path);
  if (gs1Loc) {
    const code = decodeURIComponent(gs1Loc[2]).toUpperCase();
    // position=00 means this label identifies a whole rack (zone/aisle/
    // bay/level), not a single bin slot. Route to the rack-detail view.
    if (isRackCode(code)) {
      return {
        type: 'bin',
        value: code,
        redirect: inventoryLocationsHref({ tab: 'racks', extra: { code } }),
      };
    }
    return { type: 'bin', value: code, redirect: `/inventory?bin=${code}` };
  }
  // GS1 Digital Link form. Page-side resolvers translate gtin → sku and
  // serial → unit at runtime, so we just dispatch to the catch-all paths.
  const gs1 = GS1_PATH_RE.exec(path);
  if (gs1) {
    const [, gtin, serial] = gs1;
    if (serial) {
      return { type: 'serial-unit', value, redirect: `/01/${gtin}/21/${decodeURIComponent(serial)}` };
    }
    return { type: 'sku', value, redirect: `/01/${gtin}` };
  }
  return null;
}

/** Route a raw GS1 location code (the flat A0101101 form) to the right view. */
function routeLocationCode(value: string, code: string): ScanRoute {
  const normalized = code.toUpperCase();
  // position=00 means this label identifies a whole rack (zone/aisle/bay/
  // level), not a single bin slot. Route to the rack-detail view.
  if (isRackCode(normalized)) {
    return {
      type: 'bin',
      value: normalized,
      redirect: inventoryLocationsHref({ tab: 'racks', extra: { code: normalized } }),
    };
  }
  return { type: 'bin', value: normalized, redirect: `/inventory?bin=${normalized}` };
}

/**
 * Classify a scanned / typed value. Returns null for empty input.
 */
export function routeScan(raw: string): ScanRoute | null {
  const value = raw.trim();
  if (!value) return null;

  // 1. URL form (printed QR payloads) — accept absolute http(s) and bare paths.
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      const matched = pathToRoute(u.pathname, value);
      if (matched) return matched;
    } catch {
      /* fall through */
    }
  }
  if (value.startsWith('/')) {
    const matched = pathToRoute(value, value);
    if (matched) return matched;
  }

  // 1b. RECOVERY — a punctuation-stripped Digital Link. An HID wedge running the
  //     wrong keyboard country drops `:` `/` `.` and upper-cases the rest, so a
  //     carton matrix WE printed arrives as `HTTPSUSAVAPPCYCLEFORGEAIMR51189`
  //     instead of `https://usav.app.cycleforge.ai/m/r/51189`.
  //
  //     Without this the value reached the letter→bin fallback (§6), which types
  //     it `bin` with NO redirect — so the receiving bar took it for an unknown
  //     carrier tracking number and intook a NEW carton. One junk row per scan
  //     of a sticker this app printed itself.
  //
  //     Anchored on a leading `https` with every separator gone: nothing a
  //     scanner legitimately emits looks like that. Deliberately NOT keyed on
  //     our own hostname — the installed base was printed against whatever host
  //     was current then, and those stickers must keep resolving (nothing is
  //     ever re-printed). The id must be digits: a `/m/u/{serial}` whose serial
  //     carried a hyphen is genuinely unrecoverable, so it falls through rather
  //     than being guessed at.
  const flattened = FLATTENED_MOBILE_LINK_RE.exec(value.replace(/[^A-Za-z0-9]/g, ''));
  if (flattened) {
    const [, classKey, id] = flattened;
    const matched = pathToRoute(`/m/${classKey.toLowerCase()}/${id}`, value);
    if (matched) return matched;
  }

  // 2. Raw GS1 AI string from a DataMatrix scan — parens or FNC1 form.
  //    Industrial scanners emit one of these for our location labels.
  const aiParens = GS1_AI_LOCATION_PARENS_RE.exec(value);
  if (aiParens) return routeLocationCode(value, aiParens[2]);
  const aiFnc1 = GS1_AI_LOCATION_FNC1_RE.exec(value);
  if (aiFnc1) return routeLocationCode(value, aiFnc1[2]);

  // 2b. Unit/serial product label — `(01)gtin(21)serial[(10)batch]`.
  //     Routes to the unit detail page; the resolver translates gtin →
  //     sku and serial → unit at runtime.
  const unitParens = GS1_AI_UNIT_PARENS_RE.exec(value);
  if (unitParens) {
    const [, gtin, serial] = unitParens;
    return { type: 'serial-unit', value, redirect: `/01/${gtin}/21/${encodeURIComponent(serial)}` };
  }
  const unitFnc1 = GS1_AI_UNIT_FNC1_RE.exec(value);
  if (unitFnc1) {
    const [, gtin, serial] = unitFnc1;
    return { type: 'serial-unit', value, redirect: `/01/${gtin}/21/${encodeURIComponent(serial)}` };
  }

  // 3. Bare-handle DataMatrix payloads — these are what receiving carton,
  //    receiving line, serial-unit, and repair labels carry now that
  //    they're DataMatrix instead of URL QR. No URL, no host, just the
  //    prefixed handle.
  const rcvShort = /^R-(\d+)$/i.exec(value);
  if (rcvShort) return { type: 'receiving',      value, redirect: `/m/r/${rcvShort[1]}` };
  const lineShort = /^L-(\d+)$/i.exec(value);
  if (lineShort) return { type: 'receiving-line', value, redirect: `/m/l/${lineShort[1]}` };
  // U-class unit handle — accepts a numeric serial_units.id OR an alphanumeric
  // physical serial / minted unit_uid suffix. The prefix is STRIPPED in the
  // redirect so a printed `U-{serial}` / `U-{unit_uid}` label scans back to its
  // unit (resolved by /api/serial-units/[id] via id → normalized_serial →
  // unit_uid). Previously digits-only, so an alphanumeric serial (e.g.
  // `U-CN1A2B3`) fell through to the bin fallback and mis-routed to /inventory.
  // Skipped when the value is actually a U-zone location code (U-01-02-3…).
  const unitShort = /^U-([A-Za-z0-9][A-Za-z0-9-]*)$/i.exec(value);
  if (unitShort && !DASHED_LOCATION_RE.test(value)) {
    return { type: 'serial-unit', value, redirect: `/m/u/${encodeURIComponent(unitShort[1])}` };
  }
  // H-class — a license-plated box/tray (handling unit / LPN). One scan opens
  // the box page (/m/h/{id}), which on the testing side fans out to every unit
  // in the box. Anchored here with the other bare handles so "H-12" isn't
  // misread as a bin (section 6 keys on a leading letter).
  const huShort = /^H-(\d+)$/i.exec(value);
  if (huShort) return { type: 'handling-unit',   value, redirect: `/m/h/${huShort[1]}` };

  // T-class — support / claim ticket sticker. Provider ticket id (Zendesk today)
  // opens the desktop Support queue deep-link. Anchored with the other bare
  // handles so "T-9395" isn't swallowed by the letter→bin fallback.
  const ticketShort = /^T-(\d+)$/i.exec(value);
  if (ticketShort) {
    return {
      type: 'support-ticket',
      value,
      redirect: `/support?ticket=${ticketShort[1]}`,
    };
  }

  // KIT-class — a preboxed kit master label (label_manifests). The whole scanned
  // value IS the manifest_uid (KIT-{SKU}-{YYWW}-{SEQ6}); the desktop testing
  // resolver looks it up and opens the manifest detail. Anchored here, before the
  // letter→bin fallback, so "KIT-…" isn't misread as a bin. No mobile page yet.
  if (/^KIT-/i.test(value)) return { type: 'manifest', value };
  // REP-class repair label. Routes to the mobile repair-service detail page
  // `/m/rs/{id}` — the SAME target the walk-in `?openRepair=` deep-link
  // redirects to. (Previously emitted `/repair/{id}`, a path with no [id] route
  // that 404'd, so a scanned repair label never opened its repair.)
  const repairShort = /^REP-(\d+)$/i.exec(value);
  if (repairShort) {
    return { type: 'receiving', value, redirect: `/m/rs/${repairShort[1]}` };
  }
  // Legacy RCV-{id} carton string — kept for back-compat with any
  // pre-DataMatrix labels still in the wild.
  const rcv = /^RCV-(\d+)$/i.exec(value);
  if (rcv) {
    return { type: 'receiving', value, redirect: `/m/r/${rcv[1]}` };
  }

  // 3b. Bare minted unit id ({SKU_SHORT}-{YYWW}-{SEQ6}) — what the products
  //     label QR now encodes (no GS1). The short SKU may itself contain
  //     hyphens (e.g. IPH13-128-BLU), so anchor on the -{4 digits}-{6 digits}
  //     tail. Routes to the unit page, which resolves it via serial_units.unit_uid.
  //     Ordered before the location/bin fallbacks; those require a letter prefix
  //     and never carry a 6-digit tail, so there's no clash.
  if (/^[A-Z0-9][A-Z0-9-]*-\d{4}-\d{6}$/i.test(value)) {
    return { type: 'serial-unit', value, redirect: `/m/u/${encodeURIComponent(value)}` };
  }

  // 4. Static SKU: digit prefix + contains ":".
  if (/^\d/.test(value) && value.includes(':')) return { type: 'sku', value };

  // 5. Bin / rack: dashed code like A-01-01-1 or A-01-01-1-01. Letter
  //    prefix followed by hyphenated digit segments. Matches the human-
  //    readable code printed alongside the DataMatrix; some operators
  //    type these in or paste them from a phone photo.
  const dashed = DASHED_LOCATION_RE.exec(value);
  if (dashed) {
    const flat = dashed.slice(1, 6).filter(Boolean).join('').toUpperCase();
    return routeLocationCode(value, flat);
  }

  // 5b. FLAT location code — `A0101101`, a zone letter then 7–8 digits. This
  //     is what a location DataMatrix carries for a tenant with no licensed
  //     GLN (locationLabelPayload → symbology 'datamatrix'), and it is also
  //     exactly what `locations.barcode` stores.
  //
  //     Without this branch such a scan fell through to the letter fallback
  //     below, which returns `{type:'bin'}` with NO redirect and NO
  //     case-normalisation — so a RACK label (position=00) opened the bin
  //     view instead of the rack view, and a lower-cased entry never matched
  //     its row. Routing through `routeLocationCode` makes the bare-code label
  //     resolve identically to the GS1 one, which is the precondition for
  //     dropping the borrowed GLN.
  //
  //     Deliberately narrow: existing short bin barcodes (`A12`, `B04`) do not
  //     match and keep their old behaviour.
  if (LOCATION_FLAT_RE.test(value)) {
    return routeLocationCode(value, value.toUpperCase());
  }

  // 6. Bin (legacy fallback): starts with a letter.
  if (/^[A-Za-z]/.test(value)) return { type: 'bin', value };

  // 7. Default fallback → SKU.
  return { type: 'sku', value };
}

/** Back-compat shim for callers that only need the type. */
export function detectScanType(raw: string): ScanType {
  return routeScan(raw)?.type ?? 'sku';
}

/**
 * For a scan of a **printed unit label**, return the resolvable unit key — the
 * bare serial (`U-{serial}` handle / GS1 `(01)(21)` serial) or the minted
 * `unit_uid` — that `/api/serial-units/[id]` resolves (numeric id → serial →
 * unit_uid). Returns `null` when the raw scan is NOT a genuine unit label, so
 * a bare/partial serial typed at the bench never trips a unit-scoped action.
 *
 * This is the gate + extraction the packer testing-photo scan uses: it fires the
 * phone camera ONLY when this returns a non-null key
 * (docs/todo/packer-testing-photo-scan-timeline-plan.md). Shape-only matches
 * (a manufacturer serial that happens to look like a minted uid / `U-` / GS1
 * frame) still return a key here, but resolve to no unit downstream and are
 * dropped there — so this never opens the camera spuriously.
 */
export function scannedUnitKey(raw: string): string | null {
  const route = routeScan(raw);
  if (!route || route.type !== 'serial-unit') return null;
  const redirect = route.redirect || '';
  const mu = /^\/m\/u\/(.+)$/.exec(redirect);
  if (mu) return decodeURIComponent(mu[1]).trim() || null;
  const gs1 = /^\/01\/\d+\/21\/(.+)$/.exec(redirect);
  if (gs1) return decodeURIComponent(gs1[1]).trim() || null;
  return null;
}

/**
 * Unwrap a value typed or scanned into a **serial** field.
 *
 * A field whose placeholder says "scan" must accept what this app PRINTS, and
 * a printed unit label is not a bare serial — it is a GS1 Digital Link URL, a
 * `(01)…(21)…` element string, or a `U-…` handle, depending on tenant slug and
 * printer lane. {@link scannedUnitKey} is the decode; this is the pass-through
 * form for an input that must ALSO keep accepting a hand-typed serial, which
 * `scannedUnitKey` deliberately rejects (it is a camera gate, not a parser).
 *
 * Never a second decoder: the only interpretation happens in `routeScan`.
 */
export function unwrapScannedSerial(raw: string): string {
  return scannedUnitKey(raw) ?? String(raw ?? '').trim();
}

/**
 * For a scan of a **printed location label**, return the flat location code
 * (`A0101101`) — the exact string `locations.barcode` stores.
 *
 * Returns `null` when the value is not a decodable location label, including
 * the short legacy bin barcodes (`A12`) that `routeScan` types as `bin` with
 * no redirect: that arm is a leading-letter GUESS, not a decode, so passing it
 * through unchanged is the honest answer. Use {@link unwrapScannedLocation} at
 * an input that must accept both.
 */
function scannedLocationCode(raw: string): string | null {
  const route = routeScan(raw);
  if (!route || route.type !== 'bin') return null;
  const redirect = route.redirect || '';
  // Extract from the REDIRECT, not `value` — the `/sku-stock/location/{code}`
  // arm returns the whole scanned URL as `value` and only the redirect carries
  // the barcode.
  const bin = /^\/inventory\?bin=(.+)$/.exec(redirect);
  if (bin) return decodeURIComponent(bin[1]).trim() || null;
  const rack =
    /^\/(?:warehouse|inventory\/locations)\?tab=racks&code=(.+)$/.exec(redirect);
  if (rack) return decodeURIComponent(rack[1]).trim() || null;
  return null;
}

/**
 * Unwrap a value typed or scanned into a **bin / location** field.
 *
 * Decodable label → its flat code; anything else → the trimmed text, so a
 * hand-typed `A12` or a bin NAME still reaches the API unchanged. This is what
 * makes a "scan or type bin" box accept the legacy `(414){gln}(254){code}`
 * stickers that are on the racks today — those carry a borrowed GLN and a URL
 * wrapper, and a raw pass-through sends the whole string as `bin_barcode`.
 */
export function unwrapScannedLocation(raw: string): string {
  return scannedLocationCode(raw) ?? String(raw ?? '').trim();
}

/**
 * The route ONLY when the value genuinely DECODED — never when it was guessed.
 *
 * This is the single most-repeated mistake against `routeScan`, and it has cost
 * four separate live defects. `routeScan` returns non-null for **every**
 * non-empty string: anything it does not recognise falls through to a bare
 * `sku` / `bin` letter-guess carrying no `redirect`. So `if (routeScan(v))` is
 * always true, and a caller written that way silently treats ordinary text as
 * one of our labels.
 *
 * What it cost, each time the same shape:
 *
 *  - `detectStationScanType` — real carrier numbers typed as house handles.
 *  - `classifyHistoryCommandScan` — `Dell Latitude 7420`, `HP-PSU-450` and any
 *    plain serial guessed `bin`, so Unbox History returned `passthrough` and
 *    the find never ran.
 *  - `scannedLocationCode` — got this right, and says so in its own docblock;
 *    that comment is where the rule was first written down.
 *
 * The redirect is the honest signal: `routeScan` emits one exactly when it
 * resolved the payload to a real destination. Compose this rather than
 * re-deriving the test.
 */
export function decodedHandle(raw: string): ScanRoute | null {
  const route = routeScan(raw);
  return route?.redirect ? route : null;
}

/**
 * For a scan of a **printed carton label**, return the numeric `receiving_id`.
 * Returns `null` when the raw value is not a carton label, so a human typing a
 * PO number still falls through to text search.
 *
 * Sibling of {@link scannedUnitKey}, and it exists for the same reason: a
 * printed carton sticker does NOT carry `R-1234`. Since the platform-link
 * change it carries an absolute Digital Link
 * (`https://{slug}.app.cycleforge.ai/m/r/1234`), so any surface that reads the
 * bare handle by regex silently stopped accepting the thing it prints. Every
 * form resolves here — absolute URL, bare path, `R-1234`, legacy `RCV-1234` —
 * because they all resolve through the one decoder.
 *
 * A repair label (`REP-33`) is deliberately excluded: `routeScan` types it
 * `receiving` but redirects to `/m/rs/33`, and a repair order is not a carton.
 * Anchoring on the `/m/r/` redirect is what keeps them apart.
 */
export function scannedReceivingId(raw: string): number | null {
  const route = routeScan(raw);
  if (!route || route.type !== 'receiving') return null;
  const m = /^\/m\/r\/(\d+)$/.exec(route.redirect || '');
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// ─── Print-side helpers ─────────────────────────────────────────────────────

/**
 * Public-facing base URL embedded in every printed QR — internal handles
 * (receiving carton, receiving line, repair label, sign-in / staff invite)
 * and consumer unit/serial labels alike all anchor here.
 *
 * One canonical brand domain serves both customers and staff so:
 *   • The Vercel deploy hostname never appears on a printed sticker.
 *   • Phone cameras see a clean `usavshop.com` URL with no IaaS leak.
 *   • Industrial scanners and the internal app ignore the host and parse
 *     the path locally via `routeScan()` — works the same regardless of
 *     which brand domain prints it.
 *
 * Edge expectation: the usavshop.com Vercel/CDN tier *rewrites* (not
 * redirects) the relevant paths (/m/*, /repair/*, /warehouse, /inventory,
 * /01/*, /414/*) to the staff backend. See docs/edge-rewrites.md for the
 * vercel.json snippet that wires that up. A 302 redirect would still
 * leak the backend host in the browser bar — rewrites keep the browser
 * on usavshop.com.
 *
 * Override via NEXT_PUBLIC_APP_URL for staging environments (e.g. point
 * to a preview deployment or staging brand domain).
 */
export const QR_BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://usavshop.com'
).replace(/\/$/, '');

/**
 * Public domain encoded in the *unit-level* GS1 Digital Link QR (the QR on a
 * serialized product label). Defaults to the same canonical brand domain
 * as {@link QR_BASE_URL} so the storefront serves both consumer and staff
 * QR landings from one host. Kept as a separate constant for the rare
 * case where a buyer wants unit labels routed to an alternate consumer
 * URL (e.g. a marketplace listing). Override with
 * NEXT_PUBLIC_LABEL_QR_BASE_URL.
 */
export const PUBLIC_UNIT_QR_BASE_URL = (
  process.env.NEXT_PUBLIC_LABEL_QR_BASE_URL ?? 'https://usavshop.com'
).replace(/\/$/, '');

/**
 * Build the absolute URL embedded in a printed QR. Always anchors to
 * {@link QR_BASE_URL} so printed labels work regardless of which environment
 * they were printed from.
 *
 * Bin labels (kind='b') route into the Inventory page's bin view (`?bin=`)
 * so the bin editor lives next to the rest of the inventory tooling.
 * Other kinds stay on their dedicated /m/* pages for the receiving / unit flows.
 */
export function mobileQrUrl(
  // `k` was dropped — it minted `/m/k/{id}`, which `routeScan` has no branch for
  // and no page exists; a generator with no scan-back resolver. r/l/u/b all
  // route (l/u via the proxy rewrite + MOBILE_PATH_RE, b to inventory).
  kind: 'r' | 'l' | 'u' | 'b',
  id: string | number,
  opts?: { baseUrl?: string },
): string {
  const encoded = encodeURIComponent(String(id));
  const path =
    kind === 'b'
      ? `/inventory?bin=${encoded}`
      : `/m/${kind}/${encoded}`;
  const base = (opts?.baseUrl || QR_BASE_URL).replace(/\/$/, '');
  try {
    return new URL(path, base).toString();
  } catch {
    return `${base}${path}`;
  }
}

/**
 * GS1 Digital Link URL. Encodes a GTIN, optionally with a serial number.
 *   /01/{gtin}                  — product class
 *   /01/{gtin}/21/{serial}      — unique item
 *
 * Anchored to the QR_BASE_URL so the same domain that hosts our own QR
 * payloads also hosts the GS1 form — phones scanning either land here and
 * our resolver redirects to the right page.
 */
export function gs1DigitalLinkUrl(opts: {
  gtin: string;
  serial?: string | null;
  batch?: string | null;
  /** Override host (e.g. `staffOriginForSlug` for multi-tenant SaaS minting). */
  baseUrl?: string;
}): string {
  const base = (opts.baseUrl || QR_BASE_URL).replace(/\/$/, '');
  const gtin = encodeURIComponent(String(opts.gtin || '').trim());
  if (!gtin) return base;
  let path = `/01/${gtin}`;
  if (opts.serial && opts.serial.trim()) {
    path += `/21/${encodeURIComponent(opts.serial.trim())}`;
  }
  if (opts.batch && opts.batch.trim()) {
    path += `/10/${encodeURIComponent(opts.batch.trim())}`;
  }
  try {
    return new URL(path, base).toString();
  } catch {
    return `${base}${path}`;
  }
}

// ─── Warehouse-location helpers (Zone / Aisle / Bay / Level / Position) ────

/**
 * There is deliberately NO default GLN.
 *
 * This constant used to be `DEFAULT_GLN = '0614141000005'` — GS1's own
 * documentation GLN, on GS1 US's example prefix `0614141` — and every bin and
 * rack label printed since fell back to it. A GLN is a *licensed* identifier:
 * those digits belong to whichever company actually holds that prefix, so the
 * labels were asserting someone else's identity as the location of this
 * warehouse. Internally harmless (only `routeScan` ever read them); a
 * collision the moment a label is photographed by a partner's system, or the
 * moment the same value reaches an EPCIS `bizLocation`.
 *
 * A tenant with no licensed GLN now prints the internal location code in a
 * PLAIN DataMatrix instead of a false `(414)` — see {@link locationLabelPayload}.
 * "No GLN" is a legal state; a borrowed GLN is not.
 *
 * The licensed/placeholder decision itself lives in
 * `@/lib/interop/gs1-keys` (`isLicensedGln`) and is not re-implemented here.
 */

/** Pad a numeric segment to 2 digits — 01, 02, 03 … */
export function pad2(n: number | string): string {
  const num = typeof n === 'string' ? parseInt(n, 10) : n;
  if (!Number.isFinite(num)) return String(n).padStart(2, '0');
  return String(Math.max(0, Math.floor(num))).padStart(2, '0');
}

/** No padding — used for the Level tier (1, 2, …, 10). */
export function noPad(n: number | string): string {
  const num = typeof n === 'string' ? parseInt(n, 10) : n;
  if (!Number.isFinite(num)) return String(n);
  return String(Math.max(0, Math.floor(num)));
}

export interface LocationSegments {
  /** Single uppercase letter A–Z. Tied to a named room (e.g. "Cage 4" → "C"). */
  zone: string;
  aisle: number | string;
  bay: number | string;
  level: number | string;
  position: number | string;
}

/** Normalize zone input to a single uppercase letter; fallback to 'X' if invalid. */
function zoneLetter(z: string | number | undefined | null): string {
  const c = String(z ?? '').trim().toUpperCase().charAt(0);
  return /[A-Z]/.test(c) ? c : 'X';
}

/**
 * Compact dash-separated location code — A-01-01-1-01.
 *   zone letter · 2-digit aisle · 2-digit bay · unpadded level · 2-digit position.
 */
export function locationCode(s: LocationSegments): string {
  return `${zoneLetter(s.zone)}-${pad2(s.aisle)}-${pad2(s.bay)}-${noPad(s.level)}-${pad2(s.position)}`;
}

/** Tight all-caps code (no dashes) used inside the GS1 URI. */
export function locationCodeFlat(s: LocationSegments): string {
  return `${zoneLetter(s.zone)}${pad2(s.aisle)}${pad2(s.bay)}${noPad(s.level)}${pad2(s.position)}`;
}

/**
 * Rack-level segments — identifies a whole rack column on a single level
 * (no individual position slot). Stored as a `LocationSegments` with
 * `position: 0` so the rest of the pipeline (barcode formatting, DB
 * registration, scan routing) stays uniform.
 */
export type RackSegments = Omit<LocationSegments, 'position'>;

/** Convert rack segments to the position=0 LocationSegments form. */
export function rackToLocation(r: RackSegments): LocationSegments {
  return { zone: r.zone, aisle: r.aisle, bay: r.bay, level: r.level, position: 0 };
}

/**
 * 4-segment dashed rack code — `A-01-01-1`. Drops the position segment
 * for display; the underlying QR / DB row still uses the position=0
 * sentinel (see {@link locationCodeFlat}, which would emit `A0101100`).
 */
export function rackCode(r: RackSegments): string {
  return `${zoneLetter(r.zone)}-${pad2(r.aisle)}-${pad2(r.bay)}-${noPad(r.level)}`;
}

/**
 * A printed location code (flat form) identifies a rack — not an
 * individual bin — when the position segment is 00. Scan handlers use
 * this to route rack QR scans to the rack-detail view instead of the
 * single-bin inventory page.
 */
export function isRackCode(flat: string): boolean {
  const m = /^([A-Z])(\d{2})(\d{2})(\d{1,2})(\d{2})$/i.exec(flat.trim());
  if (!m) return false;
  return parseInt(m[5], 10) === 0;
}

/**
 * Parse a flat location code (`A0101100` / `A010111`) back into
 * segments. Returns null when the input doesn't match the expected
 * shape. Used by the rack detail view to resolve a scanned `?code=…`
 * URL parameter into the zone/aisle/bay/level it represents.
 *
 * Level is variable-width (1..99) but position is fixed 2 digits and
 * always comes last, so we anchor on the position tail and split the
 * remainder into the other segments.
 */
export function parseLocationCodeFlat(flat: string): LocationSegments | null {
  const v = flat.trim().toUpperCase();
  // Z + AA + BB + L(1-2) + PP — 8 or 9 chars total.
  const m = /^([A-Z])(\d{2})(\d{2})(\d{1,2})(\d{2})$/i.exec(v);
  if (!m) return null;
  const zone = m[1];
  const aisle = parseInt(m[2], 10);
  const bay = parseInt(m[3], 10);
  const level = parseInt(m[4], 10);
  const position = parseInt(m[5], 10);
  if (!/^[A-Z]$/.test(zone)) return null;
  if (![aisle, bay, level].every((n) => Number.isFinite(n) && n >= 1 && n <= 99)) return null;
  if (!Number.isFinite(position) || position < 0 || position > 99) return null;
  return { zone, aisle, bay, level, position };
}

/**
 * Bays alternate sides of the aisle: odd → Left, even → Right.
 * Used as a guide label on printed stickers so staff know which way to face.
 */
export function bayHand(bay: number | string): 'Left' | 'Right' {
  const n = typeof bay === 'string' ? parseInt(bay, 10) : bay;
  return Number.isFinite(n) && n % 2 === 0 ? 'Right' : 'Left';
}

/**
 * GS1 Digital Link URI for a warehouse location.
 *   /414/{gln}/254/{code}
 *
 * AI 414 = Identification of a physical location (GLN).
 * AI 254 = GLN extension component (our Z/A/B/L/P breakdown).
 *
 * `gln` is REQUIRED and must already be licensed — there is no fallback. See
 * the note where `DEFAULT_GLN` used to live.
 *
 * @deprecated for new prints — location labels emit a DataMatrix via
 * {@link locationLabelPayload}. Kept exported so the scan router can still
 * parse any pre-DataMatrix labels in the wild.
 */
export function gs1LocationUrl(
  s: LocationSegments,
  opts: { gln: string; baseUrl?: string },
): string {
  const gln = opts.gln.trim();
  const baseUrl = (opts.baseUrl || QR_BASE_URL).replace(/\/$/, '');
  const code = locationCodeFlat(s);
  const path = `/414/${encodeURIComponent(gln)}/254/${encodeURIComponent(code)}`;
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return `${baseUrl}${path}`;
  }
}

/**
 * Raw GS1 AI string in human-readable parens form — `(414)gln(254)code`.
 *
 * NOT exported: emitting AI 414 is a claim that the digits are a licensed GLN,
 * and {@link locationLabelPayload} is the only place allowed to decide that.
 * A call site that could reach this directly could bypass the check — which is
 * precisely how `DEFAULT_GLN` ended up on every printed label.
 */
function gs1LocationAi(s: LocationSegments, opts: { gln: string }): string {
  return `(414)${opts.gln.trim()}(254)${locationCodeFlat(s)}`;
}

/**
 * The licensed-GLN decision for a printed location label.
 *
 * **Not a call-site API — this is `encodePrintMatrix({ kind: 'location' })`'s
 * private helper.** It is `export`ed only because the encode SoT lives in
 * `@/lib/qr/platform-link`, which imports *this* module; the dependency cannot
 * run the other way, so the GLN logic has to sit here. Printers (bin, rack,
 * previews) compose `encodePrintMatrix`, never this — one encoder is the whole
 * point, and a second `{ value, symbology }` decision reachable from a
 * component is how the first fork started. Pinned by
 * `print-matrix-sot.guard.test.ts` → "only the encode SoT reads
 * locationLabelPayload".
 *
 * Two outcomes, and which
 * one you get is decided by whether the tenant has a licensed GLN — never by
 * a printer setting, a default, or a fallback string:
 *
 *   licensed GLN  → `gs1datamatrix` carrying `(414){gln}(254){code}`
 *                   Proper GS1: any conformant scanner reads AI 414 as "this
 *                   is a physical location with this GLN", which is TRUE.
 *
 *   anything else → `datamatrix` carrying the bare flat code (`A0101101`)
 *                   Honest: an internal code, encoded as an internal code.
 *                   `routeScan` resolves it through the same
 *                   `routeLocationCode` path, so bin-vs-rack routing and
 *                   case-normalisation are identical either way.
 *
 * **Why not just keep emitting AI 414 with some other number.** AI 414 *means*
 * GLN. There is no "unofficial GLN" — a 13-digit value in that field is read
 * by every conformant scanner as a licensed key belonging to whoever holds its
 * prefix. Printing one you do not hold is not a placeholder, it is a false
 * identity claim, and it is exactly what this repo did until now
 * (`0614141000005`, GS1's documentation GLN).
 *
 * **Labels already on the racks keep working.** `routeScan` still parses the
 * legacy `(414)…(254)…` forms — both FNC1 and parens — so a warehouse full of
 * old stickers is unaffected. This changes what NEW prints emit, nothing else.
 * No re-print is required; re-printing is what upgrades a location to real GS1
 * once a prefix is licensed.
 */
interface LocationLabelPayload {
  /** Symbology to hand the DataMatrix renderer. */
  symbology: 'gs1datamatrix' | 'datamatrix';
  /** The payload string to encode. */
  value: string;
  /** The licensed GLN this label asserts, or `null` when it asserts none. */
  gln: string | null;
  /** The flat location code, always — useful for the human-readable line. */
  code: string;
}

export function locationLabelPayload(
  s: LocationSegments,
  opts?: { gln?: string | null },
): LocationLabelPayload {
  const code = locationCodeFlat(s);
  const gln = (opts?.gln ?? '').replace(/\D/g, '');

  if (isLicensedGln(gln)) {
    return { symbology: 'gs1datamatrix', value: gs1LocationAi(s, { gln }), gln, code };
  }

  return { symbology: 'datamatrix', value: code, gln: null, code };
}

// ─── Unit / serial product label ──────────────────────────────────────────

/**
 * GS1 AI string for a unit/serial product label — `(01)gtin(21)serial`,
 * optionally with `(10)batch`. Encoded into a `gs1datamatrix` symbology
 * so phone cameras see opaque text and only the internal app's scanner
 * decodes it.
 *
 * Replaces the consumer-facing Digital Link URL form (`gs1DigitalLinkUrl`)
 * for unit labels — kept exported there for any pre-DataMatrix stickers
 * still in the wild.
 */
export function gs1UnitAi(opts: {
  gtin: string;
  serial?: string | null;
  batch?: string | null;
}): string {
  const gtin = String(opts.gtin || '').trim();
  if (!gtin) return '';
  let payload = `(01)${gtin}`;
  if (opts.serial && opts.serial.trim()) payload += `(21)${opts.serial.trim()}`;
  if (opts.batch && opts.batch.trim()) payload += `(10)${opts.batch.trim()}`;
  return payload;
}

// ─── Internal handles ─────────────────────────────────────────────────────
// Plain `datamatrix` payloads — no GS1 AIs, just the prefixed handle the
// internal app already recognises. Mirror of the URL form
// `mobileQrUrl(kind, id)`, but no host / protocol / path on the wire.

export function receivingHandle(id: string | number): string {
  return `R-${id}`;
}
export function receivingLineHandle(id: string | number): string {
  return `L-${id}`;
}
export function serialUnitHandle(id: string | number): string {
  return `U-${id}`;
}
export function handlingUnitHandle(id: string | number): string {
  return `H-${id}`;
}
export function repairHandle(id: string | number): string {
  return `REP-${id}`;
}
/** Provider ticket id (Zendesk) — ticket-minimal label DataMatrix. */
export function ticketHandle(id: string | number): string {
  return `T-${id}`;
}
