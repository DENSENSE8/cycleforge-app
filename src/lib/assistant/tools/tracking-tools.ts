/**
 * Tracking in chat (chat-roi row 12):
 *
 *  - get_tracking_status (GREEN) — live carrier status for a tracking number
 *    this workspace already knows: `syncShipment` refreshes it from UPS /
 *    FedEx / USPS (bounded; a slow carrier never holds the answer), then
 *    `getShipmentEvents` is the timeline. An unknown number is NOT created —
 *    the answer says so and offers a watch.
 *  - watch_tracking (a write, so Ask only refuses it) — "tell me when it
 *    arrives" / "stop watching", for the REQUESTING staff member only, via
 *    `setTrackingWatch`: the same row the Today Watch rail writes, so it shows
 *    in the existing watcher list. Self-scoped and reversible → no
 *    confirmation turn.
 */

import { z } from 'zod';
import pool from '@/lib/db';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { brandReportEnvelope, type ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactTimeline } from '@/lib/assistant/ui-artifacts';
import { isHomeInbox } from '@/lib/feature-flags';
import { setTrackingWatch } from '@/lib/notifications/tracking-watch';
import { getShipmentById, getShipmentByTracking, getShipmentEvents } from '@/lib/shipping/repository';
import { syncShipment } from '@/lib/shipping/sync-shipment';
import type { ShipmentRow, TrackingEventRow } from '@/lib/shipping/types';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import type { OrgId } from '@/lib/tenancy/constants';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';
import type { AssistantToolDef, AssistantToolDeps } from './types';

/** How long the answer waits on the carrier before showing what is stored. */
export const CARRIER_SYNC_BUDGET_MS = 6000;

// ─── Pure shaping ────────────────────────────────────────────────────────────

export interface TrackingLink {
  /** "Order 21-15107-47310" / "Receiving #53219". */
  label: string;
}

export interface TrackingStatusInput {
  shipment: Pick<
    ShipmentRow,
    | 'tracking_number_raw'
    | 'tracking_number_normalized'
    | 'carrier'
    | 'latest_status_label'
    | 'latest_status_description'
    | 'latest_status_category'
    | 'delivered_at'
    | 'latest_event_at'
    | 'is_delivered'
  >;
  events: ReadonlyArray<
    Pick<
      TrackingEventRow,
      | 'event_occurred_at'
      | 'event_recorded_at'
      | 'external_status_label'
      | 'external_status_description'
      | 'normalized_status_category'
      | 'event_city'
      | 'event_state'
      | 'event_country_code'
      | 'signed_by'
      | 'exception_description'
    >
  >;
  links: readonly TrackingLink[];
  /** Why the live refresh did not run or failed; null = refreshed. */
  syncNote: string | null;
  watching: boolean;
}

function when(iso: string | null): string {
  if (!iso) return 'Time unknown';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso.slice(0, 40)
    : new Intl.DateTimeFormat('en-US', { timeZone: WAREHOUSE_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function sentenceCase(s: string): string {
  const t = s.replace(/_/g, ' ').trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

export function buildTrackingEnvelope(input: TrackingStatusInput): ToolArtifactEnvelope {
  const s = input.shipment;
  const tracking = s.tracking_number_raw || s.tracking_number_normalized;
  const status =
    s.latest_status_label?.trim() ||
    (s.latest_status_category ? sentenceCase(s.latest_status_category) : 'No carrier status yet');
  const items: ArtifactTimeline['items'] = input.events.slice(0, 200).map((e) => {
    const place = [e.event_city, e.event_state, e.event_country_code && e.event_country_code !== 'US' ? e.event_country_code : null]
      .filter(Boolean)
      .join(', ');
    const detail = [e.external_status_description, e.exception_description, e.signed_by ? `Signed by ${e.signed_by}` : null]
      .filter((x): x is string => Boolean(x && x.trim()))
      .filter((x, i, all) => all.indexOf(x) === i && x !== e.external_status_label)
      .join(' · ');
    return {
      at: when(e.event_occurred_at ?? e.event_recorded_at).slice(0, 40),
      actor: place ? place.slice(0, 80) : null,
      action: (e.external_status_label?.trim() || sentenceCase(e.normalized_status_category) || 'Update').slice(0, 120),
      detail: detail ? detail.slice(0, 400) : null,
    };
  });
  const linked = input.links.map((l) => l.label).join(', ');
  const artifact: ArtifactTimeline = {
    kind: 'timeline',
    title: `${s.carrier} ${tracking}`.slice(0, 120),
    subject: [status, linked].filter(Boolean).join(' · ').slice(0, 120),
    items,
  };
  const latest = input.events[0];
  const lastSeen = latest
    ? ` Last scan ${when(latest.event_occurred_at ?? latest.event_recorded_at)}${latest.event_city ? ` in ${[latest.event_city, latest.event_state].filter(Boolean).join(', ')}` : ''}.`
    : '';
  const delivered = s.is_delivered && s.delivered_at ? ` Delivered ${when(s.delivered_at)}.` : '';
  const answer =
    `${s.carrier} ${tracking}${linked ? ` (${linked})` : ''}: ${status}.${delivered || lastSeen}` +
    `${input.syncNote ? ` ${input.syncNote}` : ''}${input.watching ? ' You are watching it.' : ''}`;
  return brandReportEnvelope(
    {
      artifact,
      summary: `${answer} ${items.length} carrier events are on screen as a timeline — do not render them again.${input.watching ? '' : ' Offer to watch it if it has not arrived.'}`,
      answer,
    },
    'get_tracking_status',
  );
}

// ─── get_tracking_status ─────────────────────────────────────────────────────

/** What the number belongs to here, and whether the requester already watches it. */
const LINKS_SQL = `SELECT
  (SELECT string_agg(DISTINCT o.order_id, ', ') FROM orders o
    WHERE o.organization_id = $1 AND o.shipment_id = $2) AS orders,
  (SELECT string_agg(DISTINCT r.id::text, ', ') FROM receiving_carton r
    WHERE r.organization_id = $1 AND r.shipment_id = $2) AS cartons,
  EXISTS (
    SELECT 1 FROM staff_subscriptions ss
     WHERE ss.organization_id = $1 AND ss.staff_id = $3 AND ss.state = 'subscribed'
       AND ((ss.subscription_kind = 'rule' AND ss.match_tracking_normalized = $4)
         OR (ss.subscription_kind = 'entity' AND ss.entity_type = 'receiving'
             AND ss.entity_id IN (SELECT r.id FROM receiving_carton r WHERE r.organization_id = $1 AND r.shipment_id = $2)))
  ) AS watching`;

async function withBudget<T>(work: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const trackingInput = z.object({
  tracking: z.string().trim().min(6).max(64).describe('The tracking number exactly as typed.'),
});

export const getTrackingStatus: AssistantToolDef<typeof trackingInput> = {
  name: 'get_tracking_status',
  description:
    'LIVE carrier status of a tracking number (UPS / FedEx / USPS): refreshes from the carrier and shows the scan timeline, what order or carton it belongs to, and whether you are watching it. Use for "where is my package 1Z…", "has tracking X been delivered", "carrier status of …".',
  permission: 'orders.view',
  inputSchema: trackingInput,
  run: async (input, ctx, deps: AssistantToolDeps) => {
    const org = ctx.organizationId;
    const canonical = extractCanonicalTracking(input.tracking) || input.tracking.trim();
    const known = await getShipmentByTracking(canonical, org);
    if (!known) {
      return {
        found: false,
        tracking: canonical,
        message: `Tracking ${canonical} is not in this workspace yet, so there is no carrier history here. I can watch it and tell you when it arrives.`,
      };
    }
    let syncNote: string | null = null;
    // The carrier call can take the whole 6 s budget: no batch connection may wait on it.
    await deps.releaseBatch?.();
    const synced = await withBudget(syncShipment({ shipmentId: known.id }, org), CARRIER_SYNC_BUDGET_MS).catch(
      (err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }),
    );
    if (synced === 'timeout') syncNote = 'The carrier did not answer in time; this is the last stored status.';
    else if (!synced.ok) syncNote = 'The carrier refresh failed; this is the last stored status.';
    const [shipment, events, links] = await Promise.all([
      getShipmentById(known.id, org),
      getShipmentEvents(known.id, org),
      deps.query(org, LINKS_SQL, [org, known.id, ctx.staffId ?? 0, canonical]),
    ]);
    const row = links.rows[0] ?? {};
    const labels: TrackingLink[] = [
      ...(row.orders ? String(row.orders).split(', ').map((o) => ({ label: `Order ${o}` })) : []),
      ...(row.cartons ? String(row.cartons).split(', ').map((c) => ({ label: `Receiving #${c}` })) : []),
    ];
    return buildTrackingEnvelope({
      shipment: shipment ?? known,
      events,
      links: labels.slice(0, 4),
      syncNote,
      watching: row.watching === true,
    });
  },
};

// ─── watch_tracking (write) ──────────────────────────────────────────────────

const watchInput = z.object({
  tracking: z.string().trim().min(6).max(128).describe('The tracking number exactly as typed.'),
  action: z.enum(['watch', 'unwatch']).default('watch'),
});

export function buildWatchTrackingTool(): AssistantToolDef<typeof watchInput> {
  return {
    name: 'watch_tracking',
    description:
      'Watch (or stop watching) a tracking number for YOU: "tell me when 1Z… arrives", "watch this tracking", "stop watching …". It appears in your watch list and notifies you when the package lands. No confirmation needed.',
    permission: 'home.subscriptions.manage',
    inputSchema: watchInput,
    run: async (input, ctx) => {
      const org = ctx.organizationId as OrgId;
      if (ctx.staffId === null) return { ok: false, error: 'Watching needs a signed-in staff member.' };
      if (!(await isHomeInbox(org))) {
        return { ok: false, error: 'Tracking watches are not turned on for this workspace, so nothing was changed.' };
      }
      const watch = await setTrackingWatch({
        orgId: org,
        staffId: ctx.staffId,
        permissions: [...ctx.permissions],
        value: input.tracking,
        desired: input.action === 'unwatch' ? 'muted' : 'subscribed',
      });
      await recordAudit(pool, null, null, {
        source: 'assistant-watch',
        action: AUDIT_ACTION.SUBSCRIPTION_TOGGLE,
        entityType: AUDIT_ENTITY.STAFF,
        entityId: String(ctx.staffId),
        actorStaffIdOverride: ctx.staffId,
        organizationIdOverride: org,
        extra: { kind: 'tracking', tracking: watch.tracking, result: watch.kind, sessionId: ctx.sessionId ?? null },
      });
      const message =
        watch.kind === 'stopped'
          ? watch.stopped
            ? `Stopped watching ${watch.tracking}.`
            : `You were not watching ${watch.tracking}; nothing changed.`
          : watch.kind === 'pre_arrival'
            ? watch.created
              ? `Watching ${watch.tracking} — you will be notified when it arrives. It is in your watch list.`
              : `You were already watching ${watch.tracking}; you will be notified when it arrives.`
            : `Watching ${watch.tracking} (receiving #${watch.receivingId}) — you will be notified of its updates. It is in your watch list.`;
      return { ok: true, tracking: watch.tracking, watching: watch.kind !== 'stopped', message, summary: message, answer: message };
    },
  };
}
