'use client';

import { ChevronRight } from '@/components/Icons';
import {
  MOBILE_DATA_LIST_ROW_INTERACTION_CLASS,
  MobileDataListRow,
} from '@/design-system/components/MobileDataListRow';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type {
  MobileV2Destination,
  MobileV2NavigationFamily,
  MobileV2NavigationGroup,
} from './mobile-v2-destinations';

export type SwitcherDestination = MobileV2Destination & { count?: number };

const NAVIGATION_ROW_CLASS =
  'flex min-h-16 w-full items-center gap-3 rounded-mode border border-border-soft bg-surface-card px-mode-page py-2.5 text-left text-text-default';
const ACTIVE_ROW_CLASS =
  'border-border-accent bg-surface-card ring-1 ring-inset ring-border-accent';

export function mobileNavigationPathMatches(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  const path = href.split('?')[0] || href;
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** First-level family: a thumb-sized grouped-inset tile, never a compressed row. */
export function MobileNavigationFamilyTile({
  family,
  active,
  onChoose,
}: {
  family: MobileV2NavigationFamily;
  active: boolean;
  onChoose: () => void;
}) {
  const Icon = family.icon;
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-label={`Open ${family.label} navigation`}
      className={cn(
        'relative min-h-28 w-full rounded-mode border border-border-soft bg-surface-card p-3 text-left text-text-default',
        MOBILE_DATA_LIST_ROW_INTERACTION_CLASS,
        focusRing('cell'),
        active && ACTIVE_ROW_CLASS,
      )}
      data-testid={`mobile-nav-family-${family.id}`}
    >
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-mode-control bg-surface-card ring-1 ring-inset ring-border-hairline',
          family.tone,
        )}
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
      <span className="mt-4 block min-w-0">
        <span data-nav-label className="block text-role-body font-semibold leading-5">
          {family.label}
        </span>
        <span className="mt-1 block text-role-caption leading-4 text-text-muted">
          {family.description}
        </span>
      </span>
      <ChevronRight className="absolute bottom-3 right-3 size-5 text-text-faint" aria-hidden />
    </button>
  );
}

function NavigationGlyph({
  icon: Icon,
  tone,
}: {
  icon: MobileV2Destination['icon'];
  tone: string;
}) {
  return (
    <span
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-mode-control bg-surface-card ring-1 ring-inset ring-border-hairline',
        tone,
      )}
      aria-hidden
    >
      <Icon className="size-5" />
    </span>
  );
}

function NavigationCopy({ label, description }: { label: string; description: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span data-nav-label className="block break-words text-role-body font-semibold leading-5">{label}</span>
      <span className="mt-0.5 block break-words text-role-caption leading-4 text-text-muted">
        {description}
      </span>
    </span>
  );
}

function NavigationTail({ count }: { count?: number }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2">
      {count && count > 0 ? (
        <span className="min-w-7 text-right text-role-body font-bold tabular-nums text-text-default">
          {count > 999 ? '999+' : count}
        </span>
      ) : null}
      <ChevronRight className="size-5 text-text-faint" aria-hidden />
    </span>
  );
}

/** A leaf row navigates away; non-mobile leaves are filtered before rendering. */
export function MobileNavigationDestinationRow({
  destination,
  active,
  onChoose,
}: {
  destination: SwitcherDestination;
  active: boolean;
  onChoose: () => void;
}) {
  return (
    <MobileDataListRow
      href={destination.href}
      ariaLabel={`Open ${destination.label}`}
      ariaCurrent={active ? 'page' : undefined}
      onClick={onChoose}
      testId={`mobile-nav-destination-${destination.id}`}
      className={cn(NAVIGATION_ROW_CLASS, active && ACTIVE_ROW_CLASS)}
    >
      <NavigationGlyph icon={destination.icon} tone={destination.tone} />
      <NavigationCopy label={destination.label} description={destination.description} />
      <NavigationTail count={destination.count} />
    </MobileDataListRow>
  );
}

/** A branch row stays inside the navigation surface and reveals its children. */
export function MobileNavigationDrillRow({
  id,
  label,
  description,
  icon,
  tone,
  active,
  count,
  onChoose,
}: {
  id: string;
  label: string;
  description: string;
  icon: MobileV2Destination['icon'];
  tone: string;
  active: boolean;
  count?: number;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-label={`Open ${label} navigation`}
      className={cn(
        NAVIGATION_ROW_CLASS,
        MOBILE_DATA_LIST_ROW_INTERACTION_CLASS,
        focusRing('cell'),
        active && ACTIVE_ROW_CLASS,
      )}
      data-testid={`mobile-nav-parent-${id}`}
    >
      <NavigationGlyph icon={icon} tone={tone} />
      <NavigationCopy label={label} description={description} />
      <NavigationTail count={count} />
    </button>
  );
}

export function MobileNavigationParentRow({
  group,
  active,
  count,
  onChoose,
}: {
  group: MobileV2NavigationGroup;
  active: boolean;
  count?: number;
  onChoose: () => void;
}) {
  return (
    <MobileNavigationDrillRow
      id={group.id}
      label={group.label}
      description={group.description}
      icon={group.icon}
      tone={group.tone}
      active={active}
      count={count}
      onChoose={onChoose}
    />
  );
}
