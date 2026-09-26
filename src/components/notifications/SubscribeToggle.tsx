'use client';

/** SubscribeToggle — the ONE follow/mute affordance. */

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { IconButton } from '@/design-system/primitives/IconButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Bell } from '@/components/Icons';
import type { SubscriptionDto, SubscriptionState } from '@/lib/notifications/types';

interface SubscribeToggleProps {
  entityType: string;
  entityId: number;
  /** Hidden entirely when the Home Inbox flag is off for this org. */
  enabled?: boolean;
  /**
   * Follow state the caller ALREADY has (the inbox feed joins it per row).
   * When supplied the component skips its own GET — rendering 50 rows must not
   * fire 50 requests. Omit only where the state genuinely isn't known.
   */
  knownState?: SubscriptionState | null;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

async function fetchSubscription(
  entityType: string,
  entityId: number,
): Promise<SubscriptionDto | null> {
  const res = await fetch(
    `/api/subscriptions/toggle?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}`,
    { cache: 'no-store', credentials: 'include' },
  );
  // 404 = flag off for this org. Degrade to "no subscription" and render
  // nothing rather than throwing — a sub-resource never breaks its host.
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`subscription ${res.status}`);
  const body = (await res.json()) as { subscription: SubscriptionDto | null };
  return body.subscription;
}

function isFollowing(state: SubscriptionState | undefined): boolean {
  return state === 'subscribed' || state === 'auto';
}

export function SubscribeToggle({
  entityType,
  entityId,
  enabled = true,
  knownState,
  size = 'sm',
  className,
}: SubscribeToggleProps) {
  const queryClient = useQueryClient();
  const queryKey = ['subscription', entityType, entityId] as const;
  const hasKnownState = knownState !== undefined;

  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchSubscription(entityType, entityId),
    // Disabled when the caller already knows the state — see `knownState`.
    enabled: enabled && !hasKnownState && Number.isFinite(entityId) && entityId > 0,
    staleTime: 60_000,
  });

  const serverState = hasKnownState ? knownState : data?.state;

  // Optimistic mirror so the bell flips on click, not on round-trip — a 300ms
  // lag on a dense list reads as a dead control.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => setOptimistic(null), [serverState]);

  const following = optimistic ?? isFollowing(serverState ?? undefined);

  const mutation = useMutation({
    mutationFn: async (desired: 'subscribed' | 'muted') => {
      const res = await fetch('/api/subscriptions/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entityType, entityId, desired }),
      });
      if (!res.ok) throw new Error(`toggle ${res.status}`);
      return res.json();
    },
    onError: () => setOptimistic(null), // roll back to server truth
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      // The inbox feed carries the follow state per row, so it has to
      // re-read after a mute or the bell reverts on the next refetch.
      queryClient.invalidateQueries({ queryKey: ['home-inbox'] });
    },
  });

  const handleClick = useCallback(() => {
    const next = !following;
    setOptimistic(next);
    mutation.mutate(next ? 'subscribed' : 'muted');
  }, [following, mutation]);

  if (!enabled) return null;

  const label = following
    ? 'Following — you get inbox updates. Click to mute.'
    : serverState === 'muted'
      ? 'Muted. Click to follow again.'
      : 'Follow — get inbox updates for this record.';

  return (
    <HoverTooltip label={label} focusable={false}>
      <IconButton
        icon={
          <Bell
            className={`h-3.5 w-3.5 ${following ? 'text-text-accent' : 'text-text-soft'}`}
          />
        }
        ariaLabel={following ? 'Mute this record' : 'Follow this record'}
        aria-pressed={following}
        onClick={handleClick}
        disabled={mutation.isPending}
        size={size}
        tone={following ? 'accent' : 'neutral'}
        className={className}
      />
    </HoverTooltip>
  );
}
