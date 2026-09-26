'use client';

/** FIND chronology faces — one document, kind-shaped rows, newest-first. */

import Link from 'next/link';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { formatDateTimePST } from '@/utils/date';
import {
  type FindEvent,
  type FindQtyLedger,
} from '@/lib/search/find-dossier-model';

function QtyFace({ qty }: { qty: FindQtyLedger }) {
  const rows: Array<[string, number]> = [];
  if (qty.ordered != null) rows.push(['Ordered', qty.ordered]);
  if (qty.received != null) rows.push(['Received', qty.received]);
  if (qty.packed != null) rows.push(['Packed', qty.packed]);
  if (qty.shipped != null) rows.push(['Shipped', qty.shipped]);
  if (rows.length === 0) return null;
  return (
    <dl className="mt-1 flex min-w-0 flex-wrap gap-x-4 gap-y-1" data-testid="search-find-qty">
      {rows.map(([label, value]) => (
        <span key={label} className="flex shrink-0 items-baseline gap-1.5">
          <dt className="text-role-caption text-text-faint">{label}</dt>
          <dd className="text-role-data text-text-default">{value}</dd>
        </span>
      ))}
    </dl>
  );
}

function BindTags({ event }: { event: FindEvent }) {
  const bind = event.bind;
  if (!bind) return null;
  const parts: Array<[string, string]> = [];
  if (bind.sku) parts.push(['SKU', bind.sku]);
  if (bind.serial) parts.push(['Serial', bind.serial]);
  if (bind.tracking) parts.push(['Tracking', bind.tracking]);
  if (parts.length === 0) return null;
  return (
    <p className="mt-1 min-w-0 text-role-caption" data-testid="search-find-bind">
      {parts.map(([label, value], index) => (
        <span key={label}>
          {index > 0 ? <span className="text-text-faint"> → </span> : null}
          <span className="text-text-faint">{label} </span>
          <span className="text-role-data text-text-default">{value}</span>
        </span>
      ))}
    </p>
  );
}

function EvidenceThumbs({ urls, caption }: { urls: readonly string[]; caption: string }) {
  const gallery = usePhotoGallery({ photos: [...urls] });
  return (
    <>
      <div className="mt-2 flex gap-1.5 overflow-x-auto" data-testid="search-find-evidence">
        {urls.map((url, index) => (
          <button
            key={`${url}:${index}`}
            type="button"
            className={cn(
              'ds-raw-button block shrink-0 overflow-hidden ring-1 ring-inset ring-border-hairline',
              cornerClass('row'),
            )}
            onClick={() => gallery.openViewer(index)}
            aria-label={caption}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-12 w-12 object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      {urls.length > 0 ? <PhotoViewerPortal g={gallery} /> : null}
    </>
  );
}

function FindEventRow({
  event,
  exceptionHref,
  nested,
}: {
  event: FindEvent;
  exceptionHref?: string;
  nested?: boolean;
}) {
  const href = event.href || (event.kind === 'exception' ? exceptionHref : undefined);
  const inner = (
    <>
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <p className="min-w-0 text-role-body text-text-default">{event.title}</p>
        <time className="shrink-0 text-role-caption text-text-faint" dateTime={event.at}>
          {formatDateTimePST(event.at)}
        </time>
      </div>
      {event.actor ? (
        <p className="text-role-caption text-text-soft" data-testid="search-find-actor">
          {event.actor}
        </p>
      ) : null}
      {event.stationCaption ? (
        <p className="text-role-caption text-text-soft">{event.stationCaption}</p>
      ) : null}
      {event.body ? <p className="text-role-caption text-text-soft">{event.body}</p> : null}
      {event.kind === 'qty' && event.qty ? <QtyFace qty={event.qty} /> : null}
      {event.kind === 'exception' ? (
        <p className="text-role-caption text-text-soft">
          {event.resolved ? 'Resolved' : 'Open — handoff to clear'}
        </p>
      ) : null}
      <BindTags event={event} />
      {event.kind === 'evidence' && event.evidenceUrls && event.evidenceUrls.length > 0 ? (
        <EvidenceThumbs urls={event.evidenceUrls} caption={event.title} />
      ) : null}
    </>
  );

  const face = href ? (
    <Link href={href} className="block min-w-0">
      {inner}
    </Link>
  ) : (
    inner
  );

  return (
    <li
      className={cn(
        'px-4 py-3',
        nested && 'pl-4',
        event.kind === 'exception' && 'bg-surface-warning',
      )}
      data-testid="search-find-event"
      data-kind={event.kind}
    >
      {face}
      {event.kind === 'carrier' && event.children && event.children.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {event.children.map((child) => (
            <FindEventRow key={child.id} event={child} exceptionHref={exceptionHref} nested />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function SearchFindStream({
  events,
  empty,
  exceptionHref,
}: {
  events: readonly FindEvent[];
  empty: string;
  exceptionHref?: string;
}) {
  if (events.length === 0) {
    return <p className="px-4 py-6 text-role-caption text-text-soft">{empty}</p>;
  }
  return (
    <ol className="stack-tight" data-testid="search-find-stream">
      {events.map((event) => (
        <FindEventRow key={event.id} event={event} exceptionHref={exceptionHref} />
      ))}
    </ol>
  );
}
