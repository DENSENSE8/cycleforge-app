'use client';

/**
 * ShippedDetailsHeader — the slide-over / full-page order header: order-id
 * badge (click-to-copy), optional close, action bar, and section tabs.
 *
 * Full-page workbench usage omits `onClose` / prev-next / `onOpenFullPage` so
 * navigation lives in the order sidebar instead of panel chrome.
 */

import { ExternalLink, Package } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import {
  PaneHeader,
  PaneHeaderIconBadge,
  PaneHeaderLabel,
  PaneHeaderTabs,
  PaneHeaderActionBar,
  type PaneHeaderActionBarAction,
} from '@/components/ui/pane-header';
import type { ShippedActiveSection } from '@/components/shipped/ShippedDetailsPanelContent';

export interface ShippedDetailsHeaderProps {
  orderIdDisplay: string;
  showExceptionsFallback: boolean;
  copiedOrderId: boolean;
  onCopyOrderId: () => void;
  /** Omit on the dedicated full-page workspace — no panel to close. */
  onClose?: () => void;
  actions: PaneHeaderActionBarAction[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  showCustomerTab: boolean;
  /** Outbound documents (label + slip) get their own tab on labels/fulfillment/staged contexts. */
  showDocumentsTab: boolean;
  /**
   * Full-page order view keeps the coverage-first Warranty tab; the slide-over
   * drops it in favor of the Warranty quick-link row (OrderQuickLinksSection).
   */
  showWarrantyTab: boolean;
  activeSection: ShippedActiveSection;
  onSectionChange: (section: ShippedActiveSection) => void;
  /** Opens the full-page order view (/o/[id]). Omitted → the expand control hides. */
  onOpenFullPage?: () => void;
  /**
   * Week 1 / D3: order-record surfaces render one vertical scroll
   * (`OrderRecordBody`) instead of the eight-tab strip, so they suppress the
   * tab row and keep only identity + the action bar. Legacy contexts
   * (station / packer / labels / staged / fulfillment) keep tabs — default true.
   */
  showTabs?: boolean;
}

export function ShippedDetailsHeader({
  orderIdDisplay,
  showExceptionsFallback,
  copiedOrderId,
  onCopyOrderId,
  onClose: _onClose,
  actions,
  onMoveUp,
  onMoveDown,
  showCustomerTab,
  showDocumentsTab,
  showWarrantyTab,
  activeSection,
  onSectionChange,
  onOpenFullPage,
  showTabs = true,
}: ShippedDetailsHeaderProps) {
  // Close lives on RightRailHost (backdrop / Esc); prop retained for call sites.
  void _onClose;
  return (
    <PaneHeader
      className="shrink-0 border-b-0 bg-surface-card/90 backdrop-blur-xl"
      rowClassName="px-6"
      leftSlot={
        <>
          <PaneHeaderIconBadge Icon={Package} bg="bg-blue-600" tint="text-white" />
          <PaneHeaderLabel
            eyebrow={showExceptionsFallback ? 'Exceptions' : 'Order #'}
            value={
              <HoverTooltip label={copiedOrderId ? 'Copied' : 'Click to copy'} asChild>
                {/* ds-raw-button: text-left inline value (click-to-copy order id), not a styled CTA */}
                <button
                  type="button"
                  onClick={onCopyOrderId}
                  className="truncate text-left transition-colors hover:text-blue-700"
                  aria-label={`Copy ${orderIdDisplay}`}
                >
                  {orderIdDisplay}
                  {copiedOrderId && <span className="ml-1 text-text-success">✓</span>}
                </button>
              </HoverTooltip>
            }
            valueTitle={orderIdDisplay}
          />
        </>
      }
      rightSlot={
        onOpenFullPage ? (
          <HoverTooltip label="Open full order page" asChild>
            <IconButton
              icon={<ExternalLink className="h-4 w-4" />}
              onClick={onOpenFullPage}
              ariaLabel="Open full order page"
              className="rounded-md p-1.5 hover:bg-surface-sunken"
            />
          </HoverTooltip>
        ) : undefined
      }
      belowSlot={
        <>
          <div className="px-6 py-2">
            <PaneHeaderActionBar
              iconOnly
              variant="card"
              actions={actions}
              onPrev={onMoveUp}
              onNext={onMoveDown}
              prevTitle="Move up a row"
              nextTitle="Move down a row"
            />
          </div>
          {showTabs ? (
            <PaneHeaderTabs<ShippedActiveSection>
              dense
              tabs={[
                { value: 'shipping' as const, label: 'Shipping' },
                { value: 'product' as const, label: 'Product' },
                ...(showDocumentsTab ? [{ value: 'documents' as const, label: 'Documents' }] : []),
                { value: 'timeline' as const, label: 'Timeline' },
                ...(showCustomerTab ? [{ value: 'customer' as const, label: 'Customer' }] : []),
                ...(showWarrantyTab ? [{ value: 'warranty' as const, label: 'Warranty' }] : []),
                { value: 'conversation' as const, label: 'Conversation' },
              ]}
              value={activeSection}
              onChange={onSectionChange}
              className="px-6"
            />
          ) : null}
        </>
      }
    />
  );
}
