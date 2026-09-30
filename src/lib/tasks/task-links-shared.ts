/** Task **links** — the records a task names beyond its anchor, as the wire and the desk both read them. */

import type { TaskMediaLink } from './media-links';

export const TASK_LINK_KINDS = ['order', 'tracking', 'ticket', 'repair'] as const;
export type TaskLinkKind = (typeof TASK_LINK_KINDS)[number];

export function isTaskLinkKind(raw: unknown): raw is TaskLinkKind {
  return typeof raw === 'string' && (TASK_LINK_KINDS as readonly string[]).includes(raw);
}

/** The noun an operator reads for each kind. One spelling, every surface. */
export const TASK_LINK_NOUN: Readonly<Record<TaskLinkKind, string>> = {
  order: 'Order',
  tracking: 'Tracking',
  ticket: 'Ticket',
  repair: 'Repair',
};

/** The lean face a task ROW carries — enough to search, count and paint band 3. */
export interface TaskLinkFace {
  kind: TaskLinkKind;
  label: string;
  /** `ticket` links only — the linked ticket's `support_tickets.status_cache` (null when unknown or not a ticket). */
  status?: string | null;
  /** `repair` links only — the repair row's id, stamped ticket number and stored status (absent when the row is gone). */
  repair?: { id: number; ticketNumber: string | null; status: string | null };
}

/** The order a link names (an `order` link, or a `tracking` link that resolved to one). */
export interface TaskLinkOrder {
  /** `orders.id` of the first line. */
  id: number;
  orderNumber: string | null;
  /** How many `orders` rows (lines) carry this order number. */
  lineCount: number;
  /** First line's product title — the order read in one phrase. */
  title: string | null;
  sku: string | null;
}

/** One full link, as the evidence column reads it. */
export interface TaskLink {
  id: number;
  taskId: number;
  kind: TaskLinkKind;
  entityId: number | null;
  label: string;
  createdAt: string;
  createdBy: { id: number; name: string } | null;
  order: TaskLinkOrder | null;
  /** `tracking` links only — the carrier fact `shipping_tracking_numbers` holds. */
  tracking: { carrier: string | null; status: string | null } | null;
  /** `ticket` links only — local caches, never a live helpdesk read. */
  ticket: { providerTicketId: number | null; subject: string | null; status: string | null } | null;
  /** `repair` links only — the `repair_service` row (`entityId` is its id; `label` is `RS-<id>`). */
  repair: TaskLinkRepair | null;
}

/** The repair a `repair` link names. */
export interface TaskLinkRepair {
  /** `repair_service.id` — the `RS-<id>` an operator quotes. */
  id: number;
  /** `repair_service.ticket_number` — the helpdesk number on the paperwork, when stamped. */
  ticketNumber: string | null;
  status: string | null;
  /** `repair_service.product_title` — the device read in one phrase. */
  title: string | null;
}

/** A repair's door: the Repair desk opens it on `?openRepair=` (`RepairCardList.tsx`); the phone at `/m/rs/<id>`. */
export function taskLinkRepairHref(repairId: number, surface: 'desk' | 'phone'): string {
  return surface === 'phone' ? `/m/rs/${repairId}` : `/repair?openRepair=${repairId}`;
}

export interface TaskLinksPayload {
  ok: true;
  links: TaskLink[];
}

/** `POST /api/tasks/[id]/links` body. */
export type TaskLinkCreateBody =
  | { kind: 'order'; entityId: number }
  | { kind: 'ticket'; value: string }
  | { kind: 'tracking'; value: string }
  /** `RS-74`, `rs74`, or the repair's ticket number (`#48120` / `48120`). */
  | { kind: 'repair'; value: string };

/** Refusals the link route returns, in words an operator can act on. */
export const TASK_LINK_REFUSAL_COPY: Readonly<Record<string, string>> = {
  task_not_found: 'That task no longer exists.',
  order_not_found: 'No order with that id in this organization.',
  invalid_tracking: 'That is not a tracking number.',
  invalid_number: 'A ticket is a number — 48120, or #48120.',
  not_found: 'No ticket with that number, here or on the helpdesk.',
  repair_not_found: 'No repair with that number — try RS-74 or the repair’s ticket number.',
  repair_ambiguous: 'Several repairs carry that ticket number. Link it by its RS- number.',
  helpdesk_unavailable: 'The helpdesk did not answer. Try again in a moment.',
  anchor_duplicate: 'That record is already what this task is about.',
};

/** `GET /api/tasks/[id]/media` — photos and ready videos on one task, oldest first. */
export interface TaskMediaPhoto {
  id: number;
  url: string;
  thumbUrl: string;
  createdAt: string;
}

export interface TaskMediaVideo {
  id: number;
  url: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  /** Who uploaded it — null once their staff row is gone. */
  createdBy: { id: number; name: string } | null;
}

export interface TaskMediaPayload {
  ok: true;
  photos: TaskMediaPhoto[];
  videos: TaskMediaVideo[];
  /** Photos / videos attached by URL (YouTube, Vimeo, Loom, Drive, a hosted file). */
  links: TaskMediaLink[];
}

/** The photo-platform entity a task's media hangs off (`PHOTO_ENTITY_TYPES`). */
export const TASK_MEDIA_ENTITY_TYPE = 'WORK_ASSIGNMENT' as const;
