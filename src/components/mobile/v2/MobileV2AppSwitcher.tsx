'use client';

import { usePathname } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, LayoutDashboard } from '@/components/Icons';
import { IconButton, Popover } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import type { SpineNavigationBand } from '@/lib/nav/spine-navigation-band';
import { deskCountsQuery, unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { cn } from '@/utils/_cn';
import {
  MOBILE_V2_FBM_DESTINATIONS,
  MOBILE_V2_NAVIGATION_FAMILIES,
  type MobileV2Destination,
  type MobileV2NavigationFamily,
  type MobileV2NavigationGroup,
  type MobileV2NavigationGroupId,
} from './mobile-v2-destinations';
import {
  MobileNavigationDestinationRow,
  MobileNavigationDrillRow,
  MobileNavigationFamilyTile,
  MobileNavigationParentRow,
  mobileNavigationPathMatches,
  type SwitcherDestination,
} from './MobileV2NavigationRows';

type NavigationView = 'root' | SpineNavigationBand | MobileV2NavigationGroupId | 'fbm';

const FAMILY_IDS = new Set<NavigationView>(['utility', 'business', 'bottom']);
const GROUP_IDS = new Set<NavigationView>(['floor', 'sales', 'inbound', 'fulfillment', 'inventory', 'catalog']);

export function MobileV2AppSwitcher() {
  const pathname = usePathname();
  const { has } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<NavigationView>('root');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());
  const { data: deskCounts } = useQuery(deskCountsQuery());

  const canSee = (destination: MobileV2Destination) =>
    destination.ported !== false && (!destination.requires || has(destination.requires));

  const countFor = (id: string): number | undefined => {
    const count = id === 'orders' || id === 'fbm'
      ? queueCounts?.total
      : id === 'pick'
        ? queueCounts?.byStage.pending
        : id === 'exceptions'
          ? deskCounts?.exceptions
          : undefined;
    return count && count > 0 ? count : undefined;
  };

  const withCount = (destination: MobileV2Destination): SwitcherDestination => ({
    ...destination,
    count: countFor(destination.id),
  });

  const families = useMemo(
    () => MOBILE_V2_NAVIGATION_FAMILIES.map((family) => ({
      ...family,
      destinations: family.destinations?.filter(canSee),
      groups: family.groups
        ?.map((group) => ({
          ...group,
          destinations: group.destinations.filter(canSee),
        }))
        .filter((group) => group.destinations.length > 0),
    })),
    // The permission resolver is stable for the authenticated session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [has],
  );
  const fbmDestinations = MOBILE_V2_FBM_DESTINATIONS.filter(canSee).map(withCount);
  const operations = families.find((family) => family.id === 'business')?.groups ?? [];

  const currentFamily = FAMILY_IDS.has(view)
    ? families.find((family) => family.id === view) ?? null
    : null;
  const currentGroup = GROUP_IDS.has(view)
    ? operations.find((group) => group.id === view) ?? null
    : null;
  const fulfillmentGroup = operations.find((group) => group.id === 'fulfillment');

  const groupIsActive = (group: MobileV2NavigationGroup): boolean => {
    if (group.id === 'fulfillment') {
      return group.destinations.some((destination) => mobileNavigationPathMatches(pathname, destination.href))
        || fbmDestinations.some((destination) => mobileNavigationPathMatches(pathname, destination.href));
    }
    return group.destinations.some((destination) => mobileNavigationPathMatches(pathname, destination.href));
  };

  const familyIsActive = (family: MobileV2NavigationFamily): boolean =>
    family.destinations?.some((destination) => mobileNavigationPathMatches(pathname, destination.href))
      || family.groups?.some(groupIsActive)
      || false;

  const groupCount = (groupId: MobileV2NavigationGroupId): number | undefined => {
    if (groupId === 'fulfillment') return countFor('orders');
    if (groupId === 'floor') return countFor('pick');
    return undefined;
  };

  const activeFamily = families.find(familyIsActive);
  const triggerTone = activeFamily?.tone ?? 'text-text-default';
  const panelTitle = view === 'fbm'
    ? 'FBM'
    : currentGroup?.label ?? currentFamily?.label ?? 'Applications';

  const close = () => {
    setOpen(false);
    setView('root');
  };

  const goBack = () => {
    if (view === 'fbm') setView('fulfillment');
    else if (GROUP_IDS.has(view)) setView('business');
    else setView('root');
  };

  const nested = open && view !== 'root';
  const backLabel = view === 'fbm'
    ? 'Back to Fulfillment'
    : GROUP_IDS.has(view)
      ? 'Back to Operations'
      : 'Back to applications';

  const renderDestination = (rawDestination: MobileV2Destination) => {
    const destination = withCount(rawDestination);
    if (destination.id === 'fbm') {
      return (
        <li key={destination.id}>
          <MobileNavigationDrillRow
            id={destination.id}
            label={destination.label}
            description={destination.description}
            icon={destination.icon}
            tone={destination.tone}
            count={destination.count}
            active={groupIsActive(fulfillmentGroup ?? currentGroup!)}
            onChoose={() => setView('fbm')}
          />
        </li>
      );
    }
    return (
      <li key={destination.id}>
        <MobileNavigationDestinationRow
          destination={destination}
          active={mobileNavigationPathMatches(pathname, destination.href)}
          onChoose={close}
        />
      </li>
    );
  };

  return (
    <div
      className="relative flex shrink-0 self-stretch"
      data-mobile-navigation-open={open ? 'true' : undefined}
    >
      <IconButton
        ref={triggerRef}
        size="touch"
        radius="surface"
        ariaLabel={nested ? backLabel : open ? 'Close applications' : 'Open applications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="mobile-v2-navigation-panel"
        icon={nested ? <ChevronLeft className="h-5 w-5" /> : <LayoutDashboard className="h-5 w-5" />}
        className={cn('m-1 border border-border-soft bg-surface-card shadow-sm', triggerTone)}
        data-testid="mobile-v2-app-switcher"
        onClick={() => {
          if (nested) goBack();
          else if (open) close();
          else {
            setView('root');
            setOpen(true);
          }
        }}
      />

      <Popover
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        placement="bottom-start"
        gap={4}
        padded
        id="mobile-v2-navigation-panel"
        role="dialog"
        aria-modal="false"
        aria-label={panelTitle}
        className="w-[min(22rem,calc(100vw-1rem))] bg-surface-card"
        data-testid="mobile-app-switcher-panel"
      >
        <nav
          aria-label={view === 'root' ? 'Application areas' : `${panelTitle} destinations`}
          className="touch-pan-y overscroll-contain"
        >
          {view === 'root' ? (
            <>
              <h2 className="sr-only">Application areas</h2>
              <ul className="grid grid-cols-2 gap-2" data-testid="mobile-nav-family-list">
                {families.map((family) => (
                  <li key={family.id}>
                    <MobileNavigationFamilyTile
                      family={family}
                      active={familyIsActive(family)}
                      onChoose={() => setView(family.id)}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : view === 'fbm' ? (
            <ul className="stack-row">
              {fbmDestinations.map(renderDestination)}
            </ul>
          ) : currentGroup ? (
            <ul className="stack-row">
              {currentGroup.destinations.map(renderDestination)}
            </ul>
          ) : currentFamily?.id === 'business' ? (
            <ul className="stack-row" data-testid="mobile-nav-operation-list">
              {(currentFamily.groups ?? []).map((group) => (
                <li key={group.id}>
                  <MobileNavigationParentRow
                    group={group}
                    active={groupIsActive(group)}
                    count={groupCount(group.id)}
                    onChoose={() => setView(group.id)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="stack-row">
              {(currentFamily?.destinations ?? []).map(renderDestination)}
            </ul>
          )}
        </nav>
      </Popover>
    </div>
  );
}
