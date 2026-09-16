'use client';

/**
 * KioskCartLineCard — one cart line as a TOUCH card.
 *
 * Replaces `CompoundRow` on the kiosk cart. That row is the desk compound
 * table (Unbox / Incoming / To-Ship / Tasks share it): a 7-track CSS grid with
 * a select gutter, a dots menu and desk-micro type. On a counter tablet it read
 * as a spreadsheet stretched across the glass — operator 2026-09-14, of the
 * cart panel: *"This is a wrong display. It should display a mobile-like chip
 * display component with a rounded corner radius and kind of pills and
 * buttons."* `SURFACE_LAW` §5 already says it: lists on a phone-shaped surface
 * are cards, never a DataTable.
 *
 * So: a rounded row card (`MOBILE_SCAN_ROW_CORNER`, the same corner the mobile
 * scan rows wear), title + amount on the top line, facts as {@link KioskChip}
 * meta chips under it. The card IS the edit affordance — tap to correct, the
 * gesture the row had. Void stays on the swipe wrapper.
 *
 * FLAT (2026-09-15). This carried `elevationClass('raised','soft')` per line,
 * which was a soft lift on a white card sitting on a white sheet — depth you
 * could not see doing the job a hairline already does. The sheet it sits on was
 * de-shadowed the same day (operator: *"it should not display a depth drop
 * shadow"*), and a blur inside it would be that same popover cue one altitude
 * down. Separation is `border-border-hairline` plus the sunken stage behind the
 * sheet — planes, never blur.
 *
 * Callers: `KioskCartLedger`. Affected API: none.
 * Schemas: `counter_session_lines` via {@link cartLineCardView}.
 */

import { Wrench, ShoppingCart, RefreshCw } from '@/components/Icons';
import { KioskChip } from '@/components/kiosk/KioskChip';
import { cartLineCardView } from '@/lib/kiosk/cart-card-view';
import type { KioskCartLine } from '@/lib/kiosk/cart-line';
import { MOBILE_SCAN_ROW_CORNER } from '@/design-system/tokens/radius';
import { KIOSK_META } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';

/**
 * Line-type glyph + ink, matching the command ink on the mode selector
 * (`KioskServiceTile.iconTone`): repair amber, retail green, buyback blue. A
 * chip states its kind with a glyph AND a colour, never colour alone.
 */
const TYPE_FACE = {
  REPAIR: { Icon: Wrench, tone: 'warning' as const },
  BUYBACK: { Icon: RefreshCw, tone: 'info' as const },
  RETAIL: { Icon: ShoppingCart, tone: 'success' as const },
};

export function KioskCartLineCard({
  line,
  voided = false,
  open = false,
  onOpen,
  readOnly = false,
}: {
  line: KioskCartLine;
  /** `counter_session_lines.voided_at` is set — struck, not gone. */
  voided?: boolean;
  /** This line's editor is showing. */
  open?: boolean;
  onOpen?: () => void;
  /**
   * Customer-facing mount: the same card, no verb. The customer's screen
   * states the line; it never edits it (that is the staff face's job), so the
   * card must not claim a button role it cannot honour.
   */
  readOnly?: boolean;
}) {
  const view = cartLineCardView(line, { voided });
  const face = TYPE_FACE[line.type === 'REPAIR' ? 'REPAIR' : line.type === 'BUYBACK' ? 'BUYBACK' : 'RETAIL'];
  const TypeIcon = face.Icon;
  const interactive = !readOnly && typeof onOpen === 'function';
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-expanded={interactive ? open : undefined}
      aria-label={interactive ? `Cart line ${view.title}` : undefined}
      data-cart-line-id={line.id}
      data-testid="kiosk-cart-line"
      onClick={interactive ? onOpen : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
      className={cn(
        'flex w-full flex-col gap-2 border border-border-hairline bg-surface-card px-4 py-3 text-left',
        MOBILE_SCAN_ROW_CORNER,
        // No elevation here; see the FLAT note in the docblock.
        interactive && 'cursor-pointer transition-colors hover:bg-surface-hover',
        open && 'bg-surface-accent',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-semibold text-text-default',
            view.voided && 'line-through text-text-soft',
          )}
        >
          {view.title}
        </span>
        <span
          className={cn(
            'shrink-0 text-base font-semibold tabular-nums',
            view.credit ? 'text-text-success' : 'text-text-default',
            view.voided && 'line-through text-text-soft',
          )}
        >
          {view.amount}
        </span>
      </div>

      {view.detail ? (
        <p className={cn('truncate', KIOSK_META)}>{view.detail}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <KioskChip
          tone={view.voided ? 'danger' : face.tone}
          icon={<TypeIcon className="h-3.5 w-3.5" />}
        >
          {view.stateLabel}
        </KioskChip>
        {view.unitNote ? <KioskChip>{view.unitNote}</KioskChip> : null}
        {view.primaryId ? <KioskChip>{view.primaryId}</KioskChip> : null}
        {view.secondaryId ? <KioskChip>{view.secondaryId}</KioskChip> : null}
      </div>
    </div>
  );
}
