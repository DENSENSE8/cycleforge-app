'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Check, Copy, Loader2, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { copyToClipboard } from '@/utils/_dom';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence } from '@/design-system/foundations/motion-framer-hooks';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';

/** Units Displays leaf — flush serial capture rollup (no WorkspaceCard island). */
export function ShippingCapturedUnits({
  activeOrder,
  onRemoveSerial,
}: {
  activeOrder: ActiveStationOrder;
  onRemoveSerial?: (serial: string, index: number) => Promise<void> | void;
}) {
  const quantity = Math.max(1, Number(activeOrder.quantity) || 1);
  // Serial rows rise in (stationSerialRow) — never a left→right wipe. Height
  // collapse stays so vacated gaps close cleanly on remove.
  const rowPresence = useMotionPresence(framerPresence.stationSerialRow);
  const [lastAddedSerial, setLastAddedSerial] = useState<string | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [serialError, setSerialError] = useState<string | null>(null);
  const prevTrackingRef = useRef(activeOrder.tracking);
  const prevSerialCountRef = useRef(activeOrder.serialNumbers.length);

  useEffect(() => {
    if (prevTrackingRef.current !== activeOrder.tracking) {
      prevTrackingRef.current = activeOrder.tracking;
      prevSerialCountRef.current = activeOrder.serialNumbers.length;
      setLastAddedSerial(null);
      return;
    }
    const prev = prevSerialCountRef.current;
    const current = activeOrder.serialNumbers.length;
    if (current > prev) {
      const newSerial = activeOrder.serialNumbers[current - 1];
      setLastAddedSerial(newSerial);
      const timer = setTimeout(() => setLastAddedSerial(null), 1800);
      prevSerialCountRef.current = current;
      return () => clearTimeout(timer);
    }
    prevSerialCountRef.current = current;
  }, [activeOrder.serialNumbers, activeOrder.tracking]);

  const handleRemoveSerial = async (serial: string, index: number) => {
    if (!onRemoveSerial || removingKey) return;
    setSerialError(null);
    const key = `${serial}-${index}`;
    setRemovingKey(key);
    try {
      await onRemoveSerial(serial, index);
    } catch (error) {
      setSerialError(error instanceof Error ? error.message : 'Failed to remove serial');
    } finally {
      setRemovingKey(null);
    }
  };

  return (
    <div className="min-w-0 border-b border-border-soft bg-surface-card">
      <div className="border-b border-border-hairline px-3 py-2">
        <p className="text-role-eyebrow uppercase tracking-wider text-emerald-700">
          {activeOrder.serialNumbers.length}
          {quantity > 1 ? ` / ${quantity}` : ''} captured
        </p>
      </div>
      <div className="max-h-64 divide-y divide-border-hairline overflow-y-auto">
        <AnimatePresence initial={false}>
          {activeOrder.serialNumbers.map((sn, index) => {
            const isNew = sn === lastAddedSerial;
            const isRemoving = removingKey === `${sn}-${index}`;
            return (
              <motion.div
                key={`${sn}-${index}`}
                initial={{ ...rowPresence.initial, height: 0 }}
                animate={{ ...rowPresence.animate, height: 'auto' }}
                exit={{ ...rowPresence.exit, height: 0 }}
                transition={framerTransition.stationSerialRow}
                className={`flex items-center gap-2 px-3 py-2 transition-colors duration-500 ${
                  isNew ? 'bg-surface-sunken' : 'bg-surface-card'
                }`}
              >
                <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />
                <span className="flex-1 font-mono text-xs font-semibold text-emerald-700">{sn}</span>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <AnimatePresence>
                    {isNew ? (
                      <motion.span
                        initial={framerPresence.stationAddedBadge.initial}
                        animate={framerPresence.stationAddedBadge.animate}
                        exit={framerPresence.stationAddedBadge.exit}
                        transition={framerTransition.stationAddedBadge}
                        className="text-role-eyebrow uppercase tracking-wider text-emerald-600"
                      >
                        ✓ Added
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                  <HoverTooltip label={copiedKey === `${sn}-${index}` ? 'Copied' : `Copy serial ${sn}`} asChild>
                    <IconButton
                      size="md"
                      icon={
                        copiedKey === `${sn}-${index}` ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )
                      }
                      onClick={() => {
                        void copyToClipboard(sn, {
                          historyKind: 'serial',
                          historyDisplay: sn,
                        }).then((ok) => {
                          if (!ok) return;
                          const key = `${sn}-${index}`;
                          setCopiedKey(key);
                          window.setTimeout(() => {
                            setCopiedKey((current) => (current === key ? null : current));
                          }, 1400);
                        });
                      }}
                      ariaLabel={`Copy serial ${sn}`}
                      className="text-text-muted hover:bg-surface-hover hover:text-text-default"
                    />
                  </HoverTooltip>
                  {onRemoveSerial ? (
                    <HoverTooltip label={`Remove serial ${sn}`} asChild>
                      <IconButton
                        size="md"
                        icon={
                          isRemoving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )
                        }
                        onClick={() => void handleRemoveSerial(sn, index)}
                        disabled={Boolean(removingKey)}
                        ariaLabel={`Remove serial ${sn}`}
                        className="text-text-muted hover:bg-rose-50 hover:text-rose-600"
                      />
                    </HoverTooltip>
                  ) : null}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      {serialError ? (
        <p className="px-3 py-2 text-role-micro text-red-600">{serialError}</p>
      ) : null}
    </div>
  );
}
