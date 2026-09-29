'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssistantAttachment } from '@/lib/assistant/context-store';

/**
 * Files dropped on (or picked into) the AI composer. Each becomes a durable
 * unlinked attachment; the chat route reads it through the shared local OCR
 * service and sends only the derived transcript to the chat model. The
 * message carries a stored row id, never caller-supplied bytes or OCR text.
 */

export type ComposerAttachmentStatus = 'uploading' | 'uploaded' | 'error';

export interface ComposerAttachment {
  key: string;
  name: string;
  mime: string;
  size: number;
  status: ComposerAttachmentStatus;
  /** 0–1 while uploading. */
  progress: number;
  manualId: number | null;
  error: string | null;
}

/** The kinds the manual store keeps and prints: PDF, Word (converted), images. */
const ACCEPTED = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/(png|jpe?g|webp))$/;
const ACCEPTED_EXT = /\.(pdf|docx?|png|jpe?g|webp)$/i;
export const COMPOSER_ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp';
const MAX_BYTES = 50 * 1024 * 1024;

export function useComposerAttachments() {
  const [items, setItems] = useState<ComposerAttachment[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const xhrs = useRef(new Map<string, XMLHttpRequest>());
  const seq = useRef(0);

  const patch = useCallback((key: string, next: Partial<ComposerAttachment>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...next } : it)));
  }, []);

  const upload = useCallback(
    (key: string, file: File) => {
      const xhr = new XMLHttpRequest();
      xhrs.current.set(key, xhr);
      const form = new FormData();
      form.append('file', file);
      form.append('displayName', file.name.replace(/\.[a-z0-9]+$/i, ''));
      form.append('type', 'assistant_attachment');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) patch(key, { progress: e.loaded / e.total });
      };
      xhr.onload = () => {
        xhrs.current.delete(key);
        let body: { success?: boolean; error?: string; manual?: { id?: number } } | null = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* non-JSON error page */
        }
        const id = Number(body?.manual?.id);
        if (xhr.status >= 200 && xhr.status < 300 && body?.success && id > 0) {
          patch(key, { status: 'uploaded', progress: 1, manualId: id });
        } else {
          patch(key, { status: 'error', error: body?.error || `Upload failed (${xhr.status})` });
        }
      };
      xhr.onerror = () => {
        xhrs.current.delete(key);
        patch(key, { status: 'error', error: 'Upload failed — network error' });
      };
      xhr.open('POST', '/api/product-manuals/upload');
      xhr.send(form);
    },
    [patch],
  );

  const add = useCallback(
    (files: Iterable<File>) => {
      const next: ComposerAttachment[] = [];
      for (const file of files) {
        seq.current += 1;
        const key = `att-${seq.current}`;
        const accepted = ACCEPTED.test(file.type) || ACCEPTED_EXT.test(file.name);
        const error = !accepted
          ? 'Only PDF, Word or image files'
          : file.size === 0
            ? 'File is empty'
            : file.size > MAX_BYTES
              ? 'Over 50 MB'
              : null;
        next.push({
          key,
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          status: error ? 'error' : 'uploading',
          progress: 0,
          manualId: null,
          error,
        });
        if (!error) upload(key, file);
      }
      if (next.length > 0) setItems((prev) => [...prev, ...next]);
    },
    [upload],
  );

  const remove = useCallback((key: string) => {
    xhrs.current.get(key)?.abort();
    xhrs.current.delete(key);
    // Uploaded but never sent: the library row goes back out.
    const gone = itemsRef.current.find((it) => it.key === key);
    if (gone?.manualId) void fetch(`/api/product-manuals?id=${gone.manualId}`, { method: 'DELETE' }).catch(() => {});
    setItems((prev) => prev.filter((it) => it.key !== key));
  }, []);
  const clear = useCallback(() => setItems([]), []);

  useEffect(() => {
    const live = xhrs.current;
    return () => {
      for (const xhr of live.values()) xhr.abort();
    };
  }, []);

  const ready = useMemo<AssistantAttachment[]>(
    () =>
      items
        .filter((it) => it.status === 'uploaded' && it.manualId)
        .map((it) => ({ id: it.manualId!, kind: 'product_manual', name: it.name, mime: it.mime })),
    [items],
  );

  return { items, add, remove, clear, ready, uploading: items.some((it) => it.status === 'uploading') };
}
