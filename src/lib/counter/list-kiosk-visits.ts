/**
 * Kiosk HISTORY — the device-authed book behind the tablet's History face.
 *
 * Callers: GET /api/kiosk/visit.
 * Affected API: /api/kiosk/visit (device principal, `withKioskAuth`).
 * Data schemas: counter_transactions ⋈ customers ⋈ repair_service ⋈
 *   counter_transaction_lines, UNION repair_service ⋈ customers. Read-only.
 * User: "a scrollable left list of recent visits … search by phone, ticket
 *   number or last four" — and, 2026-09-23: *"if I were to create a repair
 *   service it must show up in the history tab … it must display the real
 *   information similar from the repair service table."*
 *
 * ## Two spines, because a repair is not always a visit
 *
 * A counter visit (`counter_transactions`) is one spine. It is NOT the whole
 * book: 85 of this org's 107 `repair_service` rows carry no
 * `counter_transaction_id` at all — they were checked in from an Ecwid order,
 * an inbound shipment or the desk, never through a tablet cart. A history that
 * reads only the transaction table answers "what did THIS counter ring up",
 * which is not the question the operator asks it ("find me that repair").
 *
 * So the reader unions the transaction spine with the standalone repairs and
 * orders the two together. Each row names which book it came from (`source`)
 * and carries a `key` — `visit:19` / `repair:4799` — because the two id spaces
 * collide and a rail keyed on a bare number would paint one row for two records.
 *
 * ## The facts are the repair table's facts
 *
 * Every row carries what `/repair` prints: ticket, product title, serial, the
 * REPAIR status (`Pending Repair`, not the transaction's `staged`), customer,
 * price and date. The rail is the repair table with a tablet's column budget,
 * not a receipt stub.
 *
 * ## Why this is not `listCounterSalesAsSaleRows`
 *
 * That reader answers the SALES BOARD's question — it projects a visit into a
 * `SaleRow` so the desk can union it with provider orders, and it deliberately
 * DROPS every visit whose staged Square order already appears there. Reusing it
 * would hide exactly the rows the History face exists to reprint.
 *
 * ## Keyset, never OFFSET
 *
 * `(created_at, source, id)` descending — the source discriminator is part of
 * the key because the union's two id spaces are independent. A counter writes
 * rows while the operator is scrolling, and OFFSET pagination silently repeats
 * or skips a row when that happens; on a reprint surface that is a wrong
 * receipt in a customer's hand. The cursor is opaque to the client
 * (`<iso>|<source>|<id>`), parsed back here — plus a `|relaxed` marker when
 * the page it was cut from came from the near-name pass below.
 *
 * ## One typo is not a different customer
 *
 * A strict query runs first and wins whenever it matches anything. Only when
 * it matches NOTHING, and only when the operator typed something with letters
 * in it, does a second pass re-run with a trigram predicate over the customer
 * name. Identifiers — phone, ticket, id — are never relaxed, and the page
 * reports `relaxed` so the rail can say out loud that these are near matches.
 */

import { tenantQuery, withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizePSTTimestamp } from '@/utils/date';
import type { CounterTransactionStatus } from './counter-transaction-types';
import {
  kioskHistoryKey,
  parseKioskHistoryKey,
  type KioskHistorySource,
} from './kiosk-history-key';

export type { KioskHistorySource };
export { kioskHistoryKey, parseKioskHistoryKey };

/** One history row as the master rail paints it. */
export interface KioskVisitRow {
  /**
   * Rail key AND detail handle — `visit:19` / `repair:4799`. The two spines
   * number independently, so nothing downstream may key on `id` alone.
   */
  key: string;
  source: KioskHistorySource;
  /** `counter_transactions.id` on a visit row, `repair_service.id` on a repair row. */
  id: number;
  /** The repair this row IS (repair spine) or LEADS WITH (visit spine). */
  repairId: number | null;
  /** Transaction status. Null on a standalone repair — there is no transaction. */
  status: CounterTransactionStatus | null;
  /** The repair book's own status — `Pending Repair`. Null on a retail-only visit. */
  repairStatus: string | null;
  /**
   * Signed minor units — a buyback-heavy visit is legitimately negative. Null
   * on a repair ticket that carries no quote, which is NOT the same as zero.
   */
  totalCents: number | null;
  /** Display instant (PST-normalized, like every other counter surface). */
  createdAt: string | null;
  customerName: string | null;
  customerPhone: string | null;
  /** RS ticket of this row's device. Null on a retail-only visit. */
  ticketNumber: string | null;
  deviceCount: number;
  /** Model / SKU line under the title — devices first, else the first retail line. */
  subtitle: string | null;
  /** The device's serial, when the book recorded one. */
  serialNumber: string | null;
  /** What this row WAS, for the row glyph. */
  kind: 'repair' | 'retail' | 'mixed' | 'empty';
}

export interface KioskVisitPage {
  rows: KioskVisitRow[];
  /** Opaque; pass back as `cursor` for the next page. Null = end of history. */
  nextCursor: string | null;
  /**
   * True when the strict pass found NOTHING and these rows came from the
   * near-name pass instead. The rail must say so: an operator who cannot tell
   * a fuzzy hit from an exact one hands the wrong paper across the counter.
   */
  relaxed: boolean;
  /** What was relaxed — the name the operator typed. Null unless `relaxed`. */
  relaxedTerm: string | null;
}

/** Hard ceiling on one page — a tablet rail never needs more, and this is the DoS floor. */
export const KIOSK_VISIT_PAGE_MAX = 50;
export const KIOSK_VISIT_PAGE_DEFAULT = 25;

/**
 * Which rows the rail is showing. The counter's own vocabulary: a row is either
 * a REPAIR (it IS a `repair_service` row, or a visit that produced one) or a
 * SALE (a visit that sold something) — and `mixed` visits answer to both,
 * because a customer who bought a cable while dropping off a radio is on both
 * lists the operator looks at. A standalone repair is never a sale: there is no
 * transaction under it to ring up.
 */
export type KioskVisitKindFilter = 'all' | 'sales' | 'repair';

export function parseKioskVisitKind(raw: unknown): KioskVisitKindFilter {
  return raw === 'sales' || raw === 'repair' ? raw : 'all';
}

export interface KioskVisitListOptions {
  limit?: number;
  cursor?: string | null;
  /** Phone / ticket # / last-4 / visit id / customer name / product. */
  q?: string | null;
  kind?: KioskVisitKindFilter;
}

// ── Search parsing (pure — unit tested without a DB) ─────────────────────────

export interface KioskVisitSearch {
  /** Digits the operator typed, capped at 10. Empty when they typed no digits. */
  digits: string;
  /** Ticket text, upper-cased and stripped of a leading `#`. */
  ticket: string | null;
  /** `RS-125` / `125` → 125, when the query names a visit or repair number. */
  numeric: number | null;
  /** Anything with letters is also a name probe. */
  name: string | null;
}

/**
 * Parse one search box into every axis it could mean. A counter operator types
 * `5551234`, `RS-1042`, `1042` or `Jane` into the SAME field — asking them
 * which kind of thing they are holding is the interaction this avoids.
 */
export function parseKioskVisitSearch(raw: string | null | undefined): KioskVisitSearch | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '').slice(-10);
  const compact = trimmed.replace(/\s+/g, '').toUpperCase();
  const rsMatch = compact.match(/^RS(?:-|_|:|#)?0*(\d+)$/);
  let numeric: number | null = null;
  if (rsMatch?.[1]) {
    const n = Number(rsMatch[1]);
    numeric = Number.isSafeInteger(n) && n > 0 ? n : null;
  } else if (/^\d+$/.test(compact)) {
    const n = Number(compact);
    numeric = Number.isSafeInteger(n) && n > 0 ? n : null;
  }

  const ticket = compact.replace(/^#/, '') || null;
  const name = /[A-Za-z]/.test(trimmed) ? trimmed : null;

  return { digits, ticket, numeric, name };
}

/**
 * The part of a search that a near-name pass is allowed to widen — and only
 * that part.
 *
 * `name` alone is not the answer: `RS-1042` carries letters too, and it is an
 * IDENTIFIER. Relaxing an identifier is the defect this exists to prevent —
 * `RS-1042` fuzzily reaching ticket `RS-1043` hands a counter the wrong
 * person's device, and a near-miss phone number is the same failure. A query
 * that parsed as a number (`RS-1042`, `1042`) is therefore never relaxable,
 * no matter what letters it wears; the digit and ticket axes have no relaxed
 * form at all.
 */
export function relaxableNameTerm(search: KioskVisitSearch | null): string | null {
  if (!search || search.numeric != null) return null;
  return search.name?.trim() || null;
}

// ── Cursor (pure) ────────────────────────────────────────────────────────────

export interface KioskVisitCursor {
  createdAt: string;
  source: KioskHistorySource;
  id: number;
  /**
   * This cursor was cut from a RELAXED page. It rides in the cursor because
   * page 2 must read the SAME row set page 1 did: without it the next page
   * re-runs the strict query, and keyset paging over a row set that changed
   * shape between pages drops or repeats rows at the seam.
   */
  relaxed: boolean;
}

/** Cursor suffix marking a relaxed page. Absent = strict, so old cursors parse. */
const RELAXED_CURSOR_SUFFIX = '|relaxed';

export function encodeKioskVisitCursor(
  createdAtIso: string,
  source: KioskHistorySource,
  id: number,
  relaxed = false,
): string {
  return `${createdAtIso}|${source}|${id}${relaxed ? RELAXED_CURSOR_SUFFIX : ''}`;
}

/** Null for anything malformed — a bad cursor restarts the list, it never throws. */
export function parseKioskVisitCursor(raw: string | null | undefined): KioskVisitCursor | null {
  if (!raw) return null;
  const relaxed = raw.endsWith(RELAXED_CURSOR_SUFFIX);
  const body = relaxed ? raw.slice(0, -RELAXED_CURSOR_SUFFIX.length) : raw;
  const idAt = body.lastIndexOf('|');
  if (idAt <= 0) return null;
  const sourceAt = body.lastIndexOf('|', idAt - 1);
  if (sourceAt <= 0) return null;
  const createdAt = body.slice(0, sourceAt);
  const source = body.slice(sourceAt + 1, idAt);
  const id = Number(body.slice(idAt + 1));
  if (source !== 'visit' && source !== 'repair') return null;
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, source, id, relaxed };
}

/** Clamp a client-supplied page size into the allowed band. */
export function clampKioskVisitLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return KIOSK_VISIT_PAGE_DEFAULT;
  return Math.min(KIOSK_VISIT_PAGE_MAX, Math.max(1, Math.trunc(n)));
}

// ── The reader ───────────────────────────────────────────────────────────────

interface HistorySqlRow {
  source: string;
  id: string | number;
  repair_id: string | number | null;
  status: string | null;
  repair_status: string | null;
  total_cents: string | number | null;
  created_at_raw: string | null;
  created_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  ticket_number: string | null;
  device_count: number | null;
  device_titles: string | null;
  serial_number: string | null;
  retail_count: number | null;
  retail_title: string | null;
}

function rowKind(devices: number, retail: number): KioskVisitRow['kind'] {
  if (devices > 0 && retail > 0) return 'mixed';
  if (devices > 0) return 'repair';
  if (retail > 0) return 'retail';
  return 'empty';
}

/**
 * `repair_service.price` is free TEXT (`'168.00'`, `''`, occasionally a range).
 * Read the first money-shaped token rather than casting the column: a single
 * hand-typed `168-200` must not 500 the whole rail.
 *
 * NULL, never zero, when the ticket carries no quote. `$0.00` is a claim — it
 * says the shop agreed to do this repair for nothing — and 40-odd inbound
 * shipments in this org have simply not been quoted yet. The rail prints an em
 * dash for null and a real figure for zero.
 */
const REPAIR_PRICE_CENTS = `ROUND(
  (substring(COALESCE(rs.price, '') from '[0-9]+(?:\\.[0-9]+)?'))::numeric * 100
)::bigint`;

/**
 * Near-name relaxation threshold — `word_similarity(typed, name)` — pinned per
 * transaction rather than inherited from `pg_trgm.word_similarity_threshold`,
 * which is a SERVER setting (this database runs it at 0.6). A search rule that
 * changes when somebody tunes a database is not a rule.
 *
 * 0.3, measured against this org's book (96 customers, 2026-09-23). A
 * transposed pair inside a FULL name still scores ≥ 0.6, but inside a single
 * token — how an operator actually mistypes a surname — it lands near 0.35:
 * of 140 generated single-token typos, 0.4 found 25 and 0.3 found 106. The
 * cost is breadth, not noise — the worst single query pulled 9 of 96
 * customers, on a search that had already returned ZERO, every row of it
 * labelled as a near match.
 */
const NAME_SIMILARITY_THRESHOLD = 0.3;

/**
 * Verbatim the expressions `idx_customers_name_trgm` and
 * `idx_customers_fullname_trgm` are built on
 * (`src/lib/migrations/2026-09-23_customers_shipstation_identity_search.sql:42`).
 * Spelled any other way — a `LOWER()`, a different COALESCE order — the GIN
 * indexes stop being usable and the relaxed pass becomes a trigram scan of
 * every customer the org has.
 */
const CUSTOMER_NAME_TRGM = [
  `COALESCE(NULLIF(btrim(c.customer_name), ''), c.display_name, '')`,
  `NULLIF(btrim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '')`,
] as const;

/** `repair_service.id` is int4 — anything past this cannot be one. */
const INT4_MAX = 2147483647;

interface HistoryQuerySql {
  text: string;
  params: unknown[];
}

/**
 * Compose ONE page of the union. `relaxNames` swaps only the customer-name
 * probes for the trigram predicate; every other axis, and the walk-in scoping,
 * is composed identically in both modes, so a relaxed page can never widen
 * past what a strict page was allowed to see.
 */
function buildKioskHistoryQuery(args: {
  orgId: OrgId;
  limit: number;
  cursor: KioskVisitCursor | null;
  search: KioskVisitSearch | null;
  kind: KioskVisitKindFilter;
  relaxNames: boolean;
}): HistoryQuerySql {
  const { orgId, limit, cursor, search, kind, relaxNames } = args;
  // One params array, shared by BOTH spines: the same `$n` for the org and for
  // every search term, so a probe can never drift between the two halves.
  const params: unknown[] = [orgId];

  const visitWhere: string[] = ['ct.organization_id = $1'];
  // A standalone repair is one with no transaction under it. The visit spine
  // already carries the rest — reading them in both halves would double-paint.
  //
  // INBOUND SHIPMENTS ARE NOT COUNTER WORK (operator 2026-09-23: History "must
  // only be scoped to walk ins"). `intake_channel = 'shipment'` is a unit that
  // arrived in a box and is worked in receiving; it never stood at this
  // counter, and 17 of 85 repairs in the book are that. They are excluded from
  // BOTH the list and its search, so the rail's count, its keyset pages and its
  // "nothing matches that search" all agree with each other. `pickup` (carried
  // in at the counter, priced from a catalog `-RS` SKU — not an online order;
  // see the search-UX handoff §3.11) and a null channel (hand-entered at the
  // desk) are both walk-ins and stay.
  const repairWhere: string[] = [
    'rs.organization_id = $1',
    'rs.counter_transaction_id IS NULL',
    `COALESCE(NULLIF(TRIM(LOWER(rs.intake_channel)), ''), 'walk_in') <> 'shipment'`,
  ];

  if (cursor) {
    params.push(cursor.createdAt, cursor.source, cursor.id);
  }

  // REPAIR is "this row is, or produced, a `repair_service` row"; SALES is a
  // transaction that sold something (or took no device at all). A mixed visit
  // is a repair visit that also sold something, so it appears under BOTH —
  // hiding a drop-off from Sales because a cable rode along is how an operator
  // loses the paper they are holding.
  const HAS_DEVICE = `EXISTS (
      SELECT 1 FROM repair_service rsk
       WHERE rsk.organization_id = ct.organization_id
         AND rsk.counter_transaction_id = ct.id
    )`;
  if (kind === 'repair') {
    visitWhere.push(HAS_DEVICE);
  } else if (kind === 'sales') {
    visitWhere.push(`(NOT ${HAS_DEVICE} OR EXISTS (
      SELECT 1 FROM counter_transaction_lines lk
       WHERE lk.organization_id = ct.organization_id
         AND lk.counter_transaction_id = ct.id
    ))`);
  }
  // Sales is transactions only: a standalone repair never rang anything up.
  const includeRepairSpine = kind !== 'sales';

  if (search) {
    const visitProbes: string[] = [];
    const repairProbes: string[] = [];

    if (search.digits.length >= 3) {
      params.push(search.digits);
      const d = `$${params.length}`;
      visitProbes.push(
        `regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') LIKE '%' || ${d}`,
        `regexp_replace(COALESCE(c.mobile, ''), '\\D', '', 'g') LIKE '%' || ${d}`,
        `EXISTS (
           SELECT 1 FROM repair_service rsd
            WHERE rsd.organization_id = ct.organization_id
              AND rsd.counter_transaction_id = ct.id
              AND regexp_replace(COALESCE(rsd.contact_info, ''), '\\D', '', 'g') LIKE '%' || ${d} || '%'
         )`,
      );
      repairProbes.push(
        `regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') LIKE '%' || ${d}`,
        `regexp_replace(COALESCE(c.mobile, ''), '\\D', '', 'g') LIKE '%' || ${d}`,
        `regexp_replace(COALESCE(rs.contact_info, ''), '\\D', '', 'g') LIKE '%' || ${d} || '%'`,
      );
    }

    if (search.ticket) {
      params.push(search.ticket);
      const t = `$${params.length}`;
      visitProbes.push(
        `EXISTS (
           SELECT 1 FROM repair_service rst
            WHERE rst.organization_id = ct.organization_id
              AND rst.counter_transaction_id = ct.id
              AND LTRIM(UPPER(TRIM(COALESCE(rst.ticket_number, ''))), '#') LIKE UPPER(${t}) || '%'
         )`,
      );
      // `parseKioskVisitSearch` strips a typed `#`, and the book stores tickets
      // BOTH ways (`RS-4798` from intake, `#9998` hand-typed at the desk). Strip
      // it on the column too, or the half of the book that wears one is
      // unfindable by the number printed on its own paper.
      repairProbes.push(
        `LTRIM(UPPER(TRIM(COALESCE(rs.ticket_number, ''))), '#') LIKE UPPER(${t}) || '%'`,
      );
    }

    if (search.numeric != null) {
      params.push(search.numeric);
      const n = `$${params.length}`;
      // `counter_transactions.id` is bigint, so any typed number is a legal
      // probe against it.
      visitProbes.push(`ct.id = ${n}::bigint`);
      // `repair_service.id` is int4. A ten-digit phone typed into this box is
      // a perfectly good number and NOT a possible repair id, and casting it
      // raised 22003 — `integer out of range` — which 500s the WHOLE rail
      // rather than simply not matching. A value that cannot be a repair id is
      // not asked about.
      if (search.numeric <= INT4_MAX) {
        visitProbes.push(
          `EXISTS (
           SELECT 1 FROM repair_service rsn
            WHERE rsn.organization_id = ct.organization_id
              AND rsn.counter_transaction_id = ct.id
              AND rsn.id = ${n}::integer
         )`,
        );
        repairProbes.push(`rs.id = ${n}::integer`);
      }
    }

    if (search.name) {
      if (relaxNames) {
        // The NEAR-NAME pass. `$q <% expr` is `word_similarity(typed, name) >
        // threshold` — asymmetric on purpose, so a typed surname still scores
        // against the full name it sits inside. The expressions are the two the
        // trigram indexes are built on, verbatim.
        params.push(search.name);
        const q = `$${params.length}`;
        const nearName = CUSTOMER_NAME_TRGM.map((expr) => `${q} <% ${expr}`);
        visitProbes.push(...nearName);
        repairProbes.push(...nearName);
      } else {
        params.push(`%${search.name}%`);
        const q = `$${params.length}`;
        const customerName = [
          `COALESCE(c.display_name, '') ILIKE ${q}`,
          `COALESCE(c.customer_name, '') ILIKE ${q}`,
          `TRIM(CONCAT_WS(' ', c.first_name, c.last_name)) ILIKE ${q}`,
        ];
        visitProbes.push(...customerName);
        repairProbes.push(
          ...customerName,
          // The repair table searches the ticket's own text, and so does this:
          // "Bose Wave" is how an operator finds a drop-off whose owner they
          // cannot spell.
          `COALESCE(rs.contact_info, '') ILIKE ${q}`,
          `COALESCE(rs.product_title, '') ILIKE ${q}`,
          `COALESCE(rs.serial_number, '') ILIKE ${q}`,
        );
      }
    }

    // No probe survived (e.g. a lone `#`) — a search that matches nothing must
    // return nothing, never the unfiltered list.
    visitWhere.push(visitProbes.length > 0 ? `(${visitProbes.join(' OR ')})` : 'FALSE');
    repairWhere.push(repairProbes.length > 0 ? `(${repairProbes.join(' OR ')})` : 'FALSE');
  }

  // limit + 1: the extra row answers "is there a next page" without COUNT(*).
  params.push(limit + 1);
  const limitParam = `$${params.length}`;

  const visitSpine = `
    SELECT 'visit'::text                  AS source,
           ct.id                          AS id,
           dev.repair_id                  AS repair_id,
           ct.status                      AS status,
           dev.repair_status              AS repair_status,
           COALESCE(ct.total_cents, 0)::bigint AS total_cents,
           ct.created_at::text            AS created_at_raw,
           ct.created_at                  AS created_at,
           COALESCE(
             NULLIF(c.display_name, ''),
             NULLIF(c.customer_name, ''),
             NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), '')
           )                              AS customer_name,
           COALESCE(c.phone, c.mobile)    AS customer_phone,
           dev.ticket_number              AS ticket_number,
           COALESCE(dev.device_count, 0)  AS device_count,
           dev.device_titles              AS device_titles,
           dev.serial_number              AS serial_number,
           COALESCE(ln.retail_count, 0)   AS retail_count,
           ln.retail_title                AS retail_title
      FROM counter_transactions ct
      LEFT JOIN customers c
        ON c.id = ct.customer_id AND c.organization_id = ct.organization_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS device_count,
               (ARRAY_AGG(rs.id ORDER BY rs.created_at ASC NULLS LAST, rs.id ASC))[1]
                 AS repair_id,
               (ARRAY_AGG(NULLIF(TRIM(COALESCE(rs.ticket_number, '')), '')
                          ORDER BY rs.created_at ASC NULLS LAST, rs.id ASC)
                FILTER (WHERE NULLIF(TRIM(COALESCE(rs.ticket_number, '')), '') IS NOT NULL))[1]
                 AS ticket_number,
               (ARRAY_AGG(NULLIF(TRIM(COALESCE(rs.product_title, '')), '')
                          ORDER BY rs.created_at ASC NULLS LAST, rs.id ASC)
                FILTER (WHERE NULLIF(TRIM(COALESCE(rs.product_title, '')), '') IS NOT NULL))[1]
                 AS device_titles,
               (ARRAY_AGG(NULLIF(TRIM(COALESCE(rs.serial_number, '')), '')
                          ORDER BY rs.created_at ASC NULLS LAST, rs.id ASC)
                FILTER (WHERE NULLIF(TRIM(COALESCE(rs.serial_number, '')), '') IS NOT NULL))[1]
                 AS serial_number,
               (ARRAY_AGG(NULLIF(TRIM(COALESCE(rs.status, '')), '')
                          ORDER BY rs.created_at ASC NULLS LAST, rs.id ASC)
                FILTER (WHERE NULLIF(TRIM(COALESCE(rs.status, '')), '') IS NOT NULL))[1]
                 AS repair_status
          FROM repair_service rs
         WHERE rs.organization_id = ct.organization_id
           AND rs.counter_transaction_id = ct.id
      ) dev ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS retail_count,
               (ARRAY_AGG(NULLIF(TRIM(COALESCE(l.title, '')), '')
                          ORDER BY l.sort_index ASC, l.id ASC)
                FILTER (WHERE NULLIF(TRIM(COALESCE(l.title, '')), '') IS NOT NULL))[1]
                 AS retail_title
          FROM counter_transaction_lines l
         WHERE l.organization_id = ct.organization_id
           AND l.counter_transaction_id = ct.id
      ) ln ON true
     WHERE ${visitWhere.join('\n       AND ')}`;

  // The standalone repairs. `contact_info` is the pre-customers intake string
  // ("Name, phone") every Ecwid-sourced ticket still carries, so it is the
  // fallback identity rather than painting "Walk-in" over a name we hold.
  //
  // The fallback is POSITION-FREE, matching `@/lib/repair/contact-info` (the
  // TS rule every other surface reads). `split_part(…, 2)` assumed the writer's
  // `[name, phone, email].filter(Boolean)` always produced a phone in slot 2,
  // so a buyer with no phone put their EMAIL in the rail's phone column — which
  // is also what the search predicate matches against.
  const repairSpine = `
    SELECT 'repair'::text                 AS source,
           rs.id                          AS id,
           rs.id                          AS repair_id,
           NULL::text                     AS status,
           NULLIF(TRIM(COALESCE(rs.status, '')), '') AS repair_status,
           ${REPAIR_PRICE_CENTS}          AS total_cents,
           rs.created_at::text            AS created_at_raw,
           rs.created_at                  AS created_at,
           COALESCE(
             NULLIF(c.display_name, ''),
             NULLIF(c.customer_name, ''),
             NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
             -- The first segment that is neither an email nor a phone.
             (SELECT NULLIF(TRIM(part), '')
                FROM unnest(string_to_array(COALESCE(rs.contact_info, ''), ',')) AS part
               WHERE TRIM(part) <> ''
                 AND POSITION('@' IN part) = 0
                 AND length(regexp_replace(part, '\\D', '', 'g')) < 7
               LIMIT 1)
           )                              AS customer_name,
           COALESCE(
             c.phone,
             c.mobile,
             -- The first segment that is mostly digits and is not an email.
             (SELECT NULLIF(TRIM(part), '')
                FROM unnest(string_to_array(COALESCE(rs.contact_info, ''), ',')) AS part
               WHERE POSITION('@' IN part) = 0
                 AND length(regexp_replace(part, '\\D', '', 'g')) >= 7
               LIMIT 1)
           )                              AS customer_phone,
           NULLIF(TRIM(COALESCE(rs.ticket_number, '')), '') AS ticket_number,
           1                              AS device_count,
           NULLIF(TRIM(COALESCE(rs.product_title, '')), '') AS device_titles,
           NULLIF(TRIM(COALESCE(rs.serial_number, '')), '') AS serial_number,
           0                              AS retail_count,
           NULL::text                     AS retail_title
      FROM repair_service rs
      LEFT JOIN customers c
        ON c.id = rs.customer_id AND c.organization_id = rs.organization_id
     WHERE ${repairWhere.join('\n       AND ')}`;

  const spines = includeRepairSpine ? [visitSpine, repairSpine] : [visitSpine];
  const cursorWhere = cursor
    ? `WHERE (h.created_at, h.source, h.id) < ($2::timestamptz, $3::text, $4::bigint)`
    : '';

  return {
    text: `SELECT h.*
       FROM (${spines.join('\n     UNION ALL\n')}) h
      ${cursorWhere}
      ORDER BY h.created_at DESC, h.source DESC, h.id DESC
      LIMIT ${limitParam}`,
    params,
  };
}

/**
 * Run one composed page. The relaxed pass pins the trigram threshold with a
 * transaction-local `set_config` — the same scope the org GUC uses one line
 * above it in `withTenantConnection` — so the `<%` operator stays index-usable
 * AND still means {@link NAME_SIMILARITY_THRESHOLD} on a server whose own
 * `pg_trgm.word_similarity_threshold` has been tuned (this one sits at 0.6,
 * which would silently lose half of the typos this path exists to catch).
 */
async function runHistoryPage(
  orgId: OrgId,
  query: HistoryQuerySql,
  relaxNames: boolean,
): Promise<HistorySqlRow[]> {
  if (!relaxNames) {
    const res = await tenantQuery<HistorySqlRow>(orgId, query.text, query.params);
    return res.rows;
  }
  return withTenantConnection(orgId, async (client) => {
    await client.query("SELECT set_config('pg_trgm.word_similarity_threshold', $1, true)", [
      String(NAME_SIMILARITY_THRESHOLD),
    ]);
    const res = await client.query<HistorySqlRow>(query.text, query.params);
    return res.rows;
  });
}

export async function listKioskVisits(
  orgId: OrgId,
  options: KioskVisitListOptions = {},
): Promise<KioskVisitPage> {
  const limit = clampKioskVisitLimit(options.limit ?? KIOSK_VISIT_PAGE_DEFAULT);
  const cursor = parseKioskVisitCursor(options.cursor);
  const search = parseKioskVisitSearch(options.q);
  const kind = parseKioskVisitKind(options.kind);

  /**
   * STRICT FIRST, ALWAYS. Relaxation is a fallback over an EMPTY result, never
   * a widened primary query: as long as the typed text matches something
   * exactly, the operator sees exactly that and nothing near it.
   *
   * Only the NAME axis is ever relaxed. Phone, ticket and id are identifiers:
   * `714-271-2864` and `714-271-2846` are two different people, and a counter
   * that hands over the near-miss hands over the wrong customer's radio.
   *
   * This is also not the name-MERGING that law 1 of the kiosk-history handoff
   * (§3) forbids. That law is about WRITES — never fusing two customer records
   * because their names look alike. Nothing here writes, links or dedupes: the
   * rows stay as distinct as the book made them, and this only widens which of
   * them are DISPLAYED, under a label saying so.
   */
  const relaxableTerm = relaxableNameTerm(search);
  // A relaxed cursor resumes the relaxed set directly — re-running the strict
  // query for page 2 would read a different row set than page 1 was cut from.
  let relaxNames = cursor?.relaxed === true && relaxableTerm !== null;
  let sqlRows = await runHistoryPage(
    orgId,
    buildKioskHistoryQuery({ orgId, limit, cursor, search, kind, relaxNames }),
    relaxNames,
  );
  if (!relaxNames && relaxableTerm !== null && sqlRows.length === 0) {
    relaxNames = true;
    sqlRows = await runHistoryPage(
      orgId,
      buildKioskHistoryQuery({ orgId, limit, cursor, search, kind, relaxNames: true }),
      true,
    );
  }

  const page = sqlRows.slice(0, limit);
  const rows: KioskVisitRow[] = page.map((row) => {
    const source: KioskHistorySource = row.source === 'repair' ? 'repair' : 'visit';
    const id = Number(row.id);
    const devices = Number(row.device_count ?? 0);
    const retail = Number(row.retail_count ?? 0);
    return {
      key: kioskHistoryKey(source, id),
      source,
      id,
      repairId: row.repair_id == null ? null : Number(row.repair_id),
      status: row.status == null ? null : (String(row.status) as CounterTransactionStatus),
      repairStatus: row.repair_status,
      totalCents: row.total_cents == null ? null : Number(row.total_cents),
      createdAt: normalizePSTTimestamp(row.created_at as string | null),
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      ticketNumber: row.ticket_number,
      deviceCount: devices,
      subtitle: row.device_titles ?? row.retail_title ?? null,
      serialNumber: row.serial_number,
      kind: rowKind(devices, retail),
    };
  });

  const last = page[page.length - 1];
  const nextCursor =
    sqlRows.length > limit && last?.created_at_raw
      ? encodeKioskVisitCursor(
          last.created_at_raw,
          last.source === 'repair' ? 'repair' : 'visit',
          Number(last.id),
          relaxNames,
        )
      : null;

  // A relaxed pass that found nothing either is not a relaxed RESULT — there
  // is no near hit to warn about, and the rail's own "nothing matches that
  // search" is the honest line.
  const relaxed = relaxNames && rows.length > 0;
  return { rows, nextCursor, relaxed, relaxedTerm: relaxed ? relaxableTerm : null };
}
