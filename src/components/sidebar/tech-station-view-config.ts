import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { Truck, Wrench } from '@/components/Icons';

/**
 * Top-level mode for the tech sidebar. Mirrors `ReceivingMode` on the
 * receiving page — primary affordance is the big pill row at the top, and
 * each mode owns a completely different sidebar body.
 *
 *   testing  → {@link TestingSidebarPanel} (receiving scan + personal Tested /
 *              To Test rail + filter). Right pane = TestingHistoryList when no
 *              line is selected; TestingPanel when a line is open.
 *   shipping → {@link ShippingSidebarPanel} (order scan + last-50 personal
 *              ship-out rail + filter). Right pane = Shipping workspace
 *              (Pending · FBA | History); rail row opens shipped-order preview.
 */
export type TechSidebarTopMode = 'testing' | 'shipping';

/**
 * Top-row pills shown in every mode. Matches the receiving sidebar's
 * `RECEIVING_MODE_ITEMS` shape (text + icon, `variant="nav"`) so the visual
 * vocabulary stays consistent across the app. Order: Testing (left) · Shipping.
 */
export const TECH_TOP_MODE_ITEMS: HorizontalSliderItem[] = [
  { id: 'testing', label: 'Testing', icon: Wrench },
  { id: 'shipping', label: 'Shipping', icon: Truck },
];
