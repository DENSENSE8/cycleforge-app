'use client';

/**
 * Inbound-order section: fill the form from an order document. Paste the
 * confirmation text or screenshots (or attach them); Fill fields reads them
 * through `extract-po` and hands back an InboundOrderDraft to review — nothing
 * lands until the operator adds it.
 */

import { useCallback, useRef, useState, type ClipboardEvent } from 'react';
import { ImagePlus, Sparkles, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { TRIAGE_PANEL_INNER_CORNER } from '@/design-system/tokens/triage-panel';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { postInboundOrderExtract, readFileAsDataUrl } from '@/lib/inbound/inbound-order-client';
import type { InboundOrderDraft, InboundOrderType } from '@/lib/inbound/inbound-order-draft';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const MAX_DOCUMENT_IMAGES = 6;

type DocumentImage = { name: string; dataUrl: string };

export function OrderDocumentFill({
  currentType,
  onFilled,
}: {
  currentType: InboundOrderType;
  onFilled: (draft: InboundOrderDraft) => void;
}) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<DocumentImage[]>([]);
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addImages = useCallback(async (files: readonly File[]) => {
    const picked = files.filter((file) => file.type.startsWith('image/'));
    if (picked.length === 0) return;
    try {
      const encoded = await Promise.all(
        picked.map(async (file) => ({ name: file.name || 'screenshot.png', dataUrl: await readFileAsDataUrl(file) })),
      );
      setImages((current) => [...current, ...encoded].slice(0, MAX_DOCUMENT_IMAGES));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read image');
    }
  }, []);

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.clipboardData.files);
      if (!files.some((file) => file.type.startsWith('image/'))) return;
      event.preventDefault();
      void addImages(files);
    },
    [addImages],
  );

  const fill = useCallback(async () => {
    setExtracting(true);
    try {
      const draft = await postInboundOrderExtract({ text, imageDataUrls: images.map((image) => image.dataUrl) });
      onFilled({ ...draft, type: currentType });
      setText('');
      setImages([]);
      toast.message('Filled from the document — review, then add it');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read the document');
    } finally {
      setExtracting(false);
    }
  }, [currentType, images, onFilled, text]);

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          void addImages(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <textarea
        aria-label="Order document text"
        placeholder="Paste the order confirmation text or a screenshot here"
        value={text}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        onPaste={onPaste}
        className={cn(
          'w-full resize-y border border-border-soft bg-surface-card px-3 py-2 text-sm text-text-default placeholder:text-text-faint',
          TRIAGE_PANEL_INNER_CORNER,
          focusRing('field'),
        )}
      />
      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Attached screenshots">
          {images.map((image, index) => (
            <li key={`${image.name}:${index}`} className={cn('flex items-start border border-border-soft', TRIAGE_PANEL_INNER_CORNER)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local data-URL preview */}
              <img src={image.dataUrl} alt={image.name} className="h-16 w-16 object-cover" />
              <IconButton
                size="xs"
                icon={<X className="h-3 w-3" />}
                ariaLabel={`Remove ${image.name}`}
                onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" icon={<ImagePlus />} onClick={() => fileRef.current?.click()}>
          Attach screenshot
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Sparkles />}
          loading={extracting}
          disabled={!text.trim() && images.length === 0}
          onClick={() => void fill()}
        >
          Fill fields
        </Button>
      </div>
    </div>
  );
}
