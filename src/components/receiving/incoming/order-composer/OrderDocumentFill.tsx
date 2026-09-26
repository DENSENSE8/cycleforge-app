'use client';

/**
 * Purchase-order section: fill the draft from an order document. Paste the
 * confirmation text or screenshots (or attach them), then Fill fields reads
 * them through `extract-po` and hands the draft back to the composer.
 */

import { useCallback, useRef, useState, type ClipboardEvent } from 'react';
import { ImagePlus, Sparkles, X } from '@/components/Icons';
import { postPoIntakeExtract, readFileAsDataUrl } from '@/lib/inbound/po-intake-client';
import type { PoIntakeDraft } from '@/lib/inbound/po-intake-draft';
import { toast } from '@/lib/toast';
import {
  ComposerButton,
  ComposerIconButton,
  ComposerSection,
  ComposerStatus,
  ComposerTextArea,
} from './receiving-order-composer-parts';

const MAX_DOCUMENT_IMAGES = 8;

type DocumentImage = { name: string; dataUrl: string };

export function OrderDocumentFill({ onFilled }: { onFilled: (draft: PoIntakeDraft) => void }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<DocumentImage[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    try {
      const result = await postPoIntakeExtract({
        text,
        imageDataUrl: images[0]?.dataUrl ?? null,
        imageDataUrls: images.map((image) => image.dataUrl),
      });
      onFilled(result.draft);
      setText('');
      setImages([]);
      toast.message(result.ready ? 'Order filled — review and add it' : result.missing_prompt || 'Filled what the document showed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extract failed';
      setError(message);
      toast.error(message);
    } finally {
      setExtracting(false);
    }
  }, [images, onFilled, text]);

  const empty = !text.trim() && images.length === 0;

  return (
    <ComposerSection
      label="Fill from order document"
      trailing={
        <ComposerButton tone="ghost" icon={<ImagePlus className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>
          Attach screenshot
        </ComposerButton>
      }
    >
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
      <ComposerTextArea
        aria-label="Order document text"
        placeholder="Paste the order confirmation text or a screenshot here"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onPaste={onPaste}
      />
      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Attached screenshots">
          {images.map((image, index) => (
            <li key={`${image.name}:${index}`} className="flex items-start border border-mode-rule">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data-URL preview */}
              <img src={image.dataUrl} alt={image.name} className="h-16 w-16 object-cover" />
              <ComposerIconButton
                label={`Remove ${image.name}`}
                icon={<X className="h-3 w-3" />}
                onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-3">
        {error ? <ComposerStatus tone="error">{error}</ComposerStatus> : <span className="flex-1" />}
        <ComposerButton
          icon={<Sparkles className="h-3.5 w-3.5" />}
          busy={extracting}
          disabled={empty}
          onClick={() => void fill()}
        >
          {extracting ? 'Reading document…' : 'Fill fields'}
        </ComposerButton>
      </div>
    </ComposerSection>
  );
}
