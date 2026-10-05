/**
 * The one writer waist's input/output shapes (`ingestSupportMessage`).
 * Every transport — Zendesk mirror, marketplace adapter, pasted message,
 * staff note, check-in program — hands the local store a `SupportMessageDraft`.
 * Server + client safe (types only).
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type {
  DeliveryState,
  SupportChannel,
  SupportItemKind,
  SupportMessageDirection,
  SupportPurpose,
  SupportPurposeSource,
} from './model';

export const SUPPORT_INGEST_SOURCES = [
  'zendesk_sync',
  'zendesk_import',
  'ebay',
  'amazon',
  'email',
  'website',
  'manual_paste',
  'internal_record',
  'staff',
  'check_in_program',
  'adapter',
] as const;
export type SupportIngestSource = (typeof SUPPORT_INGEST_SOURCES)[number];

/** live = full loop side effects; backfill = store only (no alerts, drafts, task creation, reopen). */
export type SupportIngestMode = 'live' | 'backfill';

export type SupportEntityLinkType =
  | 'REPAIR'
  | 'RECEIVING'
  | 'RECEIVING_LINE'
  | 'SERIAL_UNIT'
  | 'SHIPMENT'
  | 'WARRANTY_CLAIM';

export interface SupportOrderLinkInput {
  orderId: number;
  primary?: boolean;
  externalReference?: string | null;
}

export interface SupportMessageDraft {
  orgId: OrgId;
  source: SupportIngestSource;
  /** Append to this local item; else resolve by channel + externalConversationId; else create. */
  supportItemId?: number;
  channel: SupportChannel;
  /** Provider conversation id (support_tickets.external_ticket_id). */
  externalConversationId?: string | null;
  /** Provider message id — idempotency key per (org, channel). */
  externalMessageId?: string | null;
  direction: SupportMessageDirection;
  body: string;
  /** Customer/provider time (ISO). Defaults to now. */
  occurredAt?: string | null;
  authorStaffId?: number | null;
  authorLabel?: string | null;
  requester?: { name?: string | null; email?: string | null; handle?: string | null } | null;
  subject?: string | null;
  accountLabel?: string | null;
  /** The org platform (`platforms.id`) — validated as this org's by the caller. */
  platformId?: number | null;
  platformAccountId?: number | null;
  kind?: SupportItemKind;
  purpose?: {
    value: SupportPurpose;
    source: SupportPurposeSource;
    acknowledgedByStaffId: number | null;
  } | null;
  orderLinks?: SupportOrderLinkInput[];
  entityLinks?: Array<{ entityType: SupportEntityLinkType; entityId: number }>;
  assigneeStaffIds?: number[];
  task?: { urgency?: 'urgent' | 'normal'; deadlineAt?: string | null; title?: string | null } | null;
  photoIds?: number[];
  /** Client idempotency key (staff-authored messages). */
  clientEventId?: string | null;
  /** Outbound only. Defaults to 'logged'. */
  delivery?: DeliveryState;
  /** Outbound only: inbound message ids this answers (default: every pending inbound ≤ occurredAt). */
  answersMessageIds?: number[];
  mode?: SupportIngestMode;
}

/** Work the caller runs AFTER commit (route: `after()`; scripts: await). */
export interface SupportIngestAfterCommit {
  /** Inbound alert to the primary task's owners (null = none). */
  alert: { taskId: number; alertKey: string; note: string; staffIds: number[] } | null;
  /** Kick the draft worker for this item. */
  processDrafts: boolean;
}

export type IngestSupportMessageResult =
  | {
      ok: true;
      supportItemId: number;
      threadId: number;
      messageId: number | null;
      taskId: number | null;
      createdItem: boolean;
      createdTask: boolean;
      reopened: boolean;
      idempotent: boolean;
      alertedStaffIds: number[];
      draftId: number | null;
    }
  | { ok: false; status: 400 | 404 | 409 | 422; error: string };
