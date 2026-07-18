import { Printer, Barcode, ClipboardList, Boxes } from '@/components/Icons';
import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';

export type OutboundMode = 'labels' | 'scan-out' | 'ready' | 'fba';

/** Canonical Shipping station path. Legacy `/outbound` permanently redirects here. */
export const SHIPPING_PATH = '/shipping';

/** Params cleared when switching modes. */
export const OUTBOUND_MODE_SCOPED_PARAMS = [
  'q',
  'open',
  'new',
  'sort',
  'ltab',
  'rtab',
  'ostatus',
  'ustatus',
  'attention',
  'fbaMode',
  'openShipmentId',
  'plan',
  'draft',
  'main',
  'details',
  'r',
] as const;

export const OUTBOUND_MODE_ITEMS: HorizontalSliderItem[] = [
  { id: 'labels', label: 'Labels', icon: Printer },
  { id: 'ready', label: 'Ready', icon: ClipboardList },
  { id: 'fba', label: 'FBA', icon: Boxes },
  // Scan out sits last (rightmost) — dock ship-confirm, the end-of-line action.
  { id: 'scan-out', label: 'Scan out', icon: Barcode },
];

export type OutboundSort = 'priority' | 'newest';

export const OUTBOUND_SORT_OPTIONS: { id: OutboundSort; label: string }[] = [
  { id: 'priority', label: 'Priority (due soon)' },
  { id: 'newest', label: 'Newest first' },
];

export function parseOutboundMode(raw: string | null): OutboundMode {
  if (raw === 'scan-out') return 'scan-out';
  if (raw === 'ready') return 'ready';
  if (raw === 'fba') return 'fba';
  return 'labels';
}

export function parseOutboundSort(raw: string | null): OutboundSort {
  return raw === 'newest' ? 'newest' : 'priority';
}
