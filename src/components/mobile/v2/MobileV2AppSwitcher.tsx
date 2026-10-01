'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, LayoutDashboard, Settings } from '@/components/Icons';
import { IconButton, Popover } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { domainLane } from '@/lib/nav/lanes';
import { deskCountsQuery, unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { cn } from '@/utils/_cn';
import {
  MOBILE_V2_DESTINATIONS,
  MOBILE_V2_FULFILLMENT_DESTINATIONS,
  type MobileV2Destination,
} from './mobile-v2-destinations';

const RECENT_KEY = 'cycleforge:mobile-v2:recent-destinations';
const FBM_IDS = new Set(['orders', 'exceptions']);

type SwitcherDestination = MobileV2Destination & { badge?: number };

function DestinationTile({
  destination,
  active,
  onChoose,
}: {
  destination: SwitcherDestination;
  active: boolean;
  onChoose: () => void;
}) {
  const Icon = destination.icon;
  if (destination.ported === false) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={`${destination.label} is being ported to Mobile V2`}
        className="relative flex min-h-16 w-full cursor-not-allowed flex-col items-center justify-center gap-1 rounded-xl border border-border-soft bg-surface-sunken px-1 py-2 text-center text-text-faint opacity-70"
      >
        <Icon className="h-5 w-5" />
        <span className="line-clamp-2 max-w-full text-[11px] font-semibold leading-4">{destination.label}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wide">V2 later</span>
      </button>
    );
  }
  return (
    <Link
      href={destination.href}
      aria-current={active ? 'page' : undefined}
      onClick={onChoose}
      className={cn(
        'relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center',
        'transition-[background-color,border-color,transform] active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2',
        active
          ? 'border-border-accent bg-surface-selected text-text-default'
          : 'border-border-soft bg-surface-card text-text-default hover:bg-surface-hover',
      )}
    >
      {destination.badge ? (
        <span className="absolute right-1.5 top-1 rounded-full bg-surface-warning px-1.5 text-[10px] font-bold tabular-nums text-text-warning">
          {destination.badge > 999 ? '999+' : destination.badge}
        </span>
      ) : null}
      <Icon className={cn('h-5 w-5', destination.tone)} />
      <span className="line-clamp-2 max-w-full text-[11px] font-semibold leading-4">
        {destination.label}
      </span>
    </Link>
  );
}

export function MobileV2AppSwitcher() {
  const pathname = usePathname();
  const { has } = useAuth();
  const [open, setOpen] = useState(false);
  const [depth, setDepth] = useState<'root' | 'fulfillment' | 'fbm'>('root');
  const [recentHrefs, setRecentHrefs] = useState<string[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());
  const { data: deskCounts } = useQuery(deskCountsQuery());
  const destinations = MOBILE_V2_DESTINATIONS.filter(
    (destination) => !destination.requires || has(destination.requires),
  );
  const countFor = (id: string): number | undefined => {
    const count = id === 'orders'
      ? queueCounts?.total
      : id === 'pick'
        ? queueCounts?.byStage.pending
        : id === 'pack'
          ? queueCounts?.byStage.picked
          : id === 'scan-out'
            ? queueCounts?.byStage.packed
            : id === 'exceptions'
              ? deskCounts?.exceptions
              : undefined;
    return count && count > 0 ? count : undefined;
  };
  const withBadge = (destination: MobileV2Destination): SwitcherDestination => ({
    ...destination,
    badge: countFor(destination.id),
  });
  const fbmDestinations = destinations
    .filter((destination) => FBM_IDS.has(destination.id))
    .map(withBadge);
  const rootDestinations = destinations
    .filter((destination) => !FBM_IDS.has(destination.id))
    .map(withBadge);
  const fulfillmentPages: SwitcherDestination[] = MOBILE_V2_FULFILLMENT_DESTINATIONS
    .filter((destination) => !destination.requires || has(destination.requires))
    .map((destination) => ({
      ...destination,
      badge: destination.id === 'fbm' ? countFor('orders') : undefined,
    }));
  const fulfillmentActive = fbmDestinations.some(
    (destination) => pathname === destination.href || pathname?.startsWith(`${destination.href}/`),
  );
  const fulfillmentGroup: SwitcherDestination = {
    id: 'fulfillment',
    label: 'Fulfillment',
    description: 'Fulfilled, FBM, FBA, labels and documents',
    href: '/m/orders',
    icon: domainLane('fulfillment').icon,
    tone: 'text-blue-600',
    badge: countFor('orders'),
  };
  const everyDestination = [...fbmDestinations, ...rootDestinations];
  const activeDestination = everyDestination.find(
    (destination) => pathname === destination.href || pathname?.startsWith(`${destination.href}/`),
  );
  const triggerTone = activeDestination?.tone ?? (fulfillmentActive ? fulfillmentGroup.tone : 'text-text-default');
  const recentDestinations = recentHrefs
    .map((href) => everyDestination.find((destination) => destination.href === href))
    .filter((destination): destination is SwitcherDestination => Boolean(destination));

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]') as unknown;
      if (Array.isArray(stored)) setRecentHrefs(stored.filter((href): href is string => typeof href === 'string').slice(0, 3));
    } catch {
      // A malformed convenience cache must never block navigation.
    }
  }, []);

  const remember = (href: string) => {
    setRecentHrefs((current) => {
      const next = [href, ...current.filter((value) => value !== href)].slice(0, 3);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
    setOpen(false);
    setDepth('root');
  };
  const close = () => {
    setOpen(false);
    setDepth('root');
  };
  const nested = open && depth !== 'root';

  return (
    <>
      <IconButton
        ref={triggerRef}
        size="touch"
        radius="surface"
        ariaLabel={depth === 'fbm' ? 'Back to Fulfillment' : nested ? 'Back to applications' : open ? 'Close applications' : 'Open applications'}
        aria-expanded={open}
        aria-haspopup="menu"
        icon={nested ? <ChevronLeft className="h-5 w-5" /> : <LayoutDashboard className="h-5 w-5" />}
        className={cn('m-1 border border-border-soft bg-surface-card shadow-sm', triggerTone)}
        data-testid="mobile-v2-app-switcher"
        onClick={() => {
          if (depth === 'fbm') setDepth('fulfillment');
          else if (depth === 'fulfillment') setDepth('root');
          else setOpen((current) => !current);
        }}
      />

      <Popover
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        placement="bottom-start"
        gap={4}
        className="w-[min(22rem,calc(100vw-1rem))] border border-border-soft bg-surface-card p-2 shadow-xl"
      >
        <nav aria-label="CycleForge applications">
          {depth === 'root' && recentDestinations.length > 0 ? (
            <div className="mb-2 flex gap-1.5 overflow-x-auto" aria-label="Recent applications">
              {recentDestinations.map((destination) => (
                <Link
                  key={destination.href}
                  href={destination.href}
                  onClick={() => remember(destination.href)}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border-soft bg-surface-sunken px-2.5 text-[11px] font-semibold text-text-default"
                >
                  <destination.icon className={cn('h-3.5 w-3.5', destination.tone)} />
                  {destination.label}
                </Link>
              ))}
            </div>
          ) : null}
          <ul className="grid grid-cols-3 gap-1.5">
            {depth === 'root' ? (
              <>
                <li>
                  <button
                    type="button"
                    onClick={() => setDepth('fulfillment')}
                    aria-current={fulfillmentActive ? 'page' : undefined}
                    className={cn(
                      'relative flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2',
                      fulfillmentActive
                        ? 'border-border-accent bg-surface-selected text-text-default'
                        : 'border-border-soft bg-surface-card text-text-default hover:bg-surface-hover',
                    )}
                  >
                    {fulfillmentGroup.badge ? (
                      <span className="absolute right-1.5 top-1 rounded-full bg-surface-warning px-1.5 text-[10px] font-bold tabular-nums text-text-warning">
                        {fulfillmentGroup.badge}
                      </span>
                    ) : null}
                    <fulfillmentGroup.icon className={cn('h-5 w-5', fulfillmentGroup.tone)} />
                    <span className="text-[11px] font-semibold leading-4">Fulfillment</span>
                  </button>
                </li>
                {rootDestinations.map((destination) => {
                  const active = pathname === destination.href || pathname?.startsWith(`${destination.href}/`);
                  return <li key={destination.id}><DestinationTile destination={destination} active={active} onChoose={() => remember(destination.href)} /></li>;
                })}
              </>
            ) : depth === 'fulfillment' ? fulfillmentPages.map((destination) => {
              if (destination.id === 'fbm') {
                const Icon = destination.icon;
                return (
                  <li key={destination.id}>
                    <button
                      type="button"
                      onClick={() => setDepth('fbm')}
                      aria-current={fulfillmentActive ? 'page' : undefined}
                      className={cn(
                        'relative flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2',
                        fulfillmentActive
                          ? 'border-border-accent bg-surface-selected text-text-default'
                          : 'border-border-soft bg-surface-card text-text-default hover:bg-surface-hover',
                      )}
                    >
                      {destination.badge ? (
                        <span className="absolute right-1.5 top-1 rounded-full bg-surface-warning px-1.5 text-[10px] font-bold tabular-nums text-text-warning">
                          {destination.badge}
                        </span>
                      ) : null}
                      <Icon className={cn('h-5 w-5', destination.tone)} />
                      <span className="text-[11px] font-semibold leading-4">{destination.label}</span>
                    </button>
                  </li>
                );
              }
              return <li key={destination.id}><DestinationTile destination={destination} active={false} onChoose={() => undefined} /></li>;
            }) : fbmDestinations.map((destination) => {
              const active = pathname === destination.href || pathname?.startsWith(`${destination.href}/`);
              return <li key={destination.id}><DestinationTile destination={destination} active={active} onChoose={() => remember(destination.href)} /></li>;
            })}
          </ul>

          <Link
            href="/m/settings"
            aria-current={pathname?.startsWith('/m/settings') ? 'page' : undefined}
            onClick={() => remember('/m/settings')}
            className={cn(
              'mt-2 flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2',
              pathname?.startsWith('/m/settings')
                ? 'border-border-accent bg-surface-selected text-text-default'
                : 'border-border-soft bg-surface-sunken text-text-default hover:bg-surface-hover',
            )}
          >
            <Settings className="h-5 w-5 text-text-soft" />
            Settings
          </Link>
        </nav>
      </Popover>
    </>
  );
}
