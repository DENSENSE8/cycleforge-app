'use client';

/**
 * Fill from screenshot or text — the Order group's one small action. Paste
 * the order confirmation's text or screenshots (or attach them); Fill fields
 * reads them through `extract-po` and hands back a draft to review. Nothing
 * lands until the operator adds the order.
 */

import { useCallback, useState, type ClipboardEvent } from 'react';
import Image from 'next/image';
import { ImagePlus, Sparkles, X } from '@/components/Icons';
import { PhotoUploadOverlay } from '@/components/shipped/photo-gallery/PhotoUploadOverlay';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { RECORD_RECESS_CLASS } from '@/design-system/tokens/record';
import { postInboundOrderExtract, readFileAsDataUrl } from '@/lib/inbound/inbound-order-client';
import type { InboundOrderDraft, InboundOrderType } from '@/lib/inbound/inbound-order-draft';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const MAX_DOCUMENT_IMAGES = 6;

interface DocumentImage {
  name: string;
  dataUrl: string;
}

export function OrderDocumentFill({
  type,
  onFilled,
}: {
  type: InboundOrderType;
  /** The read draft, for the operator to review in the form. */
  onFilled: (draft: InboundOrderDraft) => void;
}) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<DocumentImage[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [extracting, setExtracting] = useState(false);

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
    (event: ClipboardEvent<HTMLInputElement>) => {
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
      const draft = await postInboundOrderExtract({ type, text, imageDataUrls: images.map((image) => image.dataUrl) });
      onFilled(draft);
      setText('');
      setImages([]);
      toast.message('Filled from the document — review, then add it');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read the document');
    } finally {
      setExtracting(false);
    }
  }, [type, images, onFilled, text]);

  return (
    <div className="flex flex-col gap-3 px-4 pb-4" data-testid="inbound-order-fill">
      <TextField
        label="Paste the order confirmation text or a screenshot"
        value={text}
        multiline
        rows={3}
        onChange={setText}
        onPaste={onPaste}
      />
      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Attached screenshots">
          {images.map((image, index) => (
            <li key={`${image.name}:${index}`} className={cn(RECORD_RECESS_CLASS, 'relative flex size-16 items-start overflow-hidden')}>
              <Image src={image.dataUrl} alt={image.name} fill unoptimized sizes="64px" className="object-cover" />
              <IconButton
                size="xs"
                icon={<X className="h-3 w-3" />}
                ariaLabel={`Remove ${image.name}`}
                onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                className="relative ml-auto bg-surface-card"
              />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" icon={<ImagePlus />} onClick={() => setAttaching(true)}>
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
      <PhotoUploadOverlay
        open={attaching}
        onClose={() => setAttaching(false)}
        onFiles={(files) => {
          setAttaching(false);
          return addImages(files);
        }}
        title="Attach order screenshots"
        subtitle="Drop, paste or choose the confirmation screenshots."
      />
    </div>
  );
}
