'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Check, Loader2, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { WorkspaceCard } from '@/design-system/components';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';

/** Units tab — serial capture rollup (runtime tab once serials exist). */
export function ShippingCapturedUnits({
  activeOrder,
  onRemoveSerial,
}: {
  activeOrder: ActiveStationOrder;
  onRemoveSerial?: (serial: string, index: number) => Promise<void> | void;
}) {
  const quantity = Math.max(1, Number(activeOrder.quantity) || 1);
  const [lastAddedSerial, setLastAddedSerial] = useState<string | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
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
    <WorkspaceCard label="Captured units" tone="emerald" bodyClassName="p-3">
      <div className="space-y-2">
        <p className="text-role-eyebrow uppercase tracking-wider text-emerald-700">
          {activeOrder.serialNumbers.length}
          {quantity > 1 ? ` / ${quantity}` : ''} captured
        </p>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          <AnimatePresence initial={false}>
            {activeOrder.serialNumbers.map((sn, index) => {
              const isNew = sn === lastAddedSerial;
              const isRemoving = removingKey === `${sn}-${index}`;
              return (
                <motion.div
                  key={`${sn}-${index}`}
                  initial={{ opacity: 0, x: 24, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  exit={{ opacity: 0, x: -24, height: 0 }}
                  transition={framerTransition.stationSerialRow}
                  className={`flex items-center gap-2 rounded-none border px-3 py-2 transition-colors duration-500 ${
                    isNew
                      ? 'border-emerald-400 bg-emerald-200 shadow-sm'
                      : 'border-emerald-100 bg-surface-card'
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
                    {onRemoveSerial ? (
                      <HoverTooltip label={`Remove serial ${sn}`} asChild>
                        <IconButton
                          icon={
                            isRemoving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <X className="h-3 w-3" />
                            )
                          }
                          onClick={() => void handleRemoveSerial(sn, index)}
                          disabled={Boolean(removingKey)}
                          ariaLabel={`Remove serial ${sn}`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-emerald-500 hover:bg-red-50 hover:text-red-600"
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
          <p className="text-role-micro text-red-600">{serialError}</p>
        ) : null}
      </div>
    </WorkspaceCard>
  );
}
