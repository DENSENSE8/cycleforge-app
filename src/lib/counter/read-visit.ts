/** loadCounterVisit — the reader for a submitted counter visit. */

import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { normalizePSTTimestamp } from '@/utils/date';
import type { KioskCartLine, KioskLinePayload } from '@/lib/kiosk/cart-line';
import {
  PRICE_ADJUST_KINDS,
  serviceLineCents,
  type CounterTransactionStatus,
  type PriceAdjustKind,
} from './counter-transaction-types';
import type { CounterPaymentState } from './session-events';

function isPriceAdjustKind(value: unknown): value is PriceAdjustKind {
  return (PRICE_ADJUST_KINDS as readonly unknown[]).includes(value);
}

// ── The result shape ────────────────────────────────────────────────────────

export interface CounterVisitCustomer {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  /** Callers: visit-receipt toCustomer. Schema: customers.shipping_address_1. User: "intake their information like name, email address, phone number, address" */
  address: string | null;
}

export interface CounterVisitDevice {
  id: number;
  /** repair_service.ticket_number — the RS#. */
  rsNumber: string;
  serialNumber: string;
  productTitle: string;
  /** repair_service.issue — this device's own reasons (comma-joined) plus any repair note, as written at submit (submit-repair-intake.ts). '' when none. Callers: visit-receipt buildVisitReceipt. */
  issue: string;
  /** Free-text lifecycle status. See REPAIR_STATUS_OPTIONS in repair-service-queries.ts. */
  status: string;
  /** Parsed via serviceLineCents — the SAME parser the header total was built from. */
  quoteCents: number;
  /** repair_service.price AS STORED (a text column), for a receipt that shows what was actually recorded. */
  quoteRaw: string;
  /** True when a signed intake agreement (a `documents` row) exists for this device. */
  hasSignature: boolean;
  /** The uploaded PNG, if the blob upload succeeded — null even when hasSignature is true is a recorded, known failure mode (see submit-repair-intake.ts's signatureWarning). */
  signatureUrl: string | null;
  signedAt: string | null;
  createdAt: string | null;
}

/** A line price the catalog did not set, as History and the receipt print it. */
export interface CounterVisitLineAdjustment {
  kind: PriceAdjustKind;
  /** The catalog price it was changed from; null for a custom amount. */
  originalUnitAmountCents: number | null;
  reason: string;
  staffName: string | null;
}

export interface CounterVisitLine {
  /** The client-minted line id (counter_session_lines.line_uuid). */
  id: string;
  type: KioskCartLine['type'];
  title: string;
  quantity: number;
  /** Minor units. Negative = buyback / trade-in credit — never clamped. */
  unitAmountCents: number;
  payload: KioskLinePayload;
  sortIndex: number;
  /**
   * Present → voided. A voided line is evidence and is NEVER dropped here —
   * that is the one thing that separates this ledger from the customer-facing
   * projection (see session-events.ts's device-facing note).
   */
  voidedAt: string | null;
  voidReason: string | null;
  voidedByStaffId: number | null;
  voidedByStaffName: string | null;
  /** `Adjusted from $5.59 · Price match`, `Comp · Goodwill`, `Custom`. Null = catalog price. */
  adjustment: CounterVisitLineAdjustment | null;
  /** The item note typed at the counter. */
  note: string | null;
}

export interface CounterVisitSquareTransaction {
  id: string;
  squareOrderId: string;
  squarePaymentId: string | null;
  status: string | null;
  paymentMethod: string | null;
  receiptUrl: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  discountCents: number | null;
  createdAt: string | null;
}

export interface CounterVisitPayment {
  /** The MONEY's answer — the settled square_transactions row, once the payment webhook has landed one. */
  squareTransaction: CounterVisitSquareTransaction | null;
  /** The TERMINAL's answer (counter_sessions.payment_state). */
  sessionPaymentState: CounterPaymentState | null;
}

export interface CounterVisitAuditEntry {
  id: number;
  /** One of VISIT_AUDIT_ACTIONS: price override, comp, void, submit, terminal checkout. */
  action: string;
  createdAt: string | null;
  actorStaffId: number | null;
  actorStaffName: string | null;
  actorRole: string | null;
  before: unknown;
  after: unknown;
  /** Why — `metadata.note`, else `metadata.reason_code` (a kiosk adjustment / comp / void reason). */
  note: string | null;
}

export interface CounterVisit {
  id: number;
  status: CounterTransactionStatus;
  subtotalCents: number;
  totalCents: number;
  /** The STAGED provider order id — never a charged one; see submit-counter-transaction.ts. */
  stagedSquareOrderId: string | null;
  priorOrderRef: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Null when the header's customer_id is null, or the customer row is gone (ON DELETE SET NULL). */
  customer: CounterVisitCustomer | null;
  /** Every repair_service row this visit's devices produced. Empty for a retail-only visit. */
  devices: CounterVisitDevice[];
  /** Every counter_session_lines row for the session that produced this visit, INCLUDING voided ones. Empty when this visit has no session. */
  lines: CounterVisitLine[];
  payment: CounterVisitPayment;
  /** Who was working the register — counter_sessions.claimed_by_staff_id. Null when this visit has no session. */
  claimedByStaffId: number | null;
  claimedByStaffName: string | null;
  auditTrail: CounterVisitAuditEntry[];
}

// ── Deps ────────────────────────────────────────────────────────────────────

/** Opaque transaction handle — a `PoolClient` in production, anything in tests. Mirrors CounterSessionTx (session-store.ts). */
export type ReadVisitTx = PoolClient | { readonly __fake: true };

interface VisitHeaderRow {
  id: number;
  status: CounterTransactionStatus;
  customerId: number | null;
  priorOrderRef: string | null;
  stagedSquareOrderId: string | null;
  subtotalCents: number;
  totalCents: number;
  createdAt: string | null;
  updatedAt: string | null;
}

interface VisitSessionRow {
  sessionId: number;
  claimedByStaffId: number | null;
  claimedByStaffName: string | null;
  paymentState: CounterPaymentState;
}

export interface ReadVisitDeps {
  runInTransaction<T>(orgId: OrgId, fn: (tx: ReadVisitTx) => Promise<T>): Promise<T>;
  findHeader(tx: ReadVisitTx, orgId: OrgId, counterTransactionId: number): Promise<VisitHeaderRow | null>;
  findCustomer(tx: ReadVisitTx, orgId: OrgId, customerId: number): Promise<CounterVisitCustomer | null>;
  /** ALL devices for this visit, in one query — never one call per repair. */
  findDevices(tx: ReadVisitTx, orgId: OrgId, counterTransactionId: number): Promise<CounterVisitDevice[]>;
  /** The session that produced this visit, if it went through the shared cart. At most one per `ux_counter_transactions_client_event`-style expectation; the most recently updated wins if more than one somehow points here. */
  findSession(tx: ReadVisitTx, orgId: OrgId, counterTransactionId: number): Promise<VisitSessionRow | null>;
  /** ALL lines for a session, in one query, voided included. */
  findLines(tx: ReadVisitTx, orgId: OrgId, sessionId: number): Promise<CounterVisitLine[]>;
  /**
   * Itemized lines for a SESSION-LESS visit (the direct kiosk-intake path),
   * from counter_transaction_lines. Session visits keep
   * {@link findLines} — reading both would double-print retail.
   */
  findTransactionLines(
    tx: ReadVisitTx,
    orgId: OrgId,
    counterTransactionId: number,
  ): Promise<CounterVisitLine[]>;
  findSquareTransaction(
    tx: ReadVisitTx,
    orgId: OrgId,
    counterTransactionId: number,
  ): Promise<CounterVisitSquareTransaction | null>;
  /** The money-moving/finality audit rows for this visit, in one query: */
  findAuditTrail(
    tx: ReadVisitTx,
    orgId: OrgId,
    scope: { sessionIds: number[]; counterTransactionId: number },
  ): Promise<CounterVisitAuditEntry[]>;
}

/** The counter actions this reader surfaces. Everything else on `counter_session` (claim, release, customer edits) is not money or finality — see AUDIT_ACTION's own comment. */
const VISIT_AUDIT_ACTIONS: readonly string[] = [
  AUDIT_ACTION.COUNTER_LINE_PRICE_OVERRIDE,
  AUDIT_ACTION.COUNTER_LINE_COMP,
  AUDIT_ACTION.COUNTER_LINE_VOID,
  AUDIT_ACTION.COUNTER_SESSION_SUBMIT,
  AUDIT_ACTION.COUNTER_TERMINAL_CHECKOUT,
];

function asClient(tx: ReadVisitTx): PoolClient {
  return tx as PoolClient;
}

function pstOrNull(value: unknown): string | null {
  return normalizePSTTimestamp(value as string | Date | null | undefined);
}

/** audit_logs.metadata.note, else reason_code, defensively — metadata is jsonb and its shape is not enforced. */
function extractNote(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.note === 'string') return m.note;
  return typeof m.reason_code === 'string' ? m.reason_code : null;
}

const defaultDeps: ReadVisitDeps = {
  runInTransaction(orgId, fn) {
    return withTenantTransaction(orgId, (client) => fn(client));
  },

  async findHeader(tx, orgId, counterTransactionId) {
    const res = await asClient(tx).query<Record<string, unknown>>(
      `SELECT id, status, customer_id, prior_order_ref, staged_square_order_id,
              subtotal_cents, total_cents, created_at, updated_at
         FROM counter_transactions
        WHERE organization_id = $1 AND id = $2
        LIMIT 1`,
      [orgId, counterTransactionId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      status: String(row.status) as CounterTransactionStatus,
      customerId: row.customer_id == null ? null : Number(row.customer_id),
      priorOrderRef: (row.prior_order_ref as string | null) ?? null,
      stagedSquareOrderId: (row.staged_square_order_id as string | null) ?? null,
      subtotalCents: Number(row.subtotal_cents ?? 0),
      totalCents: Number(row.total_cents ?? 0),
      createdAt: pstOrNull(row.created_at),
      updatedAt: pstOrNull(row.updated_at),
    };
  },

  async findCustomer(tx, orgId, customerId) {
    const res = await asClient(tx).query<Record<string, unknown>>(
      `SELECT id,
              COALESCE(
                NULLIF(display_name, ''),
                NULLIF(customer_name, ''),
                NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '')
              ) AS name,
              COALESCE(phone, mobile) AS phone,
              email,
              NULLIF(shipping_address_1, '') AS address
         FROM customers
        WHERE organization_id = $1 AND id = $2
        LIMIT 1`,
      [orgId, customerId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      name: (row.name as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      address: (row.address as string | null) ?? null,
    };
  },

  async findDevices(tx, orgId, counterTransactionId) {
    // LEFT JOIN LATERAL, not a second query: the latest documents row per
    // repair (signed PNG preferred, most recently signed otherwise) rides
    // along in the SAME statement, so N devices cost one round trip.
    const res = await asClient(tx).query<Record<string, unknown>>(
      `SELECT rs.id, rs.ticket_number, rs.serial_number, rs.product_title, rs.status,
              rs.issue, rs.price, rs.created_at,
              doc.signature_url, doc.signed_at
         FROM repair_service rs
         LEFT JOIN LATERAL (
           SELECT signature_url, signed_at
             FROM documents
            WHERE organization_id = $1 AND entity_type = 'REPAIR' AND entity_id = rs.id
            ORDER BY signed_at DESC NULLS LAST, id DESC
            LIMIT 1
         ) doc ON true
        WHERE rs.organization_id = $1 AND rs.counter_transaction_id = $2
        ORDER BY rs.created_at ASC NULLS LAST, rs.id ASC`,
      [orgId, counterTransactionId],
    );
    return res.rows.map((row) => {
      const raw = (row.price as string | null) ?? '';
      return {
        id: Number(row.id),
        rsNumber: (row.ticket_number as string | null) ?? '',
        serialNumber: (row.serial_number as string | null) ?? '',
        productTitle: (row.product_title as string | null) ?? '',
        issue: ((row.issue as string | null) ?? '').trim(),
        status: (row.status as string | null) ?? '',
        // The ONE canonical parser (counter-transaction-types.ts) — never a
        // second, independent parse of the same TEXT column.
        quoteCents: serviceLineCents({ productModel: '', serialNumber: '', price: raw }),
        quoteRaw: raw,
        hasSignature: row.signed_at != null,
        signatureUrl: (row.signature_url as string | null) ?? null,
        signedAt: pstOrNull(row.signed_at),
        createdAt: pstOrNull(row.created_at),
      };
    });
  },

  async findSession(tx, orgId, counterTransactionId) {
    const res = await asClient(tx).query<Record<string, unknown>>(
      `SELECT s.id, s.claimed_by_staff_id, st.name AS claimed_by_staff_name, s.payment_state
         FROM counter_sessions s
         LEFT JOIN staff st ON st.id = s.claimed_by_staff_id
        WHERE s.organization_id = $1 AND s.counter_transaction_id = $2
        ORDER BY s.updated_at DESC
        LIMIT 1`,
      [orgId, counterTransactionId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      sessionId: Number(row.id),
      claimedByStaffId: row.claimed_by_staff_id == null ? null : Number(row.claimed_by_staff_id),
      claimedByStaffName: (row.claimed_by_staff_name as string | null) ?? null,
      paymentState: ((row.payment_state as string | null) ?? 'idle') as CounterPaymentState,
    };
  },

  async findLines(tx, orgId, sessionId) {
    // No `voided_at IS NULL` filter — this is the operator ledger, not the
    // customer-facing projection. A voided line is evidence.
    const res = await asClient(tx).query<Record<string, unknown>>(
      `SELECT l.line_uuid, l.type, l.title, l.quantity, l.unit_amount_cents, l.payload,
              l.sort_index, l.voided_at, l.void_reason, l.voided_by_staff_id,
              st.name AS voided_by_staff_name
         FROM counter_session_lines l
         LEFT JOIN staff st ON st.id = l.voided_by_staff_id
        WHERE l.organization_id = $1 AND l.session_id = $2
        ORDER BY l.sort_index ASC, l.id ASC`,
      [orgId, sessionId],
    );
    return res.rows.map((row) => {
      const payload = (row.payload ?? {}) as KioskLinePayload & {
        priceAdjustment?: (CounterVisitLineAdjustment & { staffName?: string | null }) | null;
        note?: string | null;
      };
      const a = payload.priceAdjustment;
      return {
        id: String(row.line_uuid),
        type: row.type as KioskCartLine['type'],
        title: (row.title as string | null) ?? '',
        quantity: Number(row.quantity ?? 0),
        unitAmountCents: Number(row.unit_amount_cents ?? 0),
        payload,
        sortIndex: Number(row.sort_index ?? 0),
        voidedAt: pstOrNull(row.voided_at),
        voidReason: (row.void_reason as string | null) ?? null,
        voidedByStaffId: row.voided_by_staff_id == null ? null : Number(row.voided_by_staff_id),
        voidedByStaffName: (row.voided_by_staff_name as string | null) ?? null,
        adjustment:
          a && isPriceAdjustKind(a.kind)
            ? {
                kind: a.kind,
                originalUnitAmountCents: a.originalUnitAmountCents ?? null,
                reason: String(a.reason ?? ''),
                staffName: a.staffName ?? null,
              }
            : null,
        note: typeof payload.note === 'string' && payload.note.trim() ? payload.note.trim() : null,
      };
    });
  },

  async findTransactionLines(tx, orgId, counterTransactionId) {
    // Mirror of findLines over counter_transaction_lines.
    const res = await asClient(tx).query<Record<string, unknown>>(
      `SELECT l.line_uuid, l.line_type, l.title, l.sku, l.variation_id, l.quantity,
              l.unit_amount_cents, l.sort_index, l.original_unit_amount_cents,
              l.price_adjust_kind, l.price_adjust_reason, l.note,
              st.name AS price_adjusted_by_staff_name
         FROM counter_transaction_lines l
         LEFT JOIN staff st ON st.id = l.price_adjusted_by_staff_id
        WHERE l.organization_id = $1 AND l.counter_transaction_id = $2
        ORDER BY l.sort_index ASC, l.id ASC`,
      [orgId, counterTransactionId],
    );
    return res.rows.map((row) => {
      const kind = row.price_adjust_kind;
      return {
        id: String(row.line_uuid),
        type: String(row.line_type) as KioskCartLine['type'],
        title: (row.title as string | null) ?? '',
        quantity: Number(row.quantity ?? 0),
        unitAmountCents: Number(row.unit_amount_cents ?? 0),
        payload: {
          variationId: (row.variation_id as string | null) ?? null,
          sku: (row.sku as string | null) ?? '',
        } as KioskLinePayload,
        sortIndex: Number(row.sort_index ?? 0),
        voidedAt: null,
        voidReason: null,
        voidedByStaffId: null,
        voidedByStaffName: null,
        adjustment: isPriceAdjustKind(kind)
          ? {
              kind,
              originalUnitAmountCents:
                row.original_unit_amount_cents == null ? null : Number(row.original_unit_amount_cents),
              reason: (row.price_adjust_reason as string | null) ?? '',
              staffName: (row.price_adjusted_by_staff_name as string | null) ?? null,
            }
          : null,
        note: (row.note as string | null) ?? null,
      };
    });
  },

  async findSquareTransaction(tx, orgId, counterTransactionId) {
    const res = await asClient(tx).query<Record<string, unknown>>(
      `SELECT id, square_order_id, square_payment_id, status, payment_method, receipt_url,
              subtotal, tax, total, discount, created_at
         FROM square_transactions
        WHERE organization_id = $1 AND counter_transaction_id = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [orgId, counterTransactionId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      squareOrderId: String(row.square_order_id),
      squarePaymentId: (row.square_payment_id as string | null) ?? null,
      status: (row.status as string | null) ?? null,
      paymentMethod: (row.payment_method as string | null) ?? null,
      receiptUrl: (row.receipt_url as string | null) ?? null,
      subtotalCents: row.subtotal == null ? null : Number(row.subtotal),
      taxCents: row.tax == null ? null : Number(row.tax),
      totalCents: row.total == null ? null : Number(row.total),
      discountCents: row.discount == null ? null : Number(row.discount),
      createdAt: pstOrNull(row.created_at),
    };
  },

  async findAuditTrail(tx, orgId, { sessionIds, counterTransactionId }) {
    const res = await asClient(tx).query<Record<string, unknown>>(
      `SELECT a.id, a.action, a.created_at, a.actor_staff_id, st.name AS actor_staff_name,
              a.actor_role, a.before_data, a.after_data, a.metadata
         FROM audit_logs a
         LEFT JOIN staff st ON st.id = a.actor_staff_id
        WHERE a.organization_id = $1
          AND (
            (a.entity_type = $2 AND a.entity_id = ANY($3::text[]))
            OR (a.entity_type = $5 AND a.entity_id = $6)
          )
          AND a.action = ANY($4::text[])
        ORDER BY a.created_at ASC, a.id ASC`,
      [
        orgId,
        AUDIT_ENTITY.COUNTER_SESSION,
        sessionIds.map(String),
        VISIT_AUDIT_ACTIONS,
        AUDIT_ENTITY.COUNTER_TRANSACTION,
        String(counterTransactionId),
      ],
    );
    return res.rows.map((row) => ({
      id: Number(row.id),
      action: String(row.action),
      createdAt: pstOrNull(row.created_at),
      actorStaffId: row.actor_staff_id == null ? null : Number(row.actor_staff_id),
      actorStaffName: (row.actor_staff_name as string | null) ?? null,
      actorRole: (row.actor_role as string | null) ?? null,
      before: row.before_data ?? null,
      after: row.after_data ?? null,
      note: extractNote(row.metadata),
    }));
  },
};

// ── The reader ───────────────────────────────────────────────────────────────

/** Load a submitted counter visit whole — header, devices, lines, money and the audit trail — in one round trip. */
export async function loadCounterVisit(
  orgId: OrgId,
  counterTransactionId: number,
  deps: ReadVisitDeps = defaultDeps,
): Promise<CounterVisit | null> {
  return deps.runInTransaction(orgId, async (tx) => {
    const header = await deps.findHeader(tx, orgId, counterTransactionId);
    if (!header) return null;

    const customer = header.customerId
      ? await deps.findCustomer(tx, orgId, header.customerId)
      : null;
    const devices = await deps.findDevices(tx, orgId, header.id);
    const session = await deps.findSession(tx, orgId, header.id);
    const squareTransaction = await deps.findSquareTransaction(tx, orgId, header.id);
    // A visit with no session (the direct kiosk-intake path) reads its itemized lines from counter_transaction_lines — written in the SAME…
    const lines = session
      ? await deps.findLines(tx, orgId, session.sessionId)
      : await deps.findTransactionLines(tx, orgId, header.id);

    const auditTrail = await deps.findAuditTrail(tx, orgId, {
      sessionIds: session ? [session.sessionId] : [],
      counterTransactionId: header.id,
    });

    return {
      id: header.id,
      status: header.status,
      subtotalCents: header.subtotalCents,
      totalCents: header.totalCents,
      stagedSquareOrderId: header.stagedSquareOrderId,
      priorOrderRef: header.priorOrderRef,
      createdAt: header.createdAt,
      updatedAt: header.updatedAt,
      customer,
      devices,
      lines,
      payment: { squareTransaction, sessionPaymentState: session?.paymentState ?? null },
      claimedByStaffId: session?.claimedByStaffId ?? null,
      claimedByStaffName: session?.claimedByStaffName ?? null,
      auditTrail,
    };
  });
}
