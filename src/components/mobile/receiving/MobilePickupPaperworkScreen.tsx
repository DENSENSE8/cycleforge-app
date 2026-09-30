'use client';

/**
 * `/m/receiving/pickup/new` — the phone's camera door for local-pickup
 * paperwork. Photograph the paperwork → the server reads it into a PICKUP
 * draft (POST /api/receiving/inbound/extract-po) → review what it read →
 * land it through the same writer as the desk form
 * (POST /api/receiving/inbound/orders). Editing a draft field by field is the
 * desk's job (`/incoming/new?type=PICKUP`); the phone captures and lands.
 */

import { useCallback, useRef, useState } from 'react';
import { Camera, Check } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import {
  inboundOrderMissing,
  inboundOrderMissingSentence,
  type InboundOrderDraft,
} from '@/lib/inbound/inbound-order-draft';
import { postInboundOrder, postInboundOrderExtract, readFileAsDataUrl } from '@/lib/inbound/inbound-order-client';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { formatCostCents } from '@/lib/inbound/po-import-draft';
import { printReceivingLineLabelsByIds } from '@/lib/receiving/print-receiving-line-labels';

interface Landed {
  orderNumber: string;
  lineCount: number;
  lineIds: number[];
  expectedUnits: number;
  expectedUnitsByLine: Record<number, number>;
  unchanged: boolean;
}

export function MobilePickupPaperworkScreen() {
  const fileRef = useRef<HTMLInputElement>(null);
  const idempotencyKey = useRef(safeRandomUUID());
  const [draft, setDraft] = useState<InboundOrderDraft | null>(null);
  const [reading, setReading] = useState(false);
  const [landing, setLanding] = useState(false);
  const [landed, setLanded] = useState<Landed | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printResult, setPrintResult] = useState<{ printed: number; failedUnits: number } | null>(null);

  const read = useCallback(async (files: readonly File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;
    setReading(true);
    try {
      const imageDataUrls = await Promise.all(images.map(readFileAsDataUrl));
      setDraft(await postInboundOrderExtract({ type: 'PICKUP', imageDataUrls }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read the paperwork');
    } finally {
      setReading(false);
    }
  }, []);

  const land = useCallback(async () => {
    if (!draft) return;
    setLanding(true);
    try {
      const { result } = await postInboundOrder(draft, idempotencyKey.current);
      setLanded({
        orderNumber: result.identity.externalOrderId,
        lineCount: result.lines.length,
        lineIds: result.lines.map((line) => line.receivingLineId),
        expectedUnits: draft.lines.reduce((total, line) => total + Math.max(0, Number(line.quantity) || 0), 0),
        expectedUnitsByLine: Object.fromEntries(result.lines.map((line) => [
          line.receivingLineId,
          Math.max(
            0,
            Number(draft.lines.find((draftLine) => draftLine.lineKey === line.lineKey)?.quantity) || 0,
          ),
        ])),
        unchanged: result.unchanged,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the pickup');
    } finally {
      setLanding(false);
    }
  }, [draft]);

  const restart = useCallback(() => {
    idempotencyKey.current = safeRandomUUID();
    setDraft(null);
    setLanded(null);
    setPrintResult(null);
  }, []);

  const printLabels = useCallback(async () => {
    if (!landed || printing) return;
    setPrinting(true);
    try {
      const result = await printReceivingLineLabelsByIds(landed.lineIds);
      setPrintResult({
        printed: result.printed,
        failedUnits: result.failedLineIds.reduce(
          (total, lineId) => total + (landed.expectedUnitsByLine[lineId] ?? 0),
          0,
        ),
      });
    } finally {
      setPrinting(false);
    }
  }, [landed, printing]);

  const missing = draft ? inboundOrderMissing(draft) : [];
  const lines = draft?.lines.filter((line) => line.sku.trim() || line.title.trim()) ?? [];
  const paidCents = draft?.pickup?.paidCents ?? null;

  return (
    <div className="flex min-h-full flex-col">
      <MobileDetailTopBar title="Pickup paperwork" subtitle={draft?.orderNumber || 'Photograph the paperwork'} backHref="/m/receiving/pickup" />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(event) => {
          void read(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {landed ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-role-body text-text-default">
              <Check className="h-4 w-4" /> Pickup <span className="font-mono">{landed.orderNumber}</span> is on Incoming
            </p>
            <p className="text-role-caption text-text-muted">
              {landed.lineCount} line{landed.lineCount === 1 ? '' : 's'}
              {landed.expectedUnits > 0 ? ` · ${landed.expectedUnits} unit${landed.expectedUnits === 1 ? '' : 's'}` : ''}
              {landed.unchanged ? ' · nothing changed' : ''}
            </p>
            {printResult ? (
              <p className="text-role-caption text-text-muted">
                {printResult.printed} label{printResult.printed === 1 ? '' : 's'} dispatched
                {printResult.failedUnits > 0
                  ? ` · ${printResult.failedUnits} unit${printResult.failedUnits === 1 ? '' : 's'} failed`
                  : ''}
              </p>
            ) : null}
          </div>
        ) : draft ? (
          <dl className="flex flex-col gap-2 text-role-body">
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">Order</dt>
              <dd className="font-mono text-text-default">{draft.orderNumber || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">Seller</dt>
              <dd className="text-text-default">{draft.vendor || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">Pickup date</dt>
              <dd className="text-text-default">{draft.orderDate ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">Paid</dt>
              <dd className="text-text-default">{paidCents == null ? '—' : formatCostCents(paidCents, draft.currency)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-text-muted">Items</dt>
              {lines.length === 0 ? <dd className="text-text-faint">None read</dd> : null}
              {lines.map((line, index) => (
                <dd key={`${line.lineKey}:${index}`} className="flex justify-between gap-3 text-text-default">
                  <span className="truncate">{line.title || line.sku}</span>
                  <span className="shrink-0 font-mono">×{line.quantity ?? '?'}</span>
                </dd>
              ))}
            </div>
            {missing.length > 0 ? <p className="text-role-caption text-text-muted">{inboundOrderMissingSentence(missing)} Finish it on the desk or retake the photo.</p> : null}
          </dl>
        ) : (
          <p className="text-role-body text-text-muted">Take a photo of the local-pickup paperwork; the order is read from it before anything lands.</p>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        {landed ? (
          <>
            <Button variant="primary" loading={printing} onClick={() => void printLabels()}>
              {printResult?.printed
                ? 'Reprint product labels'
                : landed.expectedUnits > 0
                  ? `Print ${landed.expectedUnits} product label${landed.expectedUnits === 1 ? '' : 's'}`
                  : 'Print product labels'}
            </Button>
            <Button variant="secondary" onClick={restart}>
              Next pickup
            </Button>
          </>
        ) : (
          <>
            {draft && missing.length === 0 ? (
              <Button variant="primary" icon={<Check />} loading={landing} onClick={() => void land()}>
                Add to Incoming
              </Button>
            ) : null}
            <Button variant={draft ? 'secondary' : 'primary'} icon={<Camera />} loading={reading} onClick={() => fileRef.current?.click()}>
              {draft ? 'Retake photo' : 'Take photo'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
