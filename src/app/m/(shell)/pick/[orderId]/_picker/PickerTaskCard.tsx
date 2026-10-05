'use client';

import { motion, AnimatePresence } from '@/design-system/motion';
import { ScanSurface } from '@/components/mobile/ScanSurface';
import { Collapse } from '@/design-system/components/Collapse';
import {
  motionPresenceMobile,
  motionTransitionMobile,
} from '@/design-system/foundations/motion-presets';
import { Button } from '@/design-system/primitives';
import { Badge } from '@/components/ui/badge';
import { cornerClass, TRIAGE_PANEL_INNER_CORNER } from '@/design-system/tokens/radius';
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
  // The scanner sits OUTSIDE the per-task keyed block: its <video> must stay the
  // same element across tasks, or the camera (ZXing stream / the iOS app's lens)
  // stays bound to the previous task's unmounted box.
  return (
    <section className={`${cornerClass('surface')} border border-border-soft bg-surface-card p-5`}>
      <AnimatePresence mode="wait">
      <motion.div
        key={currentTask.allocationId}
        initial={motionPresenceMobile.mobileCard.initial}
        animate={motionPresenceMobile.mobileCard.animate}
        exit={motionPresenceMobile.mobileCard.exit}
        transition={motionTransitionMobile.mobileCardMount}
      >
        {/* Bin chip — the thing the worker looks for. */}
        <p className="text-xs font-semibold text-text-soft">Pick from bin</p>
        <p className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-tight text-text-default">
          {currentTask.bin ?? '—'}
        </p>

        {/* Product — the title only. */}
        <div className="mt-4">
          <p className="line-clamp-3 text-lg font-semibold leading-snug text-text-default">
            {currentTask.productTitle || currentTask.sku}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="px-3 py-1 text-sm tabular-nums text-text-default">
              Qty {currentTask.plannedQty}
            </Badge>
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
        <Collapse open={detailsExpanded} className="pt-2">
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className={`${TRIAGE_PANEL_INNER_CORNER} bg-surface-canvas px-3 py-2`}>
              <dt className="font-semibold text-text-soft">Allocation</dt>
              <dd className="mt-0.5 font-mono font-semibold text-text-default">#{currentTask.allocationId}</dd>
            </div>
          </dl>
        </Collapse>
      </motion.div>
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
              className={`mt-2 ${TRIAGE_PANEL_INNER_CORNER} border border-border-danger bg-surface-danger px-3 py-2 text-xs font-semibold text-text-danger`}
            >
              {scanError}
            </div>
          )}
        </div>
    </section>
  );
}
