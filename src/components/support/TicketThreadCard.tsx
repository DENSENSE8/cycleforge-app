'use client';

/**
 * Shared React Query key for Zendesk ticket-thread caches.
 * Consumed by ReceivingTicketChip (cache invalidation) — keep the tuple stable.
 */

export const threadKey = (ticketId: number) => ['receiving', 'ticket-thread', ticketId] as const;
