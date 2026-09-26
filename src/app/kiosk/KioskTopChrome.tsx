'use client';

/** Kiosk trail chrome — command dropdown + optional center + carts / cart / paperwork / Work · Show · Verify. */

import type { ReactNode } from 'react';
import { FileText, Layers, ShoppingCart, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/design-system/primitives';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { ConsultStanceControls } from '@/components/kiosk/ConsultStanceControls';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_CLUSTER,
  TOP_CHROME_ICON_FACE,
} from '@/components/layout/header-shell';
import { KIOSK_SERVICES, type KioskServiceId } from '@/lib/kiosk/services';
import type { ConsultStance } from '@/lib/counter/consult-stance';
import { cn } from '@/utils/_cn';
import {
  KIOSK_CART_COUNT_BADGE,
  KIOSK_PANE_HEADER_BAND,
} from './kiosk-chrome';
import {
  KIOSK_POS_TRAIL_CONTROL,
  KIOSK_POS_TRAIL_ICON,
} from './kiosk-pos-surface';

export type KioskUtilitySlotId = 'cart' | 'paperwork' | 'carts';

export function KioskCommandMenu({
  activeMode,
  onModeSwitch,
  showStaffTools = true,
}: {
  activeMode: KioskServiceId;
  onModeSwitch: (mode: KioskServiceId) => void;
  /** Staff tools (History) are listed under the commerce commands. */
  showStaffTools?: boolean;
}) {
  return (
    <IntakeCombobox
      testId="kiosk-command-menu"
      ariaLabel="Kiosk command"
      triggerVariant="ghost"
      value={activeMode}
      placeholder="Repair"
      searchPlaceholder="Search commands"
      emptyMessage="No commands match"
      className={cn('shrink-0 font-medium text-text-default', KIOSK_POS_TRAIL_CONTROL, focusRing('control', 'neutral'))}
      contentClassName={cn('min-w-56 overflow-hidden', DROPDOWN_SHELL_CORNER)}
      optionTestId={(opt) => `kiosk-command-${opt.value}`}
      options={KIOSK_SERVICES.filter(
        (s) => s.status === 'live' && (showStaffTools || s.kind === 'command'),
      ).map((s) => {
        const Icon = s.icon;
        return {
          value: s.id,
          label: s.commandLabel,
          // The combobox wraps every glyph in a `text-text-soft` span; a
          // colour ON the svg beats that inherited ink, so one class here
          // paints both the trigger (selected command) and the option row.
          icon: <Icon className={cn('h-4 w-4', s.iconTone)} />,
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
          onClick={() => {
            // HARD navigation, deliberately not router.push.
            window.location.assign('/');
          }}
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
  openCartCount = 0,
  consultStance,
  onConsultStance,
  showCheckoutSlots = true,
  showStance = true,
}: {
  activeSlot: KioskUtilitySlotId | null;
  onSelect: (next: KioskUtilitySlotId | null) => void;
  cartCount: number;
  /** Open carts across the org (Recent carts) — the Carts key's badge. */
  openCartCount?: number;
  consultStance: ConsultStance;
  onConsultStance: (stance: ConsultStance) => void;
  showCheckoutSlots?: boolean;
  /**
   * Work · Show · Verify.
   * looking at (operator 2026-09-22: *"the history tab should not display the
   */
  showStance?: boolean;
}) {
  return (
    <div className={cn(HEADER_ICON_CLUSTER, 'ml-auto shrink-0 items-center gap-2')} data-header-zone="kiosk-utilities">
      {showStance ? (
        <ConsultStanceControls layout="header" value={consultStance} onChange={onConsultStance} />
      ) : null}
      {showCheckoutSlots ? (
        <>
          {/* No HEADER_ICON_WRAP here: */}
          <HoverTooltip label={activeSlot === 'paperwork' ? 'Hide paperwork' : 'Paperwork'} asChild>
            <IconButton
              icon={<FileText className={TOP_CHROME_ICON_FACE} aria-hidden />}
              ariaLabel="Paperwork"
              size="md"
              aria-pressed={activeSlot === 'paperwork'}
              onClick={() => onSelect(activeSlot === 'paperwork' ? null : 'paperwork')}
              className={cn(
                HEADER_ICON_BTN_CLASS,
                KIOSK_POS_TRAIL_ICON,
                activeSlot === 'paperwork' && HEADER_ICON_BTN_OPEN_CLASS,
              )}
              data-testid="kiosk-utility-paperwork"
            />
          </HoverTooltip>
          {/* Recent carts sits beside the Cart key it switches between. */}
          <div className="relative inline-flex shrink-0 items-center justify-center">
            <HoverTooltip label={activeSlot === 'carts' ? 'Hide carts' : 'Recent carts'} asChild>
              <IconButton
                icon={<Layers className={TOP_CHROME_ICON_FACE} aria-hidden />}
                ariaLabel="Carts"
                size="md"
                aria-pressed={activeSlot === 'carts'}
                onClick={() => onSelect(activeSlot === 'carts' ? null : 'carts')}
                className={cn(
                  HEADER_ICON_BTN_CLASS,
                  KIOSK_POS_TRAIL_ICON,
                  activeSlot === 'carts' && HEADER_ICON_BTN_OPEN_CLASS,
                )}
                data-testid="kiosk-utility-carts"
              />
            </HoverTooltip>
            {openCartCount > 0 ? (
              <span className={KIOSK_CART_COUNT_BADGE} data-testid="kiosk-open-carts-count">
                {openCartCount > 9 ? '9+' : openCartCount}
              </span>
            ) : null}
          </div>
          {/* Badge positions against the button face, not a wrapper — otherwise -top-* floats into the gutter above the cart glyph. */}
          <div className="relative inline-flex shrink-0 items-center justify-center">
            <HoverTooltip label={activeSlot === 'cart' ? 'Hide cart' : 'Cart'} asChild>
              <IconButton
                icon={<ShoppingCart className={TOP_CHROME_ICON_FACE} aria-hidden />}
                ariaLabel="Cart"
                size="md"
                aria-pressed={activeSlot === 'cart'}
                onClick={() => onSelect(activeSlot === 'cart' ? null : 'cart')}
                className={cn(HEADER_ICON_BTN_CLASS, KIOSK_POS_TRAIL_ICON, activeSlot === 'cart' && HEADER_ICON_BTN_OPEN_CLASS)}
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
  openCartCount,
  consultStance,
  onConsultStance,
  showCheckoutSlots = true,
  showStance = true,
  showStaffTools = true,
}: {
  activeMode: KioskServiceId;
  onModeSwitch: (mode: KioskServiceId) => void;
  center?: ReactNode;
  activeSlot: KioskUtilitySlotId | null;
  onSelect: (next: KioskUtilitySlotId | null) => void;
  cartCount: number;
  /** Passed straight to {@link KioskUtilityCluster}. */
  openCartCount?: number;
  consultStance: ConsultStance;
  onConsultStance: (stance: ConsultStance) => void;
  showCheckoutSlots?: boolean;
  /** Passed straight to {@link KioskUtilityCluster} — see its note. */
  showStance?: boolean;
  /** Passed straight to {@link KioskCommandMenu} — see its note. */
  showStaffTools?: boolean;
}) {
  return (
    <div className={cn(KIOSK_PANE_HEADER_BAND, 'gap-2 pl-2 pr-2')} data-testid="kiosk-catalog-trail">
      {/* NO search glyph of its OWN here, on purpose: */}
      <KioskCommandMenu
        activeMode={activeMode}
        onModeSwitch={onModeSwitch}
        showStaffTools={showStaffTools}
      />
      {center}
      <KioskUtilityCluster
        activeSlot={activeSlot}
        onSelect={onSelect}
        cartCount={cartCount}
        openCartCount={openCartCount}
        consultStance={consultStance}
        onConsultStance={onConsultStance}
        showCheckoutSlots={showCheckoutSlots}
        showStance={showStance}
      />
    </div>
  );
}
