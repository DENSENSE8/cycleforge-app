/**
 * Shortage coverage display + classification — the ONE paint contract.
 *
 * Staging (CSV import) and the live Shortage row both call
 * {@link formatShortageCoverage}. Do not concatenate PO / inbound / ETA in a
 * cell, a tooltip, or a confirm payload. Inbound tracking is coverage identity,
 * never `orders.tracking` / an outbound label.
 *
 * Classification ({@link TABLE_IMPORT_TRIAGE_STATUS}) is the same Ready /
 * Action-required vocabulary the To-ship CSV staging surface already paints.
 */

export const TABLE_IMPORT_TRIAGE_STATUS = {
  ready: 'ready',
  action_required: 'action_required',
} as const;

export type TableImportTriageStatus =
  (typeof TABLE_IMPORT_TRIAGE_STATUS)[keyof typeof TABLE_IMPORT_TRIAGE_STATUS];

/** Exact faces the status chip paints. CSS may uppercase; the string is this. */
export const TABLE_IMPORT_TRIAGE_LABEL = {
  ready: 'Ready',
  action_required: 'Action required',
} as const;

/**
 * Tone classes the golden staging chip already uses (`GridStatusCellValue`).
 * Cloned here so Shortage staging cannot drift from To-ship staging.
 */
export const TABLE_IMPORT_TRIAGE_PAINT = {
  ready: {
    label: TABLE_IMPORT_TRIAGE_LABEL.ready,
    toneClass: 'bg-emerald-50 text-emerald-700',
    dotClass: 'bg-emerald-500',
  },
  action_required: {
    label: TABLE_IMPORT_TRIAGE_LABEL.action_required,
    toneClass: 'bg-amber-50 text-amber-800',
    dotClass: 'bg-amber-500',
  },
} as const;

export function tableImportTriagePaint(status: TableImportTriageStatus) {
  return TABLE_IMPORT_TRIAGE_PAINT[status];
}

/** Stored on `orders.shortage_coverage` and projected through the formatter. */
export type ShortageCoverageFacts = {
  poNumber: string | null;
  inboundTracking: string | null;
  /** Civil `YYYY-MM-DD` or a parseable date string; sentinels already stripped. */
  eta: string | null;
};

export const SHORTAGE_COVERAGE_UNCOVERED = 'Uncovered';
export const SHORTAGE_COVERAGE_AWAITING = 'Awaiting inbound';

const COVERAGE_JOIN = ' · ';

const EMPTY_SENTINELS = new Set([
  '',
  'n/a',
  'na',
  'none',
  'null',
  '-',
  '--',
  'tracking not available',
  'not available',
  'tbd',
]);

/** Drop marketplace placeholders ("Tracking Not Available") and blanks. */
export function normalizeShortageCoverageToken(
  raw: string | null | undefined,
): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (EMPTY_SENTINELS.has(s.toLowerCase())) return null;
  return s;
}

function stripPoPrefix(po: string): string {
  return po.replace(/^po\s*#?\s*/i, '').trim() || po;
}

/**
 * ETA face — month + day, PST civil, no year (same density as compact ship-by).
 * Unparseable values that survived the sentinel strip read back as written.
 */
export function formatShortageCoverageEta(raw: string): string {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (us) {
    month = Number(us[1]);
    day = Number(us[2]);
    const y = Number(us[3]);
    year = y < 100 ? 2000 + y : y;
  } else {
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return raw;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    }).format(new Date(ms));
  }
  const utc = Date.UTC(year, month - 1, day, 12, 0, 0);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(utc));
}

export function parseShortageCoverageFacts(raw: unknown): ShortageCoverageFacts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { poNumber: null, inboundTracking: null, eta: null };
  }
  const rec = raw as Record<string, unknown>;
  const pick = (keys: readonly string[]) => {
    for (const key of keys) {
      const v = rec[key];
      if (typeof v === 'string' || typeof v === 'number') {
        const n = normalizeShortageCoverageToken(String(v));
        if (n) return n;
      }
    }
    return null;
  };
  return {
    poNumber: pick(['poNumber', 'po_number', 'po']),
    inboundTracking: pick(['inboundTracking', 'inbound_tracking', 'tracking']),
    eta: pick(['eta', 'eta_date', 'estimate_delivery_date']),
  };
}

/**
 * The repeatable coverage face.
 *
 * - No PO and no inbound tracking → `Uncovered` (ETA may still append).
 * - PO and/or inbound tracking → `Awaiting inbound`, then optional `PO …`
 *   and `ETA …`. Inbound tracking is identity, not a face token — it has its
 *   own staging column and must never paint as an outbound TRK.
 */
export function formatShortageCoverage(facts: ShortageCoverageFacts): string {
  const po = facts.poNumber ? stripPoPrefix(facts.poNumber) : null;
  const inbound = facts.inboundTracking;
  const eta = facts.eta;
  const covered = Boolean(po || inbound);
  const parts: string[] = [covered ? SHORTAGE_COVERAGE_AWAITING : SHORTAGE_COVERAGE_UNCOVERED];
  if (po) parts.push(`PO ${po}`);
  if (eta) parts.push(`ETA ${formatShortageCoverageEta(eta)}`);
  return parts.join(COVERAGE_JOIN);
}

export function shortageCoverageFromWire(
  raw: unknown,
): { facts: ShortageCoverageFacts; label: string } {
  const facts = parseShortageCoverageFacts(raw);
  return { facts, label: formatShortageCoverage(facts) };
}

/**
 * Display entry for string bags (CSV cells, staging row view). Same face as
 * {@link formatShortageCoverage} / {@link shortageCoverageFromWire} — tokens
 * are normalized first so "Tracking Not Available" cannot leak into live paint.
 */
export function shortageCoverageFace(parts: {
  poNumber?: string | null;
  inboundTracking?: string | null;
  eta?: string | null;
}): string {
  return formatShortageCoverage({
    poNumber: normalizeShortageCoverageToken(parts.poNumber),
    inboundTracking: normalizeShortageCoverageToken(parts.inboundTracking),
    eta: normalizeShortageCoverageToken(parts.eta),
  });
}

/** Positive integer qty — blank / zero / non-numeric fail classify. */
export function parseShortageShortQty(raw: string | null | undefined): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

export function shortageRowNamesProduct(input: {
  sku: string;
  itemNumber: string;
  itemTitle: string;
}): boolean {
  return Boolean(
    normalizeShortageCoverageToken(input.sku) ||
      normalizeShortageCoverageToken(input.itemNumber) ||
      normalizeShortageCoverageToken(input.itemTitle),
  );
}
