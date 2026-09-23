'use client';

/**
 * Activity inbox — session-scoped “recent reversible actions”.
 * Complements Operations Log (audit trail); inbox is ephemeral UI +
 * quick undo within a short TTL.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useIdleReady } from '@/hooks/useIdleReady';
import { getInboxChannelName, safeChannelName } from '@/lib/realtime/channels';
import { toast } from '@/lib/toast';
import {
  INBOX_ENTITY_NOUN,
  notifiableEvent,
  type InboxEntityType,
} from '@/lib/notifications/event-vocabulary';

const MAX_ITEMS = 20;
/** Time window during which Undo is offered for reversible items */
export const ACTIVITY_INBOX_UNDO_MS = 60_000;

export type ActivityInboxItemKind =
  | 'repair_status'
  | 'priority_unbox'
  | 'warranty_claim'
  | 'return_pending_test'
  | 'order_ready_ship'
  | 'support_followup'
  | 'staff_message'
  /** A colleague handed you a record (WS-TASKS). Mirrors staff_inbox_items. */
  | 'work_task';

export interface ActivityInboxItem {
  id: string;
  kind: ActivityInboxItemKind;
  title: string;
  subtitle: string;
  createdAt: number;
  undoUntil: number;
  repairId?: number;
  previousStatus?: string;
  nextStatus?: string;
  undone?: boolean;
  undoFailed?: boolean;
  // priority_unbox
  sku?: string;
  trackingNumber?: string;
  receivingId?: number;
  // tech-queue (return_pending_test / order_ready_ship) deep-link + detail
  lineId?: number;
  orderNumber?: string;
  /**
   * Raw platform key (`source_platform` / pill / inbound type — same ladder
   * as {@link listTechQueueItemsForStaff}'s `sourcePlatform`), so the
   * popover's `OrderIdChip` paints the same platform icon/color/tooltip the
   * carton-context peek does instead of the flat unstyled fallback.
   */
  sourcePlatform?: string;
  productTitle?: string;
  // work_task — the durable row lives in staff_inbox_items; this is its mirror,
  // so `inboxItemId` is what a triage verb would act on.
  inboxItemId?: number;
  entityType?: string;
  entityId?: number;
  urgent?: boolean;
  // warranty_claim
  claimId?: number;
  claimNumber?: string;
  claimStatus?: string;
  // staff_message
  messageId?: number;
  senderName?: string;
  /** Raw copied text — used for the "copy back" affordance in the popover. */
  body?: string;
  // support_followup (in-website Zendesk ticket assignment)
  ticketId?: number;
  ticketSubject?: string;
  assignedStaffId?: number;
  assignedStaffName?: string;
  assignedByStaffId?: number | null;
  assignedByStaffName?: string | null;
}

const WARRANTY_EVENT_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  approved: 'Approved',
  denied: 'Denied',
  in_repair: 'In repair',
  repair_logged: 'Repair logged',
  repaired: 'Repaired',
  closed: 'Closed',
  expired: 'Expired',
};

type PushRepairStatusArgs = {
  repairId: number;
  displayCode?: string;
  previousStatus: string | null | undefined;
  nextStatus: string;
};

type PushPriorityUnboxArgs = {
  skus: string[];
  trackingNumber?: string | null;
  receivingId?: number | null;
};

type PushWorkTaskArgs = {
  /** staff_inbox_items.id — the durable row this mirrors, and the dedupe key. */
  inboxItemId: number;
  entityType: string;
  entityId: number;
  note?: string | null;
  urgent?: boolean;
  actorName?: string | null;
};

type PushWarrantyClaimArgs = {
  claimId: number;
  claimNumber: string;
  status: string;
  event: string;
  title?: string | null;
};

interface ActivityInboxContextValue {
  items: ActivityInboxItem[];
  /** Id of inbox row currently executing undo (if any). */
  pendingUndoId: string | null;
  pushRepairStatusChange: (args: PushRepairStatusArgs) => void;
  pushPriorityUnbox: (args: PushPriorityUnboxArgs) => void;
  pushWarrantyClaim: (args: PushWarrantyClaimArgs) => void;
  undoItem: (id: string) => Promise<void>;
  dismissItem: (id: string) => void;
  /** Mark a received staff message read (clears it from the bell). */
  markStaffMessageRead: (messageId: number) => Promise<void>;
  clear: () => void;
}

const ActivityInboxContext = createContext<ActivityInboxContextValue | null>(
  null,
);

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ActivityInboxProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ActivityInboxItem[]>([]);
  // Derive-live tech-station backlog (unboxed returns awaiting test + orders
  // ready to ship). Kept separate from the ephemeral push items so a refetch
  // replaces it wholesale without wiping repair/warranty/priority-unbox toasts.
  const [techQueueItems, setTechQueueItems] = useState<ActivityInboxItem[]>([]);
  // In-website Zendesk ticket assignments (support_ticket_assignments). Seeded on
  // mount and refetched when a support_assignment staff_message push lands.
  const [supportFollowupItems, setSupportFollowupItems] = useState<ActivityInboxItem[]>([]);
  // Persisted staff-to-staff messages (clipboard "send to staff"). Like the
  // tech backlog, seeded from the DB on mount and refetched on each push so it
  // survives reload — these are the first inbox items with a durable source.
  const [staffMessageItems, setStaffMessageItems] = useState<ActivityInboxItem[]>([]);
  const [pendingUndoId, setPendingUndoId] = useState<string | null>(null);
  /** After "Clear all", ignore stale in-flight refreshes until a new realtime push. */
  const inboxSuppressedRef = useRef(false);
  const inboxFetchGenRef = useRef(0);
  // Seed fetches (tech queue / support followups / staff messages) are not
  // first-paint critical — defer them past idle so they never compete with the
  // route's own data for main-thread + connection time. Realtime pushes still
  // trigger the refresh callbacks directly whenever they land.
  const idleReady = useIdleReady();

  useEffect(() => {
    if (!user) {
      setItems([]);
      setTechQueueItems([]);
      setSupportFollowupItems([]);
      setStaffMessageItems([]);
    }
  }, [user]);

  // Tech-station inbox: seed the backlog from the DB on mount and refetch on
  // each push (the publishers fan out to primary techs only; non-techs get an
  // empty queue server-side). Survives reload, shows the true backlog.
  const refreshTechQueue = useCallback(async () => {
    if (inboxSuppressedRef.current) return;
    if (!user?.staffId) {
      setTechQueueItems([]);
      return;
    }
    const fetchGen = inboxFetchGenRef.current;
    try {
      const res = await fetch('/api/inbox/tech-queue');
      if (!res.ok || fetchGen !== inboxFetchGenRef.current || inboxSuppressedRef.current) return;
      const data = (await res.json()) as {
        items?: Array<{
          kind: ActivityInboxItemKind;
          receivingId: number;
          lineId: number | null;
          trackingNumber: string | null;
          orderNumber: string | null;
          sourcePlatform: string | null;
          productTitle: string | null;
          unboxedAt: string | null;
        }>;
      };
      const mapped: ActivityInboxItem[] = (data.items ?? []).map((it) => {
        const ms = it.unboxedAt ? new Date(it.unboxedAt).getTime() : Date.now();
        const isReturn = it.kind === 'return_pending_test';
        return {
          id: `techq-${it.kind}-${it.receivingId}`,
          kind: it.kind,
          title: isReturn ? 'Return · needs testing' : 'Order · ready to ship',
          subtitle: it.trackingNumber
            ? `${isReturn ? 'Unboxed return' : 'Unboxed · pending order'} · ${truncateLabel(it.trackingNumber, 40)}`
            : isReturn
              ? 'Unboxed return awaiting test'
              : 'Unboxed — pending order ready to ship',
          createdAt: Number.isFinite(ms) ? ms : Date.now(),
          undoUntil: 0, // backlog items are not reversible
          receivingId: it.receivingId,
          lineId: it.lineId ?? undefined,
          trackingNumber: it.trackingNumber ?? undefined,
          orderNumber: it.orderNumber ?? undefined,
          sourcePlatform: it.sourcePlatform ?? undefined,
          productTitle: it.productTitle ?? undefined,
        };
      });
      if (fetchGen !== inboxFetchGenRef.current || inboxSuppressedRef.current) return;
      setTechQueueItems(mapped);
    } catch {
      /* best-effort — next push or reload retries */
    }
  }, [user?.staffId]);

  useEffect(() => {
    if (!idleReady) return;
    void refreshTechQueue();
  }, [idleReady, refreshTechQueue]);

  const refreshSupportFollowups = useCallback(async () => {
    if (inboxSuppressedRef.current) return;
    if (!user?.staffId) {
      setSupportFollowupItems([]);
      return;
    }
    const fetchGen = inboxFetchGenRef.current;
    try {
      const res = await fetch('/api/inbox/support');
      if (!res.ok || fetchGen !== inboxFetchGenRef.current || inboxSuppressedRef.current) return;
      const data = (await res.json()) as {
        items?: Array<{
          ticketId: number;
          subject: string | null;
          assignedStaffId: number;
          assignedStaffName: string;
          assignedByStaffId: number | null;
          assignedByStaffName: string | null;
          updatedAtMs: number;
        }>;
      };
      const mapped: ActivityInboxItem[] = (data.items ?? []).map((it) => ({
        id: `support-${it.ticketId}`,
        kind: 'support_followup' as const,
        title: it.subject?.trim() || `Ticket #${it.ticketId}`,
        subtitle: `Follow up · assigned to ${it.assignedStaffName}`,
        createdAt: Number.isFinite(it.updatedAtMs) ? it.updatedAtMs : Date.now(),
        undoUntil: 0,
        ticketId: it.ticketId,
        ticketSubject: it.subject ?? undefined,
        assignedStaffId: it.assignedStaffId,
        assignedStaffName: it.assignedStaffName,
        assignedByStaffId: it.assignedByStaffId,
        assignedByStaffName: it.assignedByStaffName,
      }));
      if (fetchGen !== inboxFetchGenRef.current || inboxSuppressedRef.current) return;
      setSupportFollowupItems(mapped);
    } catch {
      /* best-effort — next push or reload retries */
    }
  }, [user?.staffId]);

  useEffect(() => {
    if (!idleReady) return;
    void refreshSupportFollowups();
  }, [idleReady, refreshSupportFollowups]);

  // Persisted unread staff messages. Seeded on mount and refetched whenever a
  // staff_message push lands (authoritative read model, like the tech queue).
  const refreshStaffMessages = useCallback(async () => {
    if (inboxSuppressedRef.current) return;
    if (!user?.staffId) {
      setStaffMessageItems([]);
      return;
    }
    const fetchGen = inboxFetchGenRef.current;
    try {
      const res = await fetch('/api/staff-messages?unread=1', { cache: 'no-store' });
      if (!res.ok || fetchGen !== inboxFetchGenRef.current || inboxSuppressedRef.current) return;
      const data = (await res.json()) as {
        items?: Array<{
          id: number;
          senderName: string;
          body: string;
          kind: string;
          context: Record<string, unknown> | null;
          createdAtMs: number;
        }>;
      };
      const mapped: ActivityInboxItem[] = (data.items ?? [])
        .filter((m) => m.kind !== 'support_assignment')
        .map((m) => {
        const ctx = m.context ?? {};
        const sellerMessageId =
          typeof ctx.sellerMessageId === 'number' ? ctx.sellerMessageId : null;
        if (m.kind === 'seller_claim_message' && sellerMessageId) {
          return {
            id: `msg-${m.id}`,
            kind: 'staff_message' as const,
            title: `Seller msg #${sellerMessageId}`,
            subtitle: `From ${truncateLabel(m.senderName, 32)} · copy for full text`,
            createdAt: Number.isFinite(m.createdAtMs) ? m.createdAtMs : Date.now(),
            undoUntil: 0, // not reversible
            messageId: m.id,
            senderName: m.senderName,
            body: m.body,
          };
        }
        return {
          id: `msg-${m.id}`,
          kind: 'staff_message' as const,
          title: `Message · ${truncateLabel(m.senderName, 32)}`,
          subtitle: m.body,
          createdAt: Number.isFinite(m.createdAtMs) ? m.createdAtMs : Date.now(),
          undoUntil: 0, // not reversible
          messageId: m.id,
          senderName: m.senderName,
          body: m.body,
        };
      });
      if (fetchGen !== inboxFetchGenRef.current || inboxSuppressedRef.current) return;
      setStaffMessageItems(mapped);
      // Deliberately does NOT chain `refreshSupportFollowups()`. It used to, and
      // that made `/api/inbox/support` fetch twice on every load — once from its
      // own idle effect, once again 6ms after this response landed, serially
      // behind it. Support assignments are already covered from both ends: the
      // idle effect seeds them on mount, and the `staff_message` Ably handler
      // below routes `kind === 'support_assignment'` straight to
      // `refreshSupportFollowups` (which is why THIS mapper filters that kind
      // out). Re-adding the chain re-adds the duplicate request.
    } catch {
      /* best-effort — next push or reload retries */
    }
  }, [user?.staffId]);

  useEffect(() => {
    if (!idleReady) return;
    void refreshStaffMessages();
  }, [idleReady, refreshStaffMessages]);

  const pushRepairStatusChange = useCallback(
    ({
      repairId,
      displayCode,
      previousStatus,
      nextStatus,
    }: PushRepairStatusArgs) => {
      if (!user) return;
      const prev =
        typeof previousStatus === 'string' ? previousStatus : '';
      if (prev === nextStatus) return;

      const now = Date.now();
      const label = displayCode ?? `RS-${repairId}`;
      const item: ActivityInboxItem = {
        id: newId(),
        kind: 'repair_status',
        title: `Repair · ${label}`,
        subtitle: `Status · ${truncateLabel(prev || '(none)')} → ${truncateLabel(nextStatus)}`,
        createdAt: now,
        undoUntil: now + ACTIVITY_INBOX_UNDO_MS,
        repairId,
        previousStatus: prev,
        nextStatus,
      };

      setItems((prevItems) => [item, ...prevItems].slice(0, MAX_ITEMS));
    },
    [user],
  );

  const pushPriorityUnbox = useCallback(
    ({ skus, trackingNumber, receivingId }: PushPriorityUnboxArgs) => {
      if (!user) return;
      const cleanSkus = (skus ?? []).filter(
        (s) => typeof s === 'string' && s.trim().length > 0,
      );
      if (cleanSkus.length === 0) return;

      const now = Date.now();
      const skuLabel =
        cleanSkus.length === 1
          ? cleanSkus[0]
          : `${cleanSkus[0]} +${cleanSkus.length - 1}`;
      const item: ActivityInboxItem = {
        id: newId(),
        kind: 'priority_unbox',
        title: `Unbox first · ${truncateLabel(skuLabel, 40)}`,
        subtitle: trackingNumber
          ? `On a pending order · ${truncateLabel(trackingNumber, 40)}`
          : 'On a pending order — unbox this one first',
        createdAt: now,
        undoUntil: now, // alerts aren't reversible
        sku: cleanSkus[0],
        trackingNumber: trackingNumber ?? undefined,
        receivingId: receivingId ?? undefined,
      };

      setItems((prevItems) => [item, ...prevItems].slice(0, MAX_ITEMS));
    },
    [user],
  );

  /**
   * A colleague handed you a record.
   *
   * The durable row is already in `staff_inbox_items` before this fires — this
   * is the live mirror, so a dropped Ably message costs latency and nothing
   * else (the row still arrives on the next Home Inbox fetch). Deduped on
   * `inboxItemId` because the same push can arrive on two tabs, and this list
   * is per-session client state with no unique index behind it.
   */
  const pushWorkTask = useCallback(
    ({ inboxItemId, entityType, entityId, note, urgent, actorName }: PushWorkTaskArgs) => {
      if (!user) return;
      if (!Number.isFinite(inboxItemId) || inboxItemId <= 0) return;

      const now = Date.now();
      const who = actorName ? truncateLabel(actorName, 24) : 'A teammate';
      const item: ActivityInboxItem = {
        id: newId(),
        kind: 'work_task',
        // Urgency leads the title — at a bench this row is read at a glance and
        // the operator's first question is whether it jumps the queue.
        title: urgent ? `Urgent · ${who} handed you this` : `${who} handed you this`,
        // ONE fact, per the compact activity row contract: the note when there
        // is one, else the record it points at.
        subtitle: note ? truncateLabel(note, 60) : entityLabelFor(entityType, entityId),
        createdAt: now,
        undoUntil: now, // a handoff is not reversible by the recipient
        inboxItemId,
        entityType,
        entityId,
        urgent,
      };

      setItems((prevItems) =>
        prevItems.some((p) => p.inboxItemId === inboxItemId)
          ? prevItems
          : [item, ...prevItems].slice(0, MAX_ITEMS),
      );
    },
    [user],
  );

  const pushWarrantyClaim = useCallback(
    ({ claimId, claimNumber, status, event, title }: PushWarrantyClaimArgs) => {
      if (!user) return;
      if (!claimId || !claimNumber) return;
      const now = Date.now();
      const eventLabel = WARRANTY_EVENT_LABEL[event] ?? truncateLabel(event, 24);
      const item: ActivityInboxItem = {
        id: newId(),
        kind: 'warranty_claim',
        title: `Warranty · ${truncateLabel(claimNumber, 40)}`,
        subtitle: title
          ? `${eventLabel} · ${truncateLabel(title, 40)}`
          : eventLabel,
        createdAt: now,
        undoUntil: now, // not reversible from the inbox
        claimId,
        claimNumber,
        claimStatus: status,
      };
      setItems((prevItems) => [item, ...prevItems].slice(0, MAX_ITEMS));
    },
    [user],
  );

  // Receiving-door scans that hit a pending order are pushed to inbox:{staffId}
  // server-side; mirror them into the inbox wherever this staff is signed in.
  const inboxChannel = safeChannelName(() =>
    getInboxChannelName(user?.organizationId!, user?.staffId ?? 'none'),
  );
  const inboxEnabled = !!inboxChannel && Boolean(user?.staffId);
  useAblyChannel(
    inboxChannel,
    'priority_unbox',
    (msg: { data?: { skus?: unknown; trackingNumber?: unknown; receivingId?: unknown } }) => {
      inboxSuppressedRef.current = false;
      const d = msg?.data ?? {};
      pushPriorityUnbox({
        skus: Array.isArray(d.skus) ? (d.skus as string[]) : [],
        trackingNumber: typeof d.trackingNumber === 'string' ? d.trackingNumber : null,
        receivingId: typeof d.receivingId === 'number' ? d.receivingId : null,
      });
    },
    inboxEnabled,
  );

  // Both kinds of durable staff_inbox_items row arrive on this one event name.
  //
  // A colleague handed this staffer a record (WS-TASKS). The durable row is
  // already in staff_inbox_items — this is the live mirror that makes a bench
  // handoff land now instead of on the next window focus.
  //
  // A WATCHED DOMAIN EVENT (a carton this staffer follows scanned in at the
  // door) is NOT mirrored into `items`: that array is session-scoped, carries
  // an undo TTL, and `clear()` wipes it — a durable ledger row must not live
  // under those semantics. The push only invalidates the inbox query the
  // popover reads, so the server list stays the one source of those rows.
  useAblyChannel(
    inboxChannel,
    'inbox_item',
    (msg: {
      data?: {
        itemId?: unknown;
        entityType?: unknown;
        entityId?: unknown;
        eventKey?: unknown;
        note?: unknown;
        urgent?: unknown;
        actorName?: unknown;
      };
    }) => {
      const d = msg?.data ?? {};
      if (typeof d.eventKey === 'string' && notifiableEvent(d.eventKey)) {
        void queryClient.invalidateQueries({ queryKey: ['api-inbox'] });
        return;
      }
      // The channel carries every inbox push; render only the assignment kind
      // here. A future event on this name must opt in explicitly rather than
      // inherit this row's copy.
      if (d.eventKey !== 'work_task.assigned') return;

      inboxSuppressedRef.current = false;
      const itemId = Number(d.itemId);
      const entityId = Number(d.entityId);
      if (!Number.isFinite(itemId) || !Number.isFinite(entityId)) return;

      pushWorkTask({
        inboxItemId: itemId,
        entityType: typeof d.entityType === 'string' ? d.entityType : 'other',
        entityId,
        note: typeof d.note === 'string' ? d.note : null,
        urgent: d.urgent === true,
        actorName: typeof d.actorName === 'string' ? d.actorName : null,
      });
    },
    inboxEnabled,
  );

  // Warranty claim status changes for claims this staff logged.
  useAblyChannel(
    inboxChannel,
    'warranty_claim',
    (msg: { data?: { claimId?: unknown; claimNumber?: unknown; status?: unknown; event?: unknown; title?: unknown } }) => {
      inboxSuppressedRef.current = false;
      const d = msg?.data ?? {};
      const claimId = typeof d.claimId === 'number' ? d.claimId : Number(d.claimId);
      if (!Number.isFinite(claimId) || claimId <= 0) return;
      pushWarrantyClaim({
        claimId,
        claimNumber: typeof d.claimNumber === 'string' ? d.claimNumber : String(d.claimNumber ?? ''),
        status: typeof d.status === 'string' ? d.status : '',
        event: typeof d.event === 'string' ? d.event : '',
        title: typeof d.title === 'string' ? d.title : null,
      });
    },
    inboxEnabled,
  );

  // Tech-station backlog nudges — fan-out reaches primary techs only. Either
  // event just means "your queue changed", so refetch the authoritative list.
  useAblyChannel(inboxChannel, 'return_pending_test', () => {
    inboxSuppressedRef.current = false;
    void refreshTechQueue();
  }, inboxEnabled);
  useAblyChannel(inboxChannel, 'order_ready_ship', () => {
    inboxSuppressedRef.current = false;
    void refreshTechQueue();
  }, inboxEnabled);

  // Direct staff-to-staff messages (clipboard "send to staff"). Toast the
  // arrival, then refetch the authoritative unread list for the bell.
  useAblyChannel(
    inboxChannel,
    'staff_message',
    (msg: { data?: { senderName?: unknown; kind?: unknown } }) => {
      inboxSuppressedRef.current = false;
      const sender = typeof msg?.data?.senderName === 'string' ? msg.data.senderName : 'A teammate';
      const kind = typeof msg?.data?.kind === 'string' ? msg.data.kind : '';
      if (kind === 'support_assignment') {
        toast.success('Support ticket assigned to you');
        void refreshSupportFollowups();
      } else {
        toast.success(`New message from ${sender}`);
        void refreshStaffMessages();
      }
    },
    inboxEnabled,
  );

  const undoItem = useCallback(
    async (id: string) => {
      const item = items.find((x) => x.id === id);
      if (
        !item ||
        item.kind !== 'repair_status' ||
        item.undone ||
        !item.repairId ||
        item.previousStatus === undefined
      ) {
        return;
      }
      if (Date.now() > item.undoUntil) {
        toast.error('Undo window expired');
        return;
      }

      setPendingUndoId(id);
      try {
        const res = await fetch('/api/repair-service', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.repairId,
            status: item.previousStatus,
          }),
        });
        if (!res.ok) {
          throw new Error('Request failed');
        }
        toast.success('Change reverted');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.repairs.all }),
          queryClient.invalidateQueries({
            queryKey: ['repair', item.repairId],
          }),
        ]);
        setItems((prevItems) =>
          prevItems.map((x) =>
            x.id === id ? { ...x, undone: true } : x,
          ),
        );
      } catch {
        toast.error('Could not undo');
        setItems((prevItems) =>
          prevItems.map((x) =>
            x.id === id ? { ...x, undoFailed: true } : x,
          ),
        );
      } finally {
        setPendingUndoId(null);
      }
    },
    [items, queryClient],
  );

  // Mark a received staff message read on the server and drop it locally.
  const markStaffMessageRead = useCallback(async (messageId: number) => {
    setStaffMessageItems((prev) => prev.filter((x) => x.messageId !== messageId));
    try {
      await fetch('/api/staff-messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', id: messageId }),
      });
    } catch {
      /* best-effort — reload re-fetches the true unread set */
    }
  }, []);

  const dismissItem = useCallback(
    (id: string) => {
      const msg = staffMessageItems.find((x) => x.id === id);
      if (msg?.messageId != null) {
        void markStaffMessageRead(msg.messageId);
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== id));
      setTechQueueItems((prev) => prev.filter((x) => x.id !== id));
      setSupportFollowupItems((prev) => prev.filter((x) => x.id !== id));
    },
    [staffMessageItems, markStaffMessageRead],
  );

  const clear = useCallback(() => {
    inboxSuppressedRef.current = true;
    inboxFetchGenRef.current += 1;
    setItems([]);
    setTechQueueItems([]);
    setSupportFollowupItems([]);
    setStaffMessageItems([]);
    // Persisted messages must be marked read or they'd reappear on reload.
    void fetch('/api/staff-messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    }).catch(() => {});
  }, []);

  // Ephemeral push items + the derive-live tech backlog + persisted unread
  // staff messages, newest first.
  const mergedItems = useMemo(
    () =>
      [...items, ...techQueueItems, ...supportFollowupItems, ...staffMessageItems]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_ITEMS),
    [items, techQueueItems, supportFollowupItems, staffMessageItems],
  );

  const value = useMemo<ActivityInboxContextValue>(
    () => ({
      items: mergedItems,
      pendingUndoId,
      pushRepairStatusChange,
      pushPriorityUnbox,
      pushWarrantyClaim,
      undoItem,
      dismissItem,
      markStaffMessageRead,
      clear,
    }),
    [
      mergedItems,
      pendingUndoId,
      pushRepairStatusChange,
      pushPriorityUnbox,
      pushWarrantyClaim,
      undoItem,
      dismissItem,
      markStaffMessageRead,
      clear,
    ],
  );

  return (
    <ActivityInboxContext.Provider value={value}>
      {children}
      {/* Reactive tick so undo badges expire without user interaction */}
      <InboxTTLWatcher items={items} />
    </ActivityInboxContext.Provider>
  );
}

/**
 * The one scannable fact for a handed-over record when the thrower left no
 * note. Deliberately a short noun + id rather than a chip parade — this face is
 * the compact activity row (`CompactActivityRow` + `RailRowBody`), which allows
 * exactly one meta fact.
 *
 * The noun comes from {@link INBOX_ENTITY_NOUN}, shared with the durable ledger
 * row below it: the live mirror and the row it mirrors must not spell the same
 * record two ways.
 */
function entityLabelFor(entityType: string, entityId: number): string {
  return `${INBOX_ENTITY_NOUN[entityType as InboxEntityType] ?? 'Record'} ${entityId}`;
}

function truncateLabel(s: string, max = 52): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function InboxTTLWatcher({ items }: { items: ActivityInboxItem[] }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const hasActiveUndo = items.some(
      (i) =>
        !i.undone &&
        !i.undoFailed &&
        Date.now() < i.undoUntil,
    );
    if (!hasActiveUndo) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [items]);
  return null;
}

export function useActivityInbox(): ActivityInboxContextValue {
  const ctx = useContext(ActivityInboxContext);
  if (!ctx) {
    throw new Error('useActivityInbox must be used within ActivityInboxProvider');
  }
  return ctx;
}

/** Safe for optional UI — returns no-ops when provider missing (tests / storybook). */
export function useActivityInboxOptional(): ActivityInboxContextValue | null {
  return useContext(ActivityInboxContext);
}
