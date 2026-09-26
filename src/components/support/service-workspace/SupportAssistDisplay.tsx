'use client';

/** Support · Assist — the drafting display, and it lives on the RIGHT EDGE. */

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { useSupportSuggestion, type SupportSuggestionResult } from '@/hooks/useSupportSuggestion';
import { useZendeskTicketBundle } from '@/hooks/useZendeskQueries';
import type { StagedPhoto } from '@/hooks/useTicketPhotoStaging';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import type { SuggestionSource } from '@/lib/support/suggest-reply-core';
import { renderBlockMarkdown } from '@/lib/support/markdown';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const CONFIDENCE_CHIP: Record<SupportSuggestionResult['confidence'], string> = {
  high: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  low: 'bg-surface-sunken text-text-muted ring-border-soft',
};

const META_CHIP =
  'rounded px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest ring-1 ring-inset';

const SOURCE_CHIP: Record<SuggestionSource['type'], string> = {
  thread: 'bg-surface-sunken text-text-soft ring-border-soft',
  rag: 'bg-blue-50 text-blue-700 ring-blue-200',
  ocr: 'bg-violet-50 text-violet-700 ring-violet-200',
  catalog: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

/** The lane, in words an operator can act on rather than a config value. */
const LANE_LABEL: Record<SupportSuggestionResult['mode'], string> = {
  'local-only': 'On-prem · no image sent',
  'cloud-multimodal': 'Cloud vision',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{children}</p>
  );
}

export function SupportAssistDisplay({
  ticketId,
  bridge,
  stagedPhotos = [],
  stagingUploading = false,
  autoRunId = 0,
}: {
  /** Provider ticket id — the same one the conversation and the route use. */
  ticketId: number;
  /** `null` while the composer is unmounted; the Use control stays disabled. */
  bridge: ThreadComposerBridge | null;
  /**
   * Photos staged on this ticket. Only their IDs are ever sent — the route
   * resolves a signed storage URL itself, because a model cannot follow the
   * app's own content route (it 302s behind a session cookie).
   */
  stagedPhotos?: StagedPhoto[];
  /** True while an upload is still in flight; an auto-run waits for it. */
  stagingUploading?: boolean;
  /**
   * Bumped by the host when an image is pasted onto the ticket. The intent
   * travels as DATA, not as a timed event — this display may mount a navigation
   * after the paste, and a dispatched event would fire into an empty room.
   */
  autoRunId?: number;
}) {
  const suggest = useSupportSuggestion();
  const { data: bundle } = useZendeskTicketBundle(ticketId);

  // Draft a reply to the LAST thing the customer actually said. An internal
  // note or our own reply is not the thing being answered, and drafting from
  // one produces a model replying to itself.
  const { question, subject } = useMemo(() => {
    const comments = bundle?.comments ?? [];
    const requesterId = bundle?.ticket?.requester_id;
    const inbound = comments.filter(
      (c) => c.public && (requesterId == null || c.author_id === requesterId),
    );
    const last = inbound[inbound.length - 1] ?? comments[comments.length - 1] ?? null;
    return {
      question: (last?.body ?? '').trim(),
      subject: bundle?.ticket?.subject ?? undefined,
    };
  }, [bundle]);

  const photoIds = useMemo(
    () =>
      stagedPhotos
        .filter((p) => p.status === 'done' && typeof p.photoId === 'number')
        .map((p) => p.photoId as number),
    [stagedPhotos],
  );

  const result = suggest.data;
  // An image on its own is a question. Only a ticket with neither has nothing
  // to draft from.
  const canDraft = Boolean(question) || photoIds.length > 0;

  const runRef = useRef<() => void>(() => {});
  runRef.current = () => {
    if (!canDraft || suggest.isPending) return;
    suggest.mutate(
      { ticketId, subject, question, stagedPhotoIds: photoIds },
      {
        // Failure never blocks the record: the image is already attached to the
        // ticket, so one toast and the agent carries on writing.
        onError: () => toast.error('AI assist unavailable. Image attached.'),
      },
    );
  };
  const run = () => runRef.current();

  // Paste → staged → analysed → drafted. The auto-run waits for the upload to
  // resolve because the route takes photo IDs, and a photo has none until GCS
  // answers.
  const lastAutoRun = useRef(0);
  useEffect(() => {
    if (!autoRunId || autoRunId === lastAutoRun.current) return;
    if (stagingUploading || !photoIds.length) return;
    lastAutoRun.current = autoRunId;
    runRef.current();
  }, [autoRunId, stagingUploading, photoIds.length]);

  const evidence = result?.evidence ?? [];
  const hasImageFindings = evidence.length > 0;
  const unmatchedImages = evidence.filter((p) => p.decoded.length > 0 && !p.matches.length);

  return (
    <div className="stack-row">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-role-eyebrow uppercase tracking-widest text-text-soft">
          <Sparkles className="h-3.5 w-3.5 text-blue-500" />
          Suggested reply
        </span>
        {!result ? (
          <Button
            variant="secondary"
            size="sm"
            loading={suggest.isPending}
            disabled={!canDraft}
            onClick={run}
            icon={<Sparkles className="h-3.5 w-3.5" />}
          >
            Draft a reply
          </Button>
        ) : null}
      </div>

      {!canDraft ? (
        <p className="text-role-caption text-text-faint">
          No customer message or photo on this ticket yet, so there is nothing to draft a reply
          to. Paste an image anywhere on the ticket and a draft is prepared from it.
        </p>
      ) : null}

      {photoIds.length && !result && !suggest.isPending ? (
        <p className="inline-flex items-center gap-1.5 text-role-caption text-text-soft">
          <ImageIcon className="h-3.5 w-3.5" />
          {photoIds.length} image{photoIds.length === 1 ? '' : 's'} attached — the draft will read{' '}
          {photoIds.length === 1 ? 'it' : 'them'}.
        </p>
      ) : null}

      {suggest.isPending ? (
        <p className="inline-flex items-center gap-1.5 text-role-caption text-text-soft">
          <Loader2 className="h-4 w-4 animate-spin" />
          {photoIds.length
            ? 'Reading the image, matching it to our records, and drafting…'
            : 'Grounding in the service docs and drafting…'}
        </p>
      ) : null}

      {suggest.isError ? (
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-3 text-center text-role-caption text-rose-700">
          {(suggest.error as Error)?.message || 'Could not draft a reply.'}
          <div className="mt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={run}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="border-t border-border-hairline bg-surface-canvas/60 p-3">
          {/* Provenance first — an agent decides whether to trust the draft
              before they read it, not after. */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className={cn(META_CHIP, CONFIDENCE_CHIP[result.confidence])}>
              {result.confidence} confidence
            </span>
            <span className={cn(META_CHIP, 'bg-surface-sunken text-text-soft ring-border-soft')}>
              {LANE_LABEL[result.mode] ?? result.mode}
            </span>
            {result.model ? (
              <span className={cn(META_CHIP, 'bg-surface-sunken text-text-soft ring-border-soft')}>
                {result.model}
              </span>
            ) : null}
            {!result.grounded ? (
              <span className={cn(META_CHIP, 'bg-surface-sunken text-text-soft ring-border-soft')}>
                no doc match
              </span>
            ) : null}
          </div>

          {/* What the IMAGE said — observations, kept apart from facts. */}
          {hasImageFindings ? (
            <section className="mb-2.5 stack-tight">
              <SectionLabel>From the image</SectionLabel>
              {evidence.map((photo) => (
                <div key={photo.photoId} className="text-role-caption text-text-soft">
                  {photo.caption ? <p className="text-text-default">{photo.caption}</p> : null}
                  {photo.damageDetected ? (
                    <p className="inline-flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Visible damage{photo.damageNotes ? ` — ${photo.damageNotes}` : ''}
                    </p>
                  ) : null}
                  {photo.decoded.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {photo.decoded.map((token) => (
                        <span
                          key={`${photo.photoId}-${token.raw}`}
                          className={cn(
                            'rounded px-1.5 py-0.5 font-mono text-role-micro ring-1 ring-inset',
                            token.matched
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                              : 'bg-surface-sunken text-text-muted ring-border-soft',
                          )}
                          title={token.matched ? 'Matched a record' : 'No record matched'}
                        >
                          {token.value}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {/* What OUR DATA said — each one a real row the agent can open. */}
          {result.searchHits.length ? (
            <section className="mb-2.5 stack-tight">
              <SectionLabel>Matched in our records</SectionLabel>
              <ul className="divide-y divide-border-hairline">
                {result.searchHits.map((hit) => (
                  <li key={`${hit.entityType}-${hit.id}`} className="py-1">
                    <Link
                      href={hit.href}
                      className="block truncate text-role-caption font-semibold text-text-default hover:underline"
                    >
                      {hit.title}
                    </Link>
                    <p className="truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
                      {hit.entityType}
                      {hit.subtitle ? ` · ${hit.subtitle}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {unmatchedImages.length ? (
            <p className="mb-2.5 text-role-caption text-amber-700">
              Nothing in our records matched the identifiers on{' '}
              {unmatchedImages.length === 1 ? 'this image' : 'these images'} — the draft is
              describing what it can see, not a unit we recognised.
            </p>
          ) : null}

          {/* A model returns markdown. Rendering it literally is the exact
              defect the ledger fixed one surface up — same renderer, one scale. */}
          <div className="text-role-caption leading-relaxed text-text-default">
            {renderBlockMarkdown(result.suggestion)}
          </div>

          {result.sources.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {result.sources.slice(0, 8).map((src, i) => (
                <span
                  key={`${src.type}-${src.label}-${i}`}
                  className={cn(
                    META_CHIP,
                    'max-w-[13rem] truncate normal-case tracking-normal',
                    SOURCE_CHIP[src.type],
                  )}
                  title={`${src.type} · ${src.label}`}
                >
                  {src.type === 'rag' ? (
                    <FileText className="mr-1 inline h-3 w-3 shrink-0" />
                  ) : null}
                  {src.label}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Button
              variant="primary"
              size="sm"
              disabled={!bridge}
              onClick={() => void bridge?.setDraft(result.suggestion, { mode: 'public' })}
              icon={<Check className="h-3.5 w-3.5" />}
            >
              Put in composer
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={suggest.isPending}
              onClick={run}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Regenerate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => suggest.reset()}
              icon={<X className="h-3.5 w-3.5" />}
            >
              Dismiss
            </Button>
          </div>

          <p className="mt-2 text-role-micro text-text-faint">
            Nothing is sent. The draft lands in the composer for you to review and send.
          </p>
        </div>
      ) : null}
    </div>
  );
}
