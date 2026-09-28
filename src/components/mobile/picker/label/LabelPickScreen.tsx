'use client';

/** Label pick — `/m/pick?mode=label`: scan a printed shipping label, pick the order it opens. */

import { useState } from 'react';
import { PackageOpen, RotateCcw, X } from '@/components/Icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DetailFact, DetailFacts, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { IconButton } from '@/design-system/primitives';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';
import { useLabelPick, type LabelPickMessage, type LabelPickSerialRow } from './useLabelPick';

type LabelVerb = 'undo' | 'unpick';

/** A label is scanned once; the same serial twice in a row is a real re-scan only after a beat. */
const LABEL_DEDUP_MS = 1500;

const MESSAGE_VARIANT = {
  error: 'destructive',
  warning: 'warning',
  success: 'success',
  info: 'default',
} as const satisfies Record<LabelPickMessage['tone'], 'destructive' | 'warning' | 'success' | 'default'>;

const SERIAL_STATE_LABEL: Record<LabelPickSerialRow['state'], string> = {
  'to-pick': 'To pick',
  picked: 'Picked',
  scanned: 'Scanned',
};

export function LabelPickScreen() {
  const c = useLabelPick();
  /** The lens is up — the dock then stands alone under the panel instead of framing the Scan bar. */
  const [cameraUp, setCameraUp] = useState(false);
  const { card } = c;

  if (!c.isLoaded || !c.signedIn) return null;

  const qty = Math.max(1, Number(card?.quantity) || 1);
  const toPick = c.serialRows.filter((r) => r.state === 'to-pick').length;
  const scanLabel = c.busy
    ? 'Saving…'
    : !c.live
      ? card
        ? 'Scan label to re-pick'
        : 'Scan label'
      : toPick > 0
        ? `Scan serial · ${toPick} left`
        : 'Scan serial or SKU';

  const verbs: DetailDockVerb<LabelVerb>[] = [
    { id: 'undo', label: 'Undo', icon: <RotateCcw className="h-5 w-5" aria-hidden />, disabled: !c.live || c.busy },
    {
      id: 'unpick',
      label: 'Unpick order',
      icon: <PackageOpen className="h-5 w-5" aria-hidden />,
      disabled: !card?.id || c.busy,
    },
  ];
  const onVerb = (id: LabelVerb) => (id === 'undo' ? c.undo() : c.unpick());

  return (
    <div className={cn('flex h-full flex-col', appMobilePageGroundClass)}>
      <div className="flex-1 overflow-y-auto">
        {!card ? (
          <div className="px-mode-page py-10 text-center">
            <p className="text-role-display text-text-default">Scan a shipping label</p>
            <p className="mt-2 text-role-body text-text-muted">
              The order opens here and is picked. Then scan its serials or SKU codes.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-mode-rule">
            <section aria-label="Product" className="flex items-start gap-3 bg-surface-card px-mode-page py-2">
              <p className="min-w-0 flex-1 break-words text-2xl font-semibold leading-tight text-text-default">
                {card.productTitle}
              </p>
              <p className="shrink-0 font-mono text-2xl font-semibold leading-tight tabular-nums text-text-default">
                ×{qty}
              </p>
            </section>

            <DetailFacts label="Order">
              <DetailFact
                label="Picked"
                value={c.picked ? 'Picked' : 'Not picked'}
                hint={c.picked?.byName ?? (card.orderFound === false ? 'Order not in system' : undefined)}
              />
              <DetailFact label="Order" value={card.orderId} mono copy={card.orderId} />
              <DetailFact label="SKU" value={card.sku} mono copy={card.sku} />
              <DetailFact label="Tracking" value={card.tracking} mono copy={card.tracking} />
              {card.inlineMicrocopy ? <DetailFact label="Note" value={card.inlineMicrocopy} /> : null}
            </DetailFacts>

            <DetailSectionHeading>
              Serials · {card.serialNumbers.length} of {qty} scanned
            </DetailSectionHeading>
            {c.serialRows.length === 0 ? (
              <p className="bg-mode-panel px-mode-page py-2.5 text-role-body text-mode-muted">
                {c.tasksLoading ? 'Loading allocated units…' : 'No unit allocated — scan the serial in hand.'}
              </p>
            ) : (
              <ul aria-label="Serials" className="divide-y divide-mode-rule bg-mode-panel">
                {c.serialRows.map((row) => (
                  <li key={row.serial} className="flex items-baseline justify-between gap-3 px-mode-page py-2.5">
                    <span className="min-w-0 break-all font-mono text-mode-body font-semibold text-mode-ink">
                      {row.serial}
                      {row.bin ? (
                        <span className="ml-2 font-sans text-role-caption font-normal text-mode-muted">{row.bin}</span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 font-mono text-role-caption',
                        row.state === 'to-pick' ? 'text-mode-muted' : 'font-semibold text-text-success',
                      )}
                    >
                      {SERIAL_STATE_LABEL[row.state]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Feedback, right above the thumb. What to do next is the scan bar's own label. */}
      {c.message ? (
        <div className="shrink-0 px-mode-page pb-2">
          <Alert
            variant={MESSAGE_VARIANT[c.message.tone]}
            role={c.message.tone === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className="pr-12"
          >
            <AlertDescription className="text-role-data opacity-100">{c.message.text}</AlertDescription>
            <IconButton
              onClick={c.dismissMessage}
              ariaLabel="Dismiss"
              icon={<X className="h-4 w-4" />}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
            />
          </Alert>
        </div>
      ) : null}

      <MobileCaptureWindow
        label="Label pick camera"
        collapsedLabel={scanLabel}
        status={card ? card.orderId : 'Shipping label'}
        onDecode={c.handleScan}
        pending={c.busy ? 1 : 0}
        dedupMs={LABEL_DEDUP_MS}
        initiallyArmed={false}
        onArmedChange={setCameraUp}
        collapsedFrame={(scan) => (
          <DetailDock label="Label pick actions" verbs={verbs} onVerb={onVerb} size="glove" center={scan} />
        )}
      />
      {cameraUp ? <DetailDock label="Label pick actions" verbs={verbs} onVerb={onVerb} size="glove" /> : null}
    </div>
  );
}
