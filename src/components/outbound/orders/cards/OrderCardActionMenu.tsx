'use client';

/**
 * One checked order card's actions — the drop-down that opens off the card's
 * right edge (owner 2026-09-27). The triage verbs up top, the record's other
 * actions under "More", Delete last and armed by a first press. A verb that
 * needs a form (Label, Notes, Out of stock, Scan out) morphs the menu into that
 * form, with a back arrow — the list never navigates away.
 */

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, Trash2 } from '@/components/Icons';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import type { RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { OrderRecordMode } from '@/lib/selection-context/order-inspector-context';
import { useOrderCardVerbs } from '@/components/outbound/orders/to-ship/MorphingRowActionMenu';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const ITEM_CLASS = cn(
  'group/verb relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm text-text-default',
  'transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-45',
  focusRing('control'),
);

const SPRING = { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 } as const;

export function OrderCardActionMenu({
  record,
  mode,
  onOpenLabels,
  onDone,
}: {
  record: ShippedOrder;
  mode: OrderRecordMode;
  onOpenLabels?: (record: ShippedOrder) => void;
  /** A verb finished the menu's job (Delete, a submitted form). */
  onDone: () => void;
}) {
  const [display, setDisplay] = useState<{ id: string; label: string; node: ReactNode } | null>(null);
  const [armedDelete, setArmedDelete] = useState(false);
  const verbs = useOrderCardVerbs(record, mode, onOpenLabels, onDone);

  const back = () => setDisplay(null);
  const press = (verb: RecordActionVerb) => {
    if (verb.disabled) return;
    if (verb.display) {
      setDisplay({ id: verb.id, label: verb.label, node: verb.display(back) });
      return;
    }
    void verb.run?.();
  };

  const row = (verb: RecordActionVerb, index: number) => (
    <motion.button
      key={verb.id}
      type="button"
      role="menuitem"
      data-testid={`order-card-verb-${verb.id}`}
      disabled={verb.disabled}
      title={verb.disabled ? verb.disabledReason : undefined}
      aria-pressed={verb.pressed}
      onClick={() => press(verb)}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...SPRING, delay: 0.015 * index }}
      className={ITEM_CLASS}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-5 shrink-0 items-center justify-center text-text-muted transition-transform duration-200 group-hover/verb:scale-110 group-hover/verb:text-text-default [&_svg]:size-4',
          verb.pressed && 'text-text-info',
        )}
      >
        {verb.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{verb.label}</span>
      {verb.hotkey ? (
        <KeyboardKey className="opacity-0 transition-opacity group-hover/verb:opacity-100">{verb.hotkey.toUpperCase()}</KeyboardKey>
      ) : null}
    </motion.button>
  );

  return (
    <div role="menu" aria-label={`Order ${record.order_id || record.id} actions`} className="relative overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        {display ? (
          <motion.div
            key={`display:${display.id}`}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={SPRING}
            className="flex flex-col gap-2 p-1.5"
          >
            <button type="button" onClick={back} className={cn(ITEM_CLASS, 'h-7 text-text-muted')}>
              <ChevronLeft className="size-4" aria-hidden />
              <span className="font-medium text-text-default">{display.label}</span>
            </button>
            <div className="flex min-w-0 flex-wrap items-center gap-2 px-1 pb-1">{display.node}</div>
          </motion.div>
        ) : (
          <motion.div
            key="verbs"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={SPRING}
            className="flex flex-col p-1.5"
          >
            {verbs.quick.map(row)}
            {verbs.more.length > 0 ? (
              <>
                <div className="mx-2 my-1.5 h-px bg-border-hairline" />
                <p className="px-2 pb-1 text-xs font-medium text-text-faint">More</p>
                {verbs.more.map((verb, i) => row(verb, verbs.quick.length + i))}
              </>
            ) : null}
            {verbs.danger ? (
              <>
                <div className="mx-2 my-1.5 h-px bg-border-hairline" />
                <motion.button
                  type="button"
                  role="menuitem"
                  data-testid="order-card-verb-delete"
                  onClick={() => {
                    if (!armedDelete) {
                      setArmedDelete(true);
                      return;
                    }
                    void verbs.danger?.run?.();
                    onDone();
                  }}
                  onBlur={() => setArmedDelete(false)}
                  animate={armedDelete ? { x: [0, -3, 3, -2, 2, 0] } : { x: 0 }}
                  transition={{ duration: 0.32 }}
                  className={cn(
                    ITEM_CLASS,
                    'text-text-danger hover:bg-surface-danger',
                    armedDelete && 'bg-surface-danger font-medium',
                  )}
                >
                  <Trash2 className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{armedDelete ? 'Press again to delete' : 'Delete order'}</span>
                </motion.button>
              </>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
