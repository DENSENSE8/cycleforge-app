'use client';

/**
 * KioskKeypadFace — Square's Keypad, two columns, no progress band.
 *
 * Operator 2026-09-24: *"the keypad custom price should look exactly like
 * square … it would display the cart on the side on the right side it would
 * be the keypad on the left side and automatically adding to the cart display
 * on the right side so two columns exactly like square no progress bar with a
 * pay button bottom right"*.
 *
 * Square Support, "Process custom sale amounts": tap **Keypad** and enter a
 * custom amount; tap the **(+)** icon to add a separate custom amount; from
 * the **Current sale** screen tap **Custom Amount** to adjust it (Comp Item /
 * Remove Item); tap **Charge** to complete the transaction.
 *
 *   LEFT   amount · `1-9 C 0 +` as one bounded block of square keys, edge
 *          to edge (no gaps to mis-touch). `+` lands the amount on the cart
 *          at once as a `Custom Amount` line and resets to $0.00. No title or
 *          note field above the pad (operator 2026-09-24) — a note is added
 *          afterwards from the line's editor.
 *   RIGHT  `Current sale` — the ONE cart's list (`KioskCartLineList`, the same
 *          cards, editor and remove as the cart) under the cart's `N · $total`
 *          header, and a full-width `Charge $X` key pinned bottom-right.
 *
 * Charge commits any pending amount, then hands off to the existing checkout
 * (`onCharge`); money only ever moves through `KioskCartLedger`.
 *
 * No PIN per line: a keypad amount has no catalog price to deviate from, so
 * `verifyLinePrices` accepts it unapproved (operator decision 2026-09-24).
 *
 * In Repair a keypad line is a device priced by hand; it lands as
 * `Custom Amount` and the repair stepper runs from Charge.
 *
 * Callers: `KioskShell`. Affected API: none (lines submit via `/api/kiosk/intake`).
 * Schemas: `counter_session_lines` via the kiosk session store.
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
        <div className="shrink-0 border-t border-border-hairline p-4">
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
