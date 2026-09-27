'use client';

/**
 * Files on the AI composer: the drop zone around the field and the chips
 * above it (progress → uploaded / error, removable). The "+" menu's Attach
 * file is the no-drag path. The state lives in `useComposerAttachments`.
 */

import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { AlertCircle, Check, FileText, Loader2, Paperclip, X } from '@/components/Icons';
import { AI_FOCUS_CLASS, AI_ICON_BUTTON_CLASS, aiPresence, aiTransition, useMotionPresence, useMotionTransition } from '@/design-system/ai';
import { AnimatePresence, motion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import type { ComposerAttachment } from './useComposerAttachments';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

export function ComposerDropzone({
  items,
  onFiles,
  onRemove,
  children,
}: {
  items: readonly ComposerAttachment[];
  onFiles: (files: File[]) => void;
  onRemove: (key: string) => void;
  children: ReactNode;
}) {
  // Enter/leave fire for every child the drag crosses; count, don't toggle.
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const fade = useMotionPresence(aiPresence.fade);
  const chip = useMotionPresence(aiPresence.chips);
  const fadeTransition = useMotionTransition(aiTransition.fade);
  const chipTransition = useMotionTransition(aiTransition.morph);

  return (
    <div
      className="relative"
      data-testid="composer-dropzone"
      data-drop-active={over || undefined}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      }}
    >
      <AnimatePresence initial={false}>
        {items.length > 0 ? (
          <motion.ul
            key="chips"
            {...fade}
            transition={fadeTransition}
            className="mb-2 flex flex-wrap gap-1.5"
            aria-label="Attached files"
            data-testid="composer-attachments"
          >
            <AnimatePresence initial={false}>
              {items.map((it) => (
                <motion.li key={it.key} layout {...chip} transition={chipTransition}>
                  <AttachmentChip item={it} onRemove={() => onRemove(it.key)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        ) : null}
      </AnimatePresence>
      {children}
      <AnimatePresence>
        {over ? (
          <motion.div
            key="drop"
            {...fade}
            transition={fadeTransition}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-ai-composer border-2 border-dashed border-ai-line-strong bg-ai-surface/90 text-ai-prose text-ai-ink"
            data-testid="composer-drop-overlay"
          >
            <span className="inline-flex items-center gap-2">
              <Paperclip className="h-4 w-4" /> Drop to attach — PDF, Word or image
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AttachmentChip({ item, onRemove }: { item: ComposerAttachment; onRemove: () => void }) {
  const pct = Math.round(item.progress * 100);
  return (
    <div
      className={cn(
        'relative flex h-9 max-w-64 items-center gap-2 overflow-hidden rounded-ai-chip border bg-ai-surface pl-2.5 pr-1 text-ai-label',
        item.status === 'error' ? 'border-fill-danger text-ai-ink' : 'border-ai-line text-ai-ink',
      )}
      data-testid="composer-attachment-chip"
      data-status={item.status}
      title={item.error ?? item.name}
    >
      {item.status === 'uploading' ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ai-muted" />
      ) : item.status === 'uploaded' ? (
        <FileText className="h-3.5 w-3.5 shrink-0 text-ai-muted" />
      ) : (
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-fill-danger" />
      )}
      <span className="min-w-0 truncate">{item.name}</span>
      <span className="shrink-0 tabular-nums text-ai-faint" aria-live="polite">
        {item.status === 'uploading' ? (
          `${pct}%`
        ) : item.status === 'uploaded' ? (
          <span className="inline-flex items-center gap-0.5">
            <Check className="h-3 w-3" /> Uploaded
          </span>
        ) : (
          item.error
        )}
      </span>
      <button
        type="button"
        aria-label={`Remove ${item.name}`}
        onClick={onRemove}
        className={cn('ds-raw-button h-7 w-7', AI_ICON_BUTTON_CLASS, AI_FOCUS_CLASS)}
      >
        <X className="h-3 w-3" />
      </button>
      {item.status === 'uploading' ? (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-ai-line">
          <span className="block h-full bg-ai-muted transition-[width] duration-150" style={{ width: `${pct}%` }} />
        </span>
      ) : null}
    </div>
  );
}
