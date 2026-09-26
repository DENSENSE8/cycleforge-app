'use client';

import { motion, AnimatePresence } from '@/design-system/motion';
import { ScanSurface } from '@/components/mobile/ScanSurface';
import {
  framerPresenceMobile,
  framerTransitionMobile,
} from '@/design-system/foundations/motion-framer';
import { Button } from '@/design-system/primitives';
import type { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import type { PickTask } from './picker-shared';

/** The current-pick card — bin chip, product title, progressive details, gated scanner. */
export function PickerTaskCard({
  currentTask,
  scanner,
  onDecode,
  scanError,
  detailsExpanded,
  onToggleDetails,
}: {
  currentTask: PickTask;
  scanner: ReturnType<typeof useBarcodeScanner>;
  onDecode: (value: string) => void;
  scanError: string | null;
  detailsExpanded: boolean;
  onToggleDetails: () => void;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.section
        key={currentTask.allocationId}
        initial={framerPresenceMobile.mobileCard.initial}
        animate={framerPresenceMobile.mobileCard.animate}
        exit={framerPresenceMobile.mobileCard.exit}
        transition={framerTransitionMobile.mobileCardMount}
        className="rounded-none border border-border-soft bg-surface-card p-5"
      >
        {/* Bin chip — the thing the worker looks for. */}
        <p className="text-xs font-semibold uppercase tracking-wider text-text-soft">Pick from bin</p>
        <p className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-tight text-text-default">
          {currentTask.bin ?? '—'}
        </p>

        {/* Product — the title only. */}
        <div className="mt-4">
          <p className="line-clamp-3 text-lg font-semibold leading-snug text-text-default">
            {currentTask.productTitle || currentTask.sku}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-none border border-border-soft bg-surface-canvas px-3 py-1 text-sm font-semibold tabular-nums text-text-default">
              Qty {currentTask.plannedQty}
            </span>
          </div>
        </div>

        {/* Progressive disclosure */}
        <Button
          variant="ghost"
          onClick={onToggleDetails}
          iconRight={<span aria-hidden="true">{detailsExpanded ? '▴' : '▾'}</span>}
          className="mt-4 h-auto gap-1 px-0 text-xs text-text-soft"
        >
          {detailsExpanded ? 'Hide details' : 'Show details'}
        </Button>
        <AnimatePresence initial={false}>
          {detailsExpanded && (
            <motion.dl
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="mt-2 grid grid-cols-2 gap-2 overflow-hidden text-xs"
            >
              <div className="rounded-none bg-surface-canvas px-3 py-2">
                <dt className="font-semibold uppercase tracking-wider text-text-soft">Allocation</dt>
                <dd className="mt-0.5 font-mono font-semibold text-text-default">#{currentTask.allocationId}</dd>
              </div>
            </motion.dl>
          )}
        </AnimatePresence>

        {/* Scanner — gated. Hint above tells the picker exactly what to
            aim at; the in-place error appears if a wrong code decodes. */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold text-text-soft">
            Scan to verify, or confirm below{' '}
            <span className="font-mono font-semibold text-text-muted">{currentTask.bin ?? currentTask.sku}</span>
          </p>
          <ScanSurface
            scanner={scanner}
            onDecode={onDecode}
            manualPlaceholder="Type the bin or item code…"
          />
          {scanError && (
            <div
              role="alert"
              className="mt-2 rounded-none border border-border-danger bg-surface-danger px-3 py-2 text-xs font-semibold text-text-danger"
            >
              {scanError}
            </div>
          )}
        </div>
      </motion.section>
    </AnimatePresence>
  );
}
