'use client';

import type { ReactNode } from 'react';
import { FileText } from '@/components/Icons';
import { Spinner } from '@/design-system/primitives';
import { FetchedPdfFrame } from '@/design-system/components/FetchedPdfFrame';
import { cn } from '@/utils/_cn';
import {
  resolveDocumentPreviewMime,
  type DocumentPreviewMimeHint,
} from '@/design-system/components/document-preview-mime';

interface DocumentPreviewFrameProps {
  title: string;
  /** Content URL for iframe / img. Null/undefined → empty or loading. */
  src?: string | null;
  mimeHint?: DocumentPreviewMimeHint;
  loading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  meta?: ReactNode;
  className?: string;
}

/**
 * Shared document canvas — PDF iframe, raster image, or empty/loading.
 * Used inside {@link DocumentSlideOver}; also the SoT for station document previews.
 */
export function DocumentPreviewFrame({
  title,
  src,
  mimeHint,
  loading = false,
  emptyTitle,
  emptyHint,
  meta,
  className,
}: DocumentPreviewFrameProps) {
  const kind = resolveDocumentPreviewMime(src, mimeHint);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      {meta ? (
        <div className="flex shrink-0 items-center justify-end border-b border-border-hairline px-3 py-1.5">
          {meta}
        </div>
      ) : null}
      <div
        className={cn(
          'flex min-h-0 flex-1 overflow-hidden bg-surface-canvas p-3',
          src && kind === 'pdf' ? 'items-stretch' : 'items-center justify-center',
        )}
      >
        {src ? (
          kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary document bytes, not a Next-optimizable asset
            <img
              src={src}
              alt={title}
              className="max-h-full max-w-full rounded-lg border border-border-soft bg-surface-card object-contain"
            />
          ) : (
            <FetchedPdfFrame src={src} title={title} className="rounded-lg border border-border-soft" />
          )
        ) : loading ? (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <Spinner size="md" className="text-text-soft" />
            <p className="text-role-caption font-semibold text-text-soft">Loading document…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <FileText className="h-8 w-8 text-text-faint" />
            <p className="text-role-caption font-semibold text-text-soft">
              {emptyTitle ?? `No ${title.toLowerCase()} attached`}
            </p>
            {emptyHint ? (
              <p className="text-role-eyebrow text-text-faint">{emptyHint}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
