/** Shared wire + domain types for the Home subscription engine. */

export type SubscriptionKind = 'entity' | 'rule' | 'sla';
export type SubscriptionState = 'subscribed' | 'auto' | 'muted';
export type InboxState = 'unread' | 'read' | 'done' | 'snoozed';

/**
 * Why a row exists / why it reached your inbox. Mirrors GitHub's `reason` —
 * it is what makes an inbox row explainable ("you're seeing this because…")
 * and is the per-category mute axis.
 */
export type SubscriptionReason = 'manual' | 'acted' | 'assigned' | 'mentioned' | 'rule' | 'sla';

export interface InboxItemDto {
  id: number;
  entityType: string;
  entityId: number;
  eventKey: string;
  /** Resolved label for eventKey — the row renders this, never stored text. */
  eventLabel: string;
  reason: SubscriptionReason;
  state: InboxState;
  /** >1 means N events folded into this row inside the collapse window. */
  collapseCount: number;
  snoozedUntil: string | null;
  occurredAt: string;
  lastEventAt: string;
  actorStaffId: number | null;
  /** Deep link into the owning surface. */
  href: string;
  subscriptionId: number | null;
  /**
   * Current follow state for this entity, resolved in the feed query.
   * Carried on the DTO so the row's bell renders from data it already has —
   * a per-row GET would be a 50-request N+1 on every inbox open.
   */
  subscriptionState: SubscriptionState | null;
  /**
   * The tracking number the event carried, when it had one — the whole content
   * of a watched arrival ("1Z… landed"), so the row does not make the reader
   * open the carton to learn which package it is. Render hint, never a filter.
   */
  trackingNumber: string | null;
  /** The PROVIDER ticket number on a `support_ticket` row — the `#48120` an operator quotes. */
  ticketNumber: number | null;
}

export interface InboxFeedDto {
  items: InboxItemDto[];
  counts: { unread: number; snoozed: number };
}

export interface SubscriptionDto {
  id: number;
  subscriptionKind: SubscriptionKind;
  state: SubscriptionState;
  reason: SubscriptionReason;
  entityType: string | null;
  entityId: number | null;
  matchEventKeys: string[] | null;
  matchSku: string | null;
}

/** The three triage verbs an inbox row supports. */
export type InboxTriageAction = 'read' | 'done' | 'snooze' | 'unread';
