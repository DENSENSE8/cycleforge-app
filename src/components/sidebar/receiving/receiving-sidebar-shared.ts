/** Shared types, constants, and pure helpers used across the receiving sidebar surface and the right-pane workspace. */

import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { RECEIVING_NAV_ICONS } from '@/lib/nav/station-nav-icons';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { SOURCE_PLATFORMS } from '@/lib/source-platform';
import { RECEIVING_TYPES } from '@/lib/receiving/receiving-type-meta';
import type { ClaimType } from '@/lib/receiving-claim-type';

// ── Sidebar mode switcher ───────────────────────────────────────────────────

export type ReceivingMode = 'incoming' | 'triage' | 'receive' | 'history' | 'pickup' | 'repair';

// Sidebar order:
const RECEIVING_MODE_ITEMS: HorizontalSliderItem[] = [
  { id: 'incoming', label: 'Inbound',      icon: RECEIVING_NAV_ICONS.incoming },
  { id: 'triage',   label: 'Arrival',    icon: RECEIVING_NAV_ICONS.triage },
  { id: 'receive',  label: 'Unbox',        icon: RECEIVING_NAV_ICONS.receive },
  { id: 'pickup',   label: 'Local Pickup', icon: RECEIVING_NAV_ICONS.pickup },
  { id: 'repair',   label: 'Repair',       icon: RECEIVING_NAV_ICONS.repair },
];

// ── Carton scratch (localStorage) ───────────────────────────────────────────

/**
 * Carton-level scratch (Zendesk, listing) for Receive; survives line-to-line
 * nav within the same carton. PO item notes live in DB (`receiving_lines.notes`)
 * per line, not here.
 */
const RECEIVING_LINE_DETAILS_STORAGE_KEY = (
  receivingId: number,
  orgId?: string | null,
) => {
  const org = String(orgId ?? '').trim() || 'default';
  return `receiving:${org}:sidebar.lineDetails.v1:${receivingId}`;
};

/** Legacy key (pre org-namespacing) — read-only fallback for migration. */
const LEGACY_RECEIVING_LINE_DETAILS_STORAGE_KEY = (receivingId: number) =>
  `receiving.sidebar.lineDetails.v1:${receivingId}`;

type ReceivingLineDetailScratch = {
  zendesk: string;
  listing: string;
  /** Extra carrier refs for multi-piece POs; primary tracking still PATCHes shipment. */
  extra_trackings: string[];
};

export function readReceivingLineDetailsScratch(
  receivingId: number | null,
  orgId?: string | null,
): ReceivingLineDetailScratch {
  if (receivingId == null || typeof window === 'undefined') {
    return { zendesk: '', listing: '', extra_trackings: [] };
  }
  try {
    const raw =
      window.localStorage.getItem(RECEIVING_LINE_DETAILS_STORAGE_KEY(receivingId, orgId)) ??
      window.localStorage.getItem(LEGACY_RECEIVING_LINE_DETAILS_STORAGE_KEY(receivingId));
    if (!raw) return { zendesk: '', listing: '', extra_trackings: [] };
    const o = JSON.parse(raw) as Partial<ReceivingLineDetailScratch>;
    const extrasRaw = o.extra_trackings;
    const extra_trackings = Array.isArray(extrasRaw)
      ? extrasRaw.filter((x): x is string => typeof x === 'string')
      : [];
    return {
      zendesk: typeof o.zendesk === 'string' ? o.zendesk : '',
      listing: typeof o.listing === 'string' ? o.listing : '',
      extra_trackings,
    };
  } catch {
    return { zendesk: '', listing: '', extra_trackings: [] };
  }
}

export function writeReceivingLineDetailsScratch(
  receivingId: number,
  d: ReceivingLineDetailScratch,
  orgId?: string | null,
) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      RECEIVING_LINE_DETAILS_STORAGE_KEY(receivingId, orgId),
      JSON.stringify({
        zendesk: d.zendesk,
        listing: d.listing,
        extra_trackings: d.extra_trackings,
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

// ── Carton + PO types ───────────────────────────────────────────────────────

export type PoLineSummary = {
  id: number;
  sku: string | null;
  item_name: string | null;
  image_url: string | null;
  quantity_expected: number | null;
  quantity_received: number;
  zoho_purchaseorder_id: string | null;
  zoho_purchaseorder_number: string | null;
  /** The marketplace order this line was purchased under (eBay `11-15183-54752`, Amazon `112-…`). */
  source_order_id: string | null;
  /** 'zoho' | 'ebay' | … — picks the Order-vs-PO ladder in `getReceivingPoIdentityParts`. */
  inbound_source_type: string | null;
  receiving_type: string | null;
  condition_grade: string | null;
  /** The grading ACT; with it the stub row never re-commits a default grade over a graded line. */
  condition_graded_at?: string | null;
};

export type ReceivingPackageMeta = {
  received_at: string | null;
  unboxed_at: string | null;
  created_at: string | null;
  return_platform: string | null;
  source_platform: string | null;
  is_return: boolean;
  /** Carton urgency (`receiving_carton.priority_tier`, null = Auto) — the stub row paints it before hydration. */
  priority_tier?: number | null;
  is_priority?: boolean;
  listing_url?: string | null;
};

export type PoContext = {
  receiving_id: number;
  po_ids: string[];
  lines: PoLineSummary[];
  receiving_package: ReceivingPackageMeta | null;
};

// ── Platform + type labels ──────────────────────────────────────────────────

/** Built-in type pills — derived from the receiving-type SoT (incl. Repair). */
export const RECEIVING_TYPE_OPTS = RECEIVING_TYPES.map((t) => ({
  value: t.value,
  label: t.label,
}));

// Pill options + printed-label map both derive from the platform SoT so a platform never reads two ways across surfaces.
const SOURCE_PLATFORM_OPTS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Unknown' },
  ...SOURCE_PLATFORMS.map((p) => ({ value: p.value, label: p.label })),
];

/** Detect a source_platform value from a listing URL's hostname. */
export function detectPlatformFromUrl(url: string | null | undefined): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (/(^|\.)ebay\.[a-z.]+$/.test(host)) return 'ebay';
  if (host.includes('shopgoodwill')) return 'goodwill';
  if (/(^|\.)amazon\.[a-z.]+$/.test(host)) return 'amazon';
  if (host.includes('aliexpress')) return 'aliexpress';
  if (/(^|\.)walmart\.[a-z.]+$/.test(host)) return 'walmart';
  return 'other';
}

// ── Carton helpers ──────────────────────────────────────────────────────────

export function parseReceivingPackage(raw: unknown): ReceivingPackageMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    received_at: o.received_at != null ? String(o.received_at) : null,
    unboxed_at: o.unboxed_at != null ? String(o.unboxed_at) : null,
    created_at: o.created_at != null ? String(o.created_at) : null,
    return_platform: o.return_platform != null ? String(o.return_platform) : null,
    source_platform: o.source_platform != null ? String(o.source_platform) : null,
    is_return: Boolean(o.is_return),
    priority_tier: o.priority_tier != null && Number.isFinite(Number(o.priority_tier)) ? Number(o.priority_tier) : null,
    is_priority: Boolean(o.is_priority),
    listing_url: o.listing_url != null ? String(o.listing_url) : null,
  };
}

export function mapApiLineToPoSummary(l: {
  id: number;
  sku: string | null;
  item_name: string | null;
  image_url: string | null;
  quantity_expected: number | null;
  quantity_received: number;
  zoho_purchaseorder_id?: string | null;
  zoho_purchaseorder_number?: string | null;
  source_order_id?: string | null;
  inbound_source_type?: string | null;
  receiving_type?: string | null;
  condition_grade?: string | null;
  condition_graded_at?: string | null;
}): PoLineSummary {
  return {
    id: l.id,
    sku: l.sku,
    item_name: l.item_name,
    image_url: l.image_url ?? null,
    quantity_expected: l.quantity_expected,
    quantity_received: l.quantity_received,
    zoho_purchaseorder_id: l.zoho_purchaseorder_id ?? null,
    zoho_purchaseorder_number: l.zoho_purchaseorder_number ?? null,
    source_order_id: l.source_order_id ?? null,
    inbound_source_type: l.inbound_source_type ?? null,
    receiving_type: l.receiving_type ?? 'PO',
    condition_grade: l.condition_grade ?? 'USED_A',
    condition_graded_at: l.condition_graded_at ?? null,
  };
}

// ── Scan / exception types ──────────────────────────────────────────────────

export function randomId(): string {
  return safeRandomUUID();
}

// ── Listing URL helpers ───────────────────────────────────────────────────── `listingUrlForOpen` lived here until 2026-08-10.

/** Desktop Unbox surface deep link (`/unbox?recvId=…&lineId=…`). */
export function receivingShareUrl(receivingId: number, lineId?: number): string {
  const path = '/unbox';
  if (typeof window !== 'undefined') {
    const u = new URL(path, window.location.origin);
    u.searchParams.set('recvId', String(receivingId));
    if (lineId != null && Number.isFinite(lineId) && lineId > 0) {
      u.searchParams.set('lineId', String(lineId));
    }
    return u.toString();
  }
  const params = new URLSearchParams({ recvId: String(receivingId) });
  if (lineId != null && Number.isFinite(lineId) && lineId > 0) {
    params.set('lineId', String(lineId));
  }
  return `${path}?${params.toString()}`;
}

/** Short human-facing label for a listing URL (host + clipped path); not for navigation. */
// ── Select-line event payload ───────────────────────────────────────────────

/** Shape of the `receiving-select-line` CustomEvent's detail. */
export type ReceivingSelectLineDetail =
  | ReceivingLineRow
  | null
  | {
      row: ReceivingLineRow | null;
      expandFlowSections?: boolean;
      /** Whether this open should stamp the operator's recents (`POST /api/receiving-lines/view` → the Recent tab). */
      recordView?: boolean;
      /** Preview stance open — the operator asked *"what is this?"*, not *"work this"*. */
      preview?: boolean;
    };

export function readSelectLineDetail(
  detail: ReceivingSelectLineDetail,
): {
  row: ReceivingLineRow | null;
  expandFlowSections: boolean;
  recordView: boolean;
  preview: boolean;
} {
  if (detail && typeof detail === 'object' && 'row' in detail) {
    const preview = detail.preview === true;
    return {
      row: detail.row ?? null,
      expandFlowSections: detail.expandFlowSections === true,
      // A preview can never record a view, whatever the caller passed — the
      // two facts are one decision, so they resolve in one place.
      recordView: !preview && detail.recordView !== false,
      preview,
    };
  }
  return {
    row: (detail as ReceivingLineRow | null) ?? null,
    expandFlowSections: false,
    recordView: true,
    preview: false,
  };
}

// ── Form input class tokens ─────────────────────────────────────────────────

export const SELECT_CLASS =
  cn('w-full rounded-md border border-border-soft bg-surface-card inset-chip text-role-caption font-semibold text-text-default', focusRing('field', 'accent'));

// ── Type scale (sidebar + workspace share this) ─────────────────────────────
/** One source of truth for typography inside the receiving panel + workspace. */

const TYPE_FIELD_LABEL_CLASS =
  'block text-role-eyebrow text-text-soft';

// ── Flow-section class + tone tokens ────────────────────────────────────────

/** Back-compat alias — field labels above inputs. */
export const FLOW_SECTION_LABEL = TYPE_FIELD_LABEL_CLASS;

export const RECEIVING_SCAN_RULE_LINE_CLASS =
  '-mx-3 h-px shrink-0 bg-surface-strong transition-colors group-focus-within:bg-blue-500';

export const RECEIVING_CHIP_EDIT_BTN_CLASS =
  'flex size-[22px] shrink-0 items-center justify-center rounded-sm text-text-faint transition-colors hover:bg-surface-sunken hover:text-text-default active:scale-95';

// ── Section tone tokens ───────────────────────────────────────────────────── ─── Claim modal…

export type { ClaimType } from '@/lib/receiving-claim-type';

export const CLAIM_TYPE_OPTIONS: ReadonlyArray<{
  value: ClaimType;
  label: string;
  /** Pill background + text color when selected. */
  active: string;
  /** Inactive pill color. */
  inactive: string;
}> = [
  { value: 'damage',           label: 'Damage',           active: 'bg-rose-600 text-white',    inactive: 'bg-rose-50 text-rose-700' },
  { value: 'missing',          label: 'Missing',          active: 'bg-amber-600 text-white',   inactive: 'bg-amber-50 text-amber-700' },
  { value: 'wrong_item',       label: 'Wrong item',       active: 'bg-violet-600 text-white',  inactive: 'bg-violet-50 text-violet-700' },
  { value: 'vendor_defect',    label: 'Vendor defect',    active: 'bg-orange-600 text-white',  inactive: 'bg-orange-50 text-orange-700' },
  // Auto-selected by ReceivingClaimModal for RETURN-type intake.
  { value: 'return',           label: 'Return',           active: 'bg-teal-600 text-white',    inactive: 'bg-teal-50 text-teal-700' },
  // Auto-selected when the carton STN is carrier-RETURNED (distinct from return intake).
  { value: 'return_to_sender', label: 'Return to sender', active: 'bg-surface-inverse text-white',   inactive: 'bg-surface-sunken text-text-muted' },
  // Auto-selected by ReceivingClaimModal when row.receiving_source === 'unmatched'
  // and no PO# is present; hidden once a PO# is found/filled.
  { value: 'unfound',          label: 'Unfound',          active: 'bg-yellow-600 text-white',  inactive: 'bg-yellow-50 text-yellow-700' },
  // Repair routing — entry point for warranty / in-house bench work.
  { value: 'repair_service',   label: 'Repair service',   active: 'bg-sky-600 text-white',     inactive: 'bg-sky-50 text-sky-700' },
];

import { extractCanonicalTracking } from '@/lib/tracking-format';
import {
  isReceivingRailShipmentKey,
  receivingRailRowKey,
  receivingRailShipmentKey,
} from '@/lib/receiving/rail/rail-carton-key';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** Negative line id for a pre-resolve pending scan — cannot collide with DB ids. */
function pendingScanLineId(canonicalTracking: string): number {
  let h = 5381;
  for (let i = 0; i < canonicalTracking.length; i++) {
    h = ((h << 5) + h) ^ canonicalTracking.charCodeAt(i);
  }
  return -(Math.abs(h) || 1);
}

/**
 * The ONE pre-resolve row for an Unbox scan that missed the rail cache — the
 * rail's pending row AND the openable empty unmatched pane, keyed
 * `stn:<canonical tracking>` so the resolved carton row upgrades it in place.
 * The rail never highlights it ({@link isPendingScanRow}); selection follows
 * the real carton / line once a rung resolves.
 */
export function buildPendingScanRow(trackingNumber: string): ReceivingLineRow {
  const canonical = extractCanonicalTracking(trackingNumber) || trackingNumber.trim();
  const now = new Date().toISOString();
  return {
    id: pendingScanLineId(canonical),
    receiving_id: null,
    client_event_id: receivingRailShipmentKey(canonical) ?? `stn:${canonical}`,
    tracking_number: canonical,
    carrier: null,
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: null,
    item_name: canonical,
    sku: null,
    quantity_received: 0,
    quantity_expected: null,
    qa_status: 'PENDING',
    workflow_status: null,
    disposition_code: 'HOLD',
    condition_grade: '',
    disposition_audit: [],
    needs_test: true,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: 'PO',
    notes: null,
    created_at: now,
    last_activity_at: now,
    scanned_at: now,
    image_url: null,
    source_platform: null,
    receiving_source: 'unmatched',
  };
}

/** True for the {@link buildPendingScanRow} row — no carton yet, writes gated, never a rail selection. */
export function isPendingScanRow(row: ReceivingLineRow): boolean {
  return row.receiving_id == null && row.id < 0 && isReceivingRailShipmentKey(row.client_event_id);
}

/** Synthesize a ReceivingLineRow for an unmatched carton that has no receiving_lines rows yet (operator just scanned the tracking; no items… */
export function buildUnmatchedStubRow(
  receivingId: number,
  trackingNumber: string,
): ReceivingLineRow {
  return {
    id: -receivingId,
    receiving_id: receivingId,
    tracking_number: trackingNumber,
    carrier: null,
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: null,
    item_name: null,
    sku: null,
    quantity_received: 0,
    quantity_expected: null,
    qa_status: 'PENDING',
    workflow_status: null,
    disposition_code: 'HOLD',
    // Leave empty so the workspace stepper's "Condition" step does NOT auto-mark itself done — the DB column defaults to 'BRAND_NEW' but for…
    condition_grade: '',
    disposition_audit: [],
    needs_test: true,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: 'PO',
    notes: null,
    created_at: null,
    image_url: null,
    source_platform: null,
    receiving_source: 'unmatched',
  };
}

/**
 * Final-shape row for the Unbox UNBOXED rail — title is stable from the first
 * paint ("Unfound PO"), keyed on `carton:{receivingId}` so no tracking# →
 * unfound title flicker or disappear/reappear on refetch.
 */
export function buildUnboxRailUnmatchedRow(
  receivingId: number,
  trackingNumber: string,
): ReceivingLineRow {
  const now = new Date().toISOString();
  return {
    ...buildUnmatchedStubRow(receivingId, trackingNumber),
    item_name: 'Unfound PO',
    workflow_status: 'DONE',
    // Shipment-first, so an unfound carton lands on the pending stub's own key.
    client_event_id: String(
      receivingRailRowKey({ tracking_number: trackingNumber, receiving_id: receivingId }),
    ),
    scanned_at: now,
    // Unbox-open MRU stamp — same axis as buildUnboxRailMatchedRow / ops MAX.
    unbox_opened_at: now,
    last_activity_at: now,
    created_at: now,
  };
}

/** Optimistic OPEN stub for a MATCHED carton — a full {@link ReceivingLineRow} seeded from a lookup-po line summary so the right-pane… */
export function buildMatchedStubRow(
  receivingId: number,
  trackingNumber: string,
  line: PoLineSummary,
  pkg: Pick<ReceivingPackageMeta, 'source_platform' | 'priority_tier' | 'is_priority' | 'listing_url'> | null = null,
): ReceivingLineRow {
  return {
    id: line.id,
    receiving_id: receivingId,
    tracking_number: trackingNumber,
    carrier: null,
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: line.zoho_purchaseorder_id,
    zoho_purchaseorder_number: line.zoho_purchaseorder_number,
    source_order_id: line.source_order_id,
    inbound_source_type: line.inbound_source_type,
    item_name: line.item_name,
    sku: line.sku,
    quantity_received: line.quantity_received,
    quantity_expected: line.quantity_expected,
    qa_status: 'PENDING',
    workflow_status: null,
    disposition_code: 'HOLD',
    // Seed the real grade from the summary so the header reads correctly the
    // moment the pane opens; the hydration fetch reconciles it in place. Falls
    // back to '' (don't auto-mark the Condition step) when the summary lacks one.
    condition_grade: line.condition_grade ?? '',
    condition_graded_at: line.condition_graded_at ?? null,
    disposition_audit: [],
    needs_test: true,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: line.receiving_type,
    notes: null,
    created_at: null,
    image_url: line.image_url,
    source_platform: pkg?.source_platform ?? null,
    receiving_listing_url: pkg?.listing_url ?? null,
    // The carton's urgency, so the header never reads the platform default over a set tier.
    priority_tier: pkg?.priority_tier ?? null,
    is_priority: pkg?.is_priority ?? false,
    receiving_source: null,
  };
}
