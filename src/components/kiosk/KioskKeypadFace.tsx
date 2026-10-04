'use client';

/**
 * KioskKeypadFace — Square's Keypad, two columns, no progress band.
 * Operator 2026-09-24: *"the keypad custom price should look exactly like
 * note field above the pad (operator 2026-09-24) — a note is added
 * `verifyLinePrices` accepts it unapproved (operator decision 2026-09-24).
 */

import { useMemo, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { KioskAmountKeypad } from '@/components/kiosk/KioskAmountKeypad';
import { KioskCartLineList } from '@/components/kiosk/KioskCartLineList';
import { KioskStepTitleRow } from '@/components/kiosk/KioskStepTitleRow';
import { useKioskSession, useKioskSessionActions } from '@/lib/kiosk/kiosk-session-store';
import { cartMoneySplit, cartUnitCount } from '@/lib/kiosk/cart-money';
import { formatCartCents } from '@/lib/kiosk/cart-card-view';
import { keypadLine } from '@/lib/kiosk/keypad-line';
import { KIOSK_POS_CTA } from '@/app/kiosk/kiosk-pos-surface';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP } from '@/design-system/tokens/dock-clearance';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

export function KioskKeypadFace({
  mode,
  onCharge,
}: {
  /** Sales adds a sale line; Repair adds a hand-priced device. */
  mode: 'retail' | 'repair';
  /** Charge, after any pending amount has landed: hand off to checkout. */
  onCharge: () => void;
}) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [cents, setCents] = useState(0);

  const money = useMemo(() => cartMoneySplit(session.lines), [session.lines]);
  const chargeCents = money.totalCents + cents;
  const itemCount = useMemo(() => cartUnitCount(session.lines), [session.lines]);

  /** Land the amount on display as a line. False when nothing landed. */
  const commit = (): boolean => {
    const built = keypadLine(mode, cents);
    if (built.kind === 'refused') {
      if (cents > 0) toast(built.reason);
      return false;
    }
    const { title, unitAmountCents } = built;
    const line =
      built.kind === 'repair'
        ? actions.addRepair({ title, unitAmountCents, payload: built.payload })
        : actions.addRetail({ title, unitAmountCents, payload: built.payload });
    actions.setPresentation({ lineId: line.id, catalog: null });
    setCents(0);
    return true;
  };

  const charge = () => {
    if (cents > 0 && !commit()) return;
    onCharge();
  };

  return (
    <div
      className="grid min-h-0 flex-1 grid-cols-2 bg-surface-card"
      data-testid="kiosk-keypad-face"
    >
      {/* LEFT — Keypad */}
      <section
        aria-label="Keypad"
        className="flex min-h-0 flex-col justify-center overflow-y-auto border-r border-border-hairline px-6 py-6"
      >
        <KioskAmountKeypad cents={cents} onChange={setCents} onAdd={commit} label="Keypad" slab />
      </section>

      {/* RIGHT — Current sale */}
      <section aria-label="Current sale" className="flex min-h-0 flex-col">
        <KioskStepTitleRow
          title="Current sale"
          count={itemCount}
          totalCents={money.totalCents}
          testId="kiosk-keypad-sale-total"
        />
        <KioskCartLineList
          ariaLabel="Current sale items"
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
        />
        <div className={cn('shrink-0 px-4', ACTION_DOCK_TOP_GAP, ACTION_DOCK_LIFT)}>
          <Button
            size="lg"
            className={cn(KIOSK_POS_CTA, 'md:max-w-none')}
            disabled={chargeCents === 0 && session.lines.length === 0}
            onClick={charge}
            data-testid="kiosk-keypad-charge"
          >
            Charge {formatCartCents(chargeCents)}
          </Button>
        </div>
      </section>
    </div>
  );
}
