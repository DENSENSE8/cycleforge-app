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
      contentClassName={cn('min-w-56 overflow-hidden', HEADER_ICON_CORNER)}
      optionTestId={(opt) => `kiosk-command-${opt.value}`}
      options={KIOSK_SERVICES.filter((s) => s.status === 'live').map((s) => {
        const Icon = s.icon;
        return {
          value: s.id,
          label: commandMenuLabel(s.id),
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
            // HARD navigation, deliberately not router.push. The root layout
            // computes kioskHost (isKioskHost(host) || isKioskUiPath(pathname))
            // per REQUEST and passes it to DesktopRouteShell, where
            // `chromeless` hides the staff header. /kiosk/* and / share the
            // root-layout segment, so a soft navigation REUSES the layout
            // with kioskHost frozen at true — the desktop global header never
            // came back after Exit. A full load re-runs the layout for '/',
            // restores the header, and also drops the kiosk device session /
            // Ably wiring cleanly — this is a mode exit, not a route change.
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
    <div className={cn(HEADER_ICON_CLUSTER, 'ml-auto shrink-0 items-center gap-2')} data-header-zone="kiosk-utilities">
      <ConsultStanceControls layout="header" value={consultStance} onChange={onConsultStance} />
      {showCheckoutSlots ? (
        <>
          {/*
            No HEADER_ICON_WRAP here: that wrapper is a fixed 32px cell, and
            the kiosk glyph chips are 36px (KIOSK_POS_TRAIL_ICON — one size
            with the word chips). A 36px control in a 32px cell overflows into
            its neighbour, which is exactly the paperwork/cart overlap the
            operator reported. The chips are self-sizing; the cluster's own
            gap-2 is the spacing. One pattern, no overlaps.
          */}
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
          {/*
            Badge positions against the button face, not a wrapper — otherwise
            -top-* floats into the gutter above the cart glyph.
            Callers: KioskShell → KioskTopChrome. API: none. Schemas: none.
            User: "ensure the qty for the cart is properly on the cart icon"
          */}
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
      {/* NO search glyph here, on purpose: the find-bar lives ONLY in the
          catalog trail (ProductSelector kiosk-split) because only a catalog
          has anything to search — its icon/field is the one input bound to
          the shell-controlled searchQuery state. Mounting a second icon here
          would fork that state and desync the two faces. The bracket this
          band owns — command dropdown leads, utilities trail — is identical
          on every pane. */}
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
