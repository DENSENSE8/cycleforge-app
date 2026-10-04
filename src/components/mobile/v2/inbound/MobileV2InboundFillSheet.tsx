'use client';

/**
 * Fast fill — paste an order confirmation or photograph a receipt; the server
 * reads it into an inbound-order draft (POST /api/receiving/inbound/extract-po,
 * `extract-po-llm`) and the sheet shows what it read. "Use these details"
 * pre-fills the form for the operator to check; nothing ever lands from here.
 */

import { useRef, useState } from 'react';
import { Camera, Check, ClipboardPaste, X } from '@/components/Icons';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import { MobileNativePhotoInput } from '@/components/mobile/photos/MobileNativePhotoCapture';
import type { DetailDockVerb } from '@/design-system/components/DetailDock';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { Button, TextField } from '@/design-system/primitives';
import { formatInboundMoney, inboundLineName } from '@/lib/inbound/inbound-order-compose';
import {
  canonicalInboundTracking,
  filledInboundLines,
  inboundOrderMissing,
  inboundOrderMissingSentence,
  type InboundOrderDraft,
  type InboundOrderType,
} from '@/lib/inbound/inbound-order-draft';
import { postInboundOrderExtract, readFileAsDataUrl } from '@/lib/inbound/inbound-order-client';

type FillVerb = 'photo' | 'read' | 'again' | 'use';

export function MobileV2InboundFillSheet({
  open,
  type,
  onUse,
  onClose,
}: {
  open: boolean;
  type: InboundOrderType;
  /** The read draft, handed to the form for the operator to confirm. */
  onUse: (draft: InboundOrderDraft) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<InboundOrderDraft | null>(null);

  const readIt = async () => {
    setReading(true);
    setError(null);
    try {
      const imageDataUrls = await Promise.all(photos.map(readFileAsDataUrl));
      setRead(await postInboundOrderExtract({ type, text, imageDataUrls }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that');
    } finally {
      setReading(false);
    }
  };

  const verbs: DetailDockVerb<FillVerb>[] = read
    ? [
        { id: 'again', label: 'Try again', icon: <X />, testId: 'm-inbound-fill-again' },
        { id: 'use', label: 'Use these details', icon: <Check />, primary: true, testId: 'm-inbound-fill-use' },
      ]
    : [
        { id: 'photo', label: photos.length ? `Add photo · ${photos.length}` : 'Take photo', icon: <Camera />, testId: 'm-inbound-fill-photo' },
        {
          id: 'read',
          label: 'Read it',
          icon: <ClipboardPaste />,
          primary: true,
          disabled: !text.trim() && photos.length === 0,
          loading: reading,
          testId: 'm-inbound-fill-read',
        },
      ];

  const onVerb = (verb: FillVerb) => {
    if (verb === 'photo') fileRef.current?.click();
    else if (verb === 'read') return readIt();
    else if (verb === 'again') setRead(null);
    else if (read) {
      onUse(read);
      onClose();
    }
  };

  const lines = read ? filledInboundLines(read) : [];
  const tracking = read ? canonicalInboundTracking(read) : [];
  const missing = read ? inboundOrderMissing(read) : [];

  return (
    <MobileV2ActionSheet
      open={open}
      onClose={onClose}
      title={read ? 'Check what was read' : 'Paste or photo'}
      description={read ? 'Nothing lands until you add the order from the form.' : 'An order confirmation, invoice or receipt — pasted text, photos, or both.'}
      verbs={verbs}
      onVerb={onVerb}
      dockLabel="Fill actions"
      testId="m-inbound-fill-sheet"
    >
      <MobileNativePhotoInput
        ref={fileRef}
        multiple
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'));
          setPhotos((prior) => [...prior, ...picked]);
          event.target.value = '';
        }}
      />
      {read ? (
        <div data-testid="m-inbound-fill-review">
          <dl className="text-role-body">
            {[
              ['Platform', read.platform || '—'],
              ['Order #', read.orderNumber || '—'],
              ['Vendor', read.vendor || '—'],
              ['Tracking', tracking.map((t) => t.number).join(', ') || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-mode-rule px-mode-page py-2.5">
                <dt className="shrink-0 text-text-muted">{label}</dt>
                <dd className="min-w-0 break-all text-right font-mono text-text-default">{value}</dd>
              </div>
            ))}
          </dl>
          <MobileRecordCardList label={`Items · ${lines.length}`}>
            {lines.map((line, index) => (
              <MobileRecordCard
                key={`${line.lineKey}:${index}`}
                identity={`Item ${index + 1}`}
                title={inboundLineName(line)}
                facts={line.sku.trim() && line.title.trim() ? [{ label: 'SKU', value: line.sku.trim() }] : undefined}
                count={line.quantity == null ? 'Qty needed' : `Qty ${line.quantity}`}
                amount={line.unitCostCents != null ? formatInboundMoney(line.unitCostCents, read.currency) : null}
                testId={`m-inbound-fill-line-${index}`}
              />
            ))}
          </MobileRecordCardList>
          {missing.length ? (
            <p className="break-words px-mode-page py-2.5 text-role-caption text-text-warning">{inboundOrderMissingSentence(missing)} Fill it in on the form.</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-mode-page py-3">
          <TextField
            label="Paste the order text"
            value={text}
            multiline
            rows={6}
            onChange={setText}
            data-testid="m-inbound-fill-text"
          />
          {photos.length ? (
            <div className="flex items-center justify-between gap-2 text-role-caption text-text-muted">
              <span>
                {photos.length} photo{photos.length === 1 ? '' : 's'} ready
              </span>
              <Button variant="secondary" size="sm" icon={<X />} onClick={() => setPhotos([])}>
                Clear photos
              </Button>
            </div>
          ) : null}
          {error ? <p className="text-role-caption text-text-danger">{error}</p> : null}
        </div>
      )}
    </MobileV2ActionSheet>
  );
}
