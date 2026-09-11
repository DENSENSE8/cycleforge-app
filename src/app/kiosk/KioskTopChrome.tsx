'use client';

/**
 * Kiosk trail chrome — command dropdown + optional center + cart / paperwork /
 * Work · Show · Verify. No left or right side rails.
 *
 * Callers: `KioskShell` (staff work, utility panels, customer face) —
 * `src/app/kiosk/KioskShell.tsx` imports `KioskTopChrome`, `KioskCommandMenu`,
 * `KioskUtilityCluster`. Existing file (not a second chrome). No data files.
 * User: "execute now" / "cart icon most top right side and ensure icons for
 * the repair sales buy back and more" / "work show verify should be word and
 * drop downs on the left side of the paper work icon" / "access the kisok
 * from the bottom left side or the top right of the global header"
 */

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, ShoppingCart, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/design-system/primitives';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { ConsultStanceControls } from '@/components/kiosk/ConsultStanceControls';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { HEADER_ICON_CORNER } from '@/design-system/tokens/radius';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_CLUSTER,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from '@/components/layout/header-shell';
import { KIOSK_SERVICES, type KioskServiceId } from '@/lib/kiosk/services';
import type { ConsultStance } from '@/lib/counter/consult-stance';
import { cn } from '@/utils/_cn';
import {
  KIOSK_CART_COUNT_BADGE,
  KIOSK_PANE_HEADER_BAND,
} from './kiosk-chrome';

export type KioskUtilitySlotId = 'cart' | 'paperwork';

function commandMenuLabel(id: KioskServiceId): string {
  if (id === 'sales') return 'Sales';
  const tile = KIOSK_SERVICES.find((s) => s.id === id);
  return tile?.commandLabel ?? id;
}

export function KioskCommandMenu({
  activeMode,
  onModeSwitch,
}: {
  activeMode: KioskServiceId;
  onModeSwitch: (mode: KioskServiceId) => void;
}) {
  const router = useRouter();

  return (
    <IntakeCombobox
      testId="kiosk-command-menu"
      ariaLabel="Kiosk command"
      triggerVariant="ghost"
      value={activeMode}
      placeholder="Repair"
      searchPlaceholder="Search commands"
      emptyMessage="No commands match"
      className={cn('font-medium text-text-default', focusRing('control', 'neutral'))}
      contentClassName={cn('min-w-56 overflow-hidden', HEADER_ICON_CORNER)}
      optionTestId={(opt) => `kiosk-command-${opt.value}`}
      options={KIOSK_SERVICES.filter((s) => s.status === 'live').map((s) => {
        const Icon = s.icon;
        return {
          value: s.id,
          label: commandMenuLabel(s.id),
          icon: <Icon className="h-4 w-4" />,
        };
      })}
      onChange={(next) => onModeSwitch(next as KioskServiceId)}
      footer={
        <Button
          type="button"
          variant="ghost"
          aria-label="Exit kiosk"
          data-testid="kiosk-spine-exit"
          className="h-9 w-full justify-start gap-2 px-2 font-normal"
          onClick={() => router.push('/')}
        >
          <X className={cn(TOP_CHROME_ICON_FACE, 'text-text-soft')} aria-hidden />
          Exit
        </Button>
      }
    />
  );
}

export function KioskUtilityCluster({
  activeSlot,
  onSelect,
  cartCount,
  consultStance,
  onConsultStance,
  showCheckoutSlots = true,
}: {
  activeSlot: KioskUtilitySlotId | null;
  onSelect: (next: KioskUtilitySlotId | null) => void;
  cartCount: number;
  consultStance: ConsultStance;
  onConsultStance: (stance: ConsultStance) => void;
  showCheckoutSlots?: boolean;
}) {
  return (
    <div className={cn(HEADER_ICON_CLUSTER, 'ml-auto')} data-header-zone="kiosk-utilities">
      <ConsultStanceControls layout="header" value={consultStance} onChange={onConsultStance} />
      {showCheckoutSlots ? (
        <>
          <div className={HEADER_ICON_WRAP}>
            <HoverTooltip label={activeSlot === 'paperwork' ? 'Hide paperwork' : 'Paperwork'} asChild>
              <IconButton
                icon={<FileText className={TOP_CHROME_ICON_FACE} aria-hidden />}
                ariaLabel="Paperwork"
                size="md"
                aria-pressed={activeSlot === 'paperwork'}
                onClick={() => onSelect(activeSlot === 'paperwork' ? null : 'paperwork')}
                className={cn(
                  HEADER_ICON_BTN_CLASS,
                  activeSlot === 'paperwork' && HEADER_ICON_BTN_OPEN_CLASS,
                )}
                data-testid="kiosk-utility-paperwork"
              />
            </HoverTooltip>
          </div>
          <div className={HEADER_ICON_WRAP}>
            <HoverTooltip label={activeSlot === 'cart' ? 'Hide cart' : 'Cart'} asChild>
              <IconButton
                icon={<ShoppingCart className={TOP_CHROME_ICON_FACE} aria-hidden />}
                ariaLabel="Cart"
                size="md"
                aria-pressed={activeSlot === 'cart'}
                onClick={() => onSelect(activeSlot === 'cart' ? null : 'cart')}
                className={cn(HEADER_ICON_BTN_CLASS, activeSlot === 'cart' && HEADER_ICON_BTN_OPEN_CLASS)}
                data-testid="kiosk-utility-cart"
              />
            </HoverTooltip>
            {cartCount > 0 ? (
              <span className={KIOSK_CART_COUNT_BADGE} data-testid="kiosk-cart-count">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function KioskTopChrome({
  activeMode,
  onModeSwitch,
  center,
  activeSlot,
  onSelect,
  cartCount,
  consultStance,
  onConsultStance,
  showCheckoutSlots = true,
}: {
  activeMode: KioskServiceId;
  onModeSwitch: (mode: KioskServiceId) => void;
  center?: ReactNode;
  activeSlot: KioskUtilitySlotId | null;
  onSelect: (next: KioskUtilitySlotId | null) => void;
  cartCount: number;
  consultStance: ConsultStance;
  onConsultStance: (stance: ConsultStance) => void;
  showCheckoutSlots?: boolean;
}) {
  return (
    <div className={cn(KIOSK_PANE_HEADER_BAND, 'gap-2 pl-2 pr-2')} data-testid="kiosk-catalog-trail">
      <KioskCommandMenu activeMode={activeMode} onModeSwitch={onModeSwitch} />
      {center}
      <KioskUtilityCluster
        activeSlot={activeSlot}
        onSelect={onSelect}
        cartCount={cartCount}
        consultStance={consultStance}
        onConsultStance={onConsultStance}
        showCheckoutSlots={showCheckoutSlots}
      />
    </div>
  );
}
