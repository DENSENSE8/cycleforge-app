'use client';

/**
 * `/search?sel=` record for every non-order entity (carton, unit, SKU, repair,
 * FBA) and the phone order — the order record's grammar (Shopify order-details
 * split): 2/3 = the thing (its lines, each with a photo large enough to judge)
 * then its timeline; 1/3 = the directional relationship card when applicable,
 * then identity facts and related records, each a `/search` link. One column
 * below the record's `@4xl` container width.
 */

import { useMemo, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/design-system/primitives';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { DeskStageRecordHeader } from '@/design-system/components/DeskStageOverlay';
import { StatusBadge } from '@/design-system/components/StatusBadge';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordFullId } from '@/design-system/components/record-ledger/RecordFullId';
import { DESK_RECORD_COLUMN_CARD_CLASS, DESK_STAGE_FIXED_CLASS } from '@/design-system/tokens/desk-stage';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { PhotoPeekFan, type PeekCard } from '@/components/receiving/workspace/line-edit/PhotoPeekFan';
import { initials } from '@/components/outbound/orders/outbound-orders-ledger-state';
import { TimelineSection } from '@/components/ui/TimelineSection';
import { findEventsToTimelineItems, type FindEvent } from '@/lib/search/find-dossier-model';
import { formatSearchSel } from '@/lib/search/search-selection';
import type {
  SearchDossierFact,
  SearchDossierFinding,
  SearchDossierHandoff,
  SearchDossierLine,
  SearchDossierLink,
  SearchDossierTarget,
} from '@/lib/search/search-dossier-model';
import { cn } from '@/utils/_cn';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';

/** Newest events painted before "Show N earlier events" — the order record's limit. */
const TIMELINE_INITIAL_LIMIT = 5;

/** A `/search` href for a related record that keeps the operator's query (Back still returns to it). */
function useTargetHref(): (target: SearchDossierTarget) => string {
  const params = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  return (target) => {
    const next = new URLSearchParams();
    if ('sel' in target) {
      if (q) next.set('q', q);
      next.set('sel', formatSearchSel(target.sel.entityType, target.sel.id));
    } else {
      next.set('q', target.query);
    }
    return `/search?${next.toString()}`;
  };
}

function RelatedLink({ link, href }: { link: SearchDossierLink; href: string }) {
  return (
    <Link
      href={href}
      data-testid="search-record-link"
      className={cn(
        'min-w-0 truncate rounded-mode-control text-mode-ink underline decoration-mode-edge underline-offset-2 hover:decoration-mode-ink',
        RECORD_ID_CLASS,
        focusRing('control'),
      )}
    >
      {link.value}
    </Link>
  );
}

function RecordLinePhoto({ line }: { line: SearchDossierLine }) {
  const photos = useMemo<PhotoGalleryInput[]>(
    () => line.imageUrl ? [{ url: line.imageUrl, thumbUrl: line.imageUrl }] : [],
    [line.imageUrl],
  );
  const gallery = usePhotoGallery({ photos });

  if (!line.imageUrl) {
    return (
      <span className="relative h-28 w-28 shrink-0 overflow-hidden border border-mode-frame bg-mode-well">
        <span className="flex h-full w-full items-center justify-center font-mono text-role-title font-black text-mode-muted" aria-hidden>
          {initials(line.title)}
        </span>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={`View photo for ${line.title}`}
        data-testid="search-record-line-photo"
        onClick={() => gallery.openViewer(0)}
        className={cn(
          'ds-raw-button relative h-28 w-28 shrink-0 cursor-zoom-in overflow-hidden border border-mode-frame bg-mode-well',
          focusRing('cell'),
        )}
      >
        <Image src={line.imageUrl} alt="" fill unoptimized sizes="112px" className="object-contain" />
      </button>
      <PhotoViewerPortal g={gallery} />
    </>
  );
}

function RecordLine({ line, hrefOf }: { line: SearchDossierLine; hrefOf: (target: SearchDossierTarget) => string }) {
  return (
    <article data-testid="search-record-line" aria-label={line.title} className="border-b border-mode-fact bg-mode-bar">
      <div className="flex gap-3 p-3">
        <RecordLinePhoto line={line} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-3 min-w-0 text-role-body font-bold">{line.title}</p>
          {line.facts.length > 0 ? (
            <p className={cn(RECORD_LABEL_CLASS, 'flex flex-wrap items-baseline gap-x-3 text-mode-muted')}>
              {line.facts.map((fact) => (
                <span key={fact.label}>
                  {fact.label}{' '}
                  <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{fact.value}</span>
                </span>
              ))}
            </p>
          ) : null}
          {line.finding ? <p className="text-role-caption text-text-danger">{line.finding}</p> : null}
          {line.links && line.links.length > 0 ? (
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              {line.links.map((link) => (
                <span key={link.id} className={cn(RECORD_LABEL_CLASS, 'inline-flex min-w-0 items-baseline gap-1 text-mode-muted')}>
                  {link.label} <RelatedLink link={link} href={hrefOf(link.target)} />
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function SearchEntityRecord({
  entity,
  reference,
  title,
  status,
  findings,
  lines,
  linesLabel,
  emptyLines,
  events,
  emptyEvents,
  facts,
  related = [],
  handoffs,
  photos = [],
  relationship,
  onBack,
}: {
  /** What the record is — "Unit", "Carton", "SKU" … (the header reads "Unit 2807"). */
  entity: string;
  /** The operator-facing identifier after the entity word. */
  reference: string;
  /** The product / record title, under the header. */
  title?: string | null;
  status: string;
  findings: readonly SearchDossierFinding[];
  lines: readonly SearchDossierLine[];
  /** Count noun for the state row ("line", "unit", "item"). */
  linesLabel: string;
  emptyLines: string;
  events: readonly FindEvent[];
  emptyEvents: string;
  facts: readonly SearchDossierFact[];
  related?: readonly SearchDossierLink[];
  handoffs: readonly SearchDossierHandoff[];
  /** Every photo the record holds, newest first — the order record's photo peek. */
  photos?: readonly PeekCard[];
  /** Directional party/movement facts, normally a RecordFlowFacts card. */
  relationship?: ReactNode;
  onBack?: () => void;
}) {
  const hrefOf = useTargetHref();
  const [showAll, setShowAll] = useState(false);
  const items = findEventsToTimelineItems(events);
  const hidden = showAll ? 0 : Math.max(0, items.length - TIMELINE_INITIAL_LIMIT);
  const hasFindings = findings.length > 0;

  const main = (
    <div className={DESK_RECORD_COLUMN_CARD_CLASS}>
      <div className="flex min-h-mode-hit items-center gap-2 border-b border-mode-fact px-4" data-testid="search-record-state">
        <StatusBadge status={status} />
        <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
          {lines.length} {lines.length === 1 ? linesLabel : `${linesLabel}s`}
        </span>
      </div>
      {hasFindings ? (
        <ul className="border-b border-mode-fact bg-surface-warning" data-testid="search-record-findings">
          {findings.map((finding) => (
            <li key={finding.key} className="px-4 py-2">
              <p className="text-role-body font-semibold text-text-default">{finding.label}</p>
              <p className="text-role-caption text-text-soft">{finding.hint}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {lines.length > 0 ? (
        lines.map((line) => <RecordLine key={line.id} line={line} hrefOf={hrefOf} />)
      ) : (
        <p className="border-b border-mode-fact px-4 py-3 text-role-caption text-text-soft">{emptyLines}</p>
      )}
      <section data-testid="search-record-timeline" aria-label="Timeline">
        <TimelineSection
          title="Timeline"
          items={hidden > 0 ? items.slice(0, TIMELINE_INITIAL_LIMIT) : items}
          emptyMessage={emptyEvents}
          headerRight={items.length > 0 ? <span>{items.length} {items.length === 1 ? 'event' : 'events'}</span> : undefined}
          className="px-3 pt-3 pb-6"
        />
        {hidden > 0 ? (
          <div className="px-3 pb-4">
            <Button variant="ghost" size="sm" onClick={() => setShowAll(true)} data-testid="search-record-show-all">
              Show {hidden} earlier {hidden === 1 ? 'event' : 'events'}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );

  const aside = (
    <div className="flex min-w-0 flex-col gap-4">
      {relationship}
      <div className={DESK_RECORD_COLUMN_CARD_CLASS}>
        <div className="flex flex-col px-4" data-testid="search-record-facts">
          {facts.map((fact) => (
            <EvidenceFactRow key={fact.id} label={fact.label}>
              {fact.copy ? (
                <RecordFullId value={fact.value} label={fact.label} className="h-8 leading-8" />
              ) : (
                <span className="flex h-8 min-w-0 items-center truncate text-role-body">{fact.value}</span>
              )}
            </EvidenceFactRow>
          ))}
        </div>
        {related.length > 0 ? (
          <div className="flex flex-col px-4 pt-3" data-testid="search-record-related">
            <p className={cn(RECORD_LABEL_CLASS, 'pb-1 text-mode-muted')}>Related</p>
            {related.map((link) => (
              <EvidenceFactRow key={link.id} label={link.label}>
                <span className="flex h-8 min-w-0 items-center">
                  <RelatedLink link={link} href={hrefOf(link.target)} />
                </span>
              </EvidenceFactRow>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <section
      aria-label={`${entity} ${reference}`}
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-mode-canvas"
      data-testid="search-entity-record"
      data-entity={entity}
    >
      {/* The desk stage measure (max-w-6xl, centered) — the width To-ship's
          record opens at; the ground stays full-bleed around it. */}
      <div className={cn(DESK_STAGE_FIXED_CLASS, 'shrink-0')}>
      <DeskStageRecordHeader
        title={`${entity} ${reference}`}
        subtitle={title && title !== reference ? title : undefined}
        onClose={onBack}
        actions={
          handoffs.length > 0 ? (
            <span className="flex items-center gap-1.5" data-testid="search-record-handoffs">
              {handoffs.map((handoff) => (
                <Link key={handoff.href + handoff.label} href={handoff.href}>
                  <Button size="sm" variant={handoff.primary ? (hasFindings ? 'warning' : 'primary') : 'secondary'}>
                    {handoff.label}
                  </Button>
                </Link>
              ))}
            </span>
          ) : undefined
        }
      />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className={cn(DESK_STAGE_FIXED_CLASS, '@container flex-1 bg-mode-canvas p-4 text-mode-ink')}>
          <DeskRecordLayout
            main={main}
            aside={aside}
            peek={photos.length > 0 ? <PhotoPeekFan cards={[...photos]} placement="inline" /> : undefined}
          />
        </div>
      </div>
    </section>
  );
}
