'use client';

import { FileText } from '@/components/Icons';
import { Spinner } from '@/design-system/primitives';
import { useFetchedDocumentObjectUrl } from '@/hooks/useFetchedDocumentObjectUrl';
import { cn } from '@/utils/_cn';

/**
 * PDF canvas that paints. Fetches bytes, then iframes a `blob:` URL so Chrome's
 * viewer is not pointed at a hanging stream or a Vercel Blob CSP.
 */
export function FetchedPdfFrame({
  src,
  title,
  className,
}: {
  src: string;
  title: string;
  className?: string;
}) {
  const { url, loading, error } = useFetchedDocumentObjectUrl(src);

  if (loading) {
    return (
      <div className={cn('flex h-full min-h-0 w-full items-center justify-center', className)}>
        <Spinner size="md" className="text-text-faint" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div
        className={cn(
          'flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 px-8 text-center',
          className,
        )}
      >
        <FileText className="h-8 w-8 text-text-faint" />
        <p className="text-role-caption font-semibold text-text-soft">{error || 'Could not load file'}</p>
        <a
          href={src.split('#')[0]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-role-caption font-semibold text-text-link hover:underline"
        >
          Open in a new tab
        </a>
      </div>
    );
  }

  return (
    <iframe
      src={`${url}#toolbar=1&navpanes=0`}
      title={title}
      className={cn('h-full min-h-0 w-full border-0 bg-surface-card', className)}
    />
  );
}
