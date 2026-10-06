/**
 * FBM's visible workspaces. This is deliberately narrower than
 * `DESK_VIEWS`: internal/legacy route recognition is not permission to paint a
 * destination. Desktop and mobile project this same contract.
 */

import { LayoutDashboard } from '@/components/Icons';
import { SHIPPING_NAV_ICONS } from '@/lib/nav/station-nav-icons';
import { SHIPPING_LABEL_INTAKE_PATH, SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';

type FbmDestinationIcon = (props: { className?: string }) => JSX.Element;

export type FbmDestinationId = 'orders' | 'label-intake';

export interface FbmDestination {
  id: FbmDestinationId;
  label: string;
  description: string;
  pathname: string;
  requires: string;
  icon: FbmDestinationIcon;
  tone: string;
  /** Native phone destination. Null means omit it rather than paint a disabled promise. */
  mobileHref: string | null;
  landing?: true;
}

export const FBM_DESTINATIONS: readonly FbmDestination[] = [
  {
    id: 'orders',
    label: 'Allocate',
    description: 'Allocate merchant-fulfilled orders',
    pathname: SHIPPING_ORDERS_PATH,
    requires: 'orders.view',
    icon: LayoutDashboard,
    tone: 'text-blue-600',
    mobileHref: '/m/orders',
    landing: true,
  },
  {
    id: 'label-intake',
    label: 'Labels & docs',
    description: 'Shipping labels and paperwork — upload and print',
    pathname: SHIPPING_LABEL_INTAKE_PATH,
    requires: 'packing.review',
    icon: SHIPPING_NAV_ICONS.labels,
    tone: 'text-teal-600',
    mobileHref: null,
  },
] as const;

const landing = FBM_DESTINATIONS.filter((destination) => destination.landing);
if (landing.length !== 1) throw new Error(`FBM needs exactly one visible landing destination, found ${landing.length}`);

export const FBM_LANDING_DESTINATION: FbmDestination = landing[0]!;

function onPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function resolveFbmDestination(pathname: string | null): FbmDestinationId | null {
  if (!pathname) return null;
  return FBM_DESTINATIONS.find((destination) => onPath(pathname, destination.pathname))?.id ?? null;
}

/** A route page that is visually owned by FBM rather than being a Fulfillment peer. */
export function fulfillmentVisiblePageId(pageId: string): string {
  return pageId === 'label-intake' ? 'outbound' : pageId;
}
