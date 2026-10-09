'use client';

/**
 * An open package — the board's second level. Top to bottom: where it is
 * (stage, walk to the next package in the column, close), its verbs (an order:
 * Flag, Labels & paperwork, Remove from list; a card no order owns: Pair to
 * order, Flag, Remove from list — RecordActionStrip, keys F · D · L · R), what
 * it is (photo, title, sale, its pressure — with a way into Exceptions when it
 * is out of stock), its flags (who, when, clear), its box (carrier + tracking,
 * and the other orders packed with it), its journey (who did each step, when,
 * how long it waited), its tags, and the conversation about it with the
 * composer last. The same body serves the desk's side panel and the phone's
 * full-screen sheet.
 */

import { useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Flag, Link2, ReceiptText } from 'lucide-react';
import { ChevronLeft, ChevronRight, X } from '@/components/Icons';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { CopyChip } from '@/components/ui/CopyChip';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { RecordPhoto } from '@/design-system/components/record-ledger/RecordPhoto';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { EXCEPTIONS_PATH } from '@/lib/exceptions/types';
import { liveFeedPackagesQuery } from '@/lib/live-feed/query';
import { PACKAGE_STAGE_META } from '@/lib/live-feed/stages';
import type { PackageCard } from '@/lib/live-feed/types';
import { platformMetaBrandDot, sourcePlatformLabel, sourcePlatformMeta } from '@/lib/source-platform';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { LiveFeedDocsContext } from './card-docs';
import { FlagDialog, OrderRemovalDialog, PairOrderDialog, UnlinkedRemovalDialog } from './card-verbs';
import { FlagList } from './flag-pills';
import { PackageCommentComposer, PackageCommentThread } from './PackageComments';
import { PackageFacts } from './PackageFacts';
import { PackageMiniRow } from './PackageMiniRow';
import { PackageTags } from './PackageTags';
import { Pill, PressurePills } from './pills';
import { STAGE_LOOK } from './stage-look';
import { StageTimeline } from './StageTrack';

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function PackageDetail({
  card,
  now,
  position,
  onStep,
  onClose,
  onOpen,
  onPaired,
  onLeft,
}: {
  card: PackageCard;
  now: number | null;
  /** `index of total` inside the package's column, for the walk. */
  position: { index: number; total: number } | null;
  onStep: (step: -1 | 1) => void;
  onClose: () => void;
  /** Open another package (a box mate). */
  onOpen: (card: PackageCard) => void;
  /** The unlinked card was paired: follow it to the order row it became. */
  onPaired: (orderRowId: number) => void;
  /** The card left the list (Remove from list): step on. */
  onLeft: (cardIds: readonly number[]) => void;
}) {
  const look = STAGE_LOOK[card.stage];
  const platform = sourcePlatformMeta(card.platform);
  const mates = useQuery(liveFeedPackagesQuery(card.boxMates));
  const openDocs = useContext(LiveFeedDocsContext);

  const verbs = useMemo<RecordActionVerb[]>(() => {
    const ids = [card.orderRowId];
    const flag: RecordActionVerb = {
      id: 'flag',
      label: 'Flag…',
      icon: <Flag className="size-4" />,
      hotkey: 'f',
      dialog: (done) => <FlagDialog cardIds={ids} links={[card.link]} done={done} />,
    };
    if (card.link !== 'order') {
      return [
        {
          id: 'pair',
          label: 'Pair to order…',
          icon: <Link2 className="size-4" />,
          hotkey: 'l',
          tone: 'primary',
          dialog: (done) => <PairOrderDialog card={card} done={done} onPaired={onPaired} />,
        },
        flag,
        {
          id: 'remove-from-list',
          label: 'Remove from list…',
          icon: <Archive className="size-4" />,
          hotkey: 'r',
          tone: 'danger',
          dialog: (done) => <UnlinkedRemovalDialog cardIds={ids} done={done} onRemoved={onLeft} />,
        },
      ];
    }
    const out: RecordActionVerb[] = [flag];
    if (openDocs) {
      out.push({
        id: 'docs',
        label: 'Labels & paperwork',
        icon: <ReceiptText className="size-4" />,
        hotkey: 'd',
        run: () => openDocs(card, 'label'),
      });
    }
    out.push({
      id: 'remove-from-list',
      label: 'Remove from list…',
      icon: <Archive className="size-4" />,
      hotkey: 'r',
      tone: 'danger',
      // A box that left the building is already off the To-ship list.
      disabled: card.stage === 'scanned_out',
      disabledReason: 'It already left the building — it is off the list',
      dialog: (done) => <OrderRemovalDialog orderRowIds={ids} done={done} onRemoved={onLeft} />,
    });
    return out;
  }, [card, onLeft, onPaired, openDocs]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-testid="live-feed-detail" data-order-row={card.orderRowId}>
      <header className="flex items-center gap-2 px-4 py-3">
        <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset', look.tile)}>
          <look.Icon className="size-3.5" />
          {PACKAGE_STAGE_META[card.stage].label}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {position ? (
            <>
              <IconButton
                icon={<ChevronLeft className="size-4" />}
                ariaLabel="Previous package"
                size="md"
                radius="pill"
                disabled={position.index <= 0}
                onClick={() => onStep(-1)}
              />
              <span className="min-w-14 text-center text-xs font-medium tabular-nums text-slate-500">
                {position.index + 1} of {position.total}
              </span>
              <IconButton
                icon={<ChevronRight className="size-4" />}
                ariaLabel="Next package"
                size="md"
                radius="pill"
                disabled={position.index >= position.total - 1}
                onClick={() => onStep(1)}
              />
            </>
          ) : null}
          <IconButton icon={<X className="size-4" />} ariaLabel="Close package" size="md" radius="pill" onClick={onClose} />
        </div>
      </header>
      <RecordActionStrip verbs={verbs} label={`${card.orderNumber ?? card.tracking ?? 'Package'} actions`} testId="live-feed-detail-verbs" />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex gap-4 px-5 pb-4">
          <span className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-inset ring-slate-900/5">
            <RecordPhoto src={card.photoUrl} fallback={card.title} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-snug text-slate-900">{card.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
              <BrandIdentityDot {...platformMetaBrandDot(platform)} />
              <span>{sourcePlatformLabel(card.platform)}</span>
              {card.customer ? (
                <>
                  <span aria-hidden className="text-slate-300">·</span>
                  <span className="truncate">{card.customer}</span>
                </>
              ) : null}
            </p>
            <PackageFacts card={card} className="mt-1 text-sm" />
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <PressurePills card={card} now={now} />
              {card.stalled ? <Pill tone="warning">Stalled in {PACKAGE_STAGE_META[card.stage].label}</Pill> : null}
            </div>
            {card.blocked ? (
              <Button
                variant="dangerSoft"
                size="sm"
                className="mt-2"
                href={`${EXCEPTIONS_PATH}?${new URLSearchParams({ order: String(card.orderRowId) })}`}
                data-testid="live-feed-open-exception"
              >
                Open in Exceptions
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-1 px-5 pb-4">
          {card.steps.ordered.at ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">Ordered</span>
              <span className="tabular-nums text-slate-700" title="Placed, else imported">
                {formatMonthDayTimePST(card.steps.ordered.at)}
              </span>
            </div>
          ) : null}
          {card.orderNumber ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">Order</span>
              <CopyChip value={card.orderNumber} display={card.orderNumber} tone="id" platformLabel={sourcePlatformLabel(card.platform)} />
            </div>
          ) : null}
          {card.tracking ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">{card.carrier ?? 'Tracking'}</span>
              <CopyChip value={card.tracking} display={card.tracking} tone="tracking" carrierHint={card.carrier} displayWidth="last8" />
            </div>
          ) : null}
          {card.sku ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">SKU</span>
              <CopyChip value={card.sku} display={card.sku} tone="sku" />
            </div>
          ) : null}
        </div>

        {card.flags.length > 0 ? (
          <Section title="Flags">
            <FlagList cardId={card.orderRowId} flags={card.flags} now={now} />
          </Section>
        ) : null}

        {card.boxMates.length > 0 ? (
          <Section title={`Same box · ${card.boxMates.length + 1} orders`}>
            <ul className="flex flex-col gap-1" data-testid="live-feed-box-mates">
              {(mates.data?.packages ?? []).map((mate) => (
                <li key={mate.orderRowId}>
                  <PackageMiniRow card={mate} current={false} onOpen={onOpen} />
                </li>
              ))}
              {mates.data && mates.data.packages.length < card.boxMates.length ? (
                <li className="px-2 text-xs text-slate-500">
                  {card.boxMates.length - mates.data.packages.length} more already left the board
                </li>
              ) : null}
            </ul>
          </Section>
        ) : null}

        {card.link === 'order' ? null : (
          <Section title="Not linked">
            <p className="text-sm text-slate-600" data-testid="live-feed-unlinked">
              {card.link === 'package'
                ? 'This box was scanned out at the dock, but no order owns its tracking number. It is shown so nothing the dock recorded is hidden.'
                : 'This scan-out never matched a package on file. The scanned text is shown as the tracking.'}{' '}
              Pair it to the order it belongs to, or remove it from the list.
            </p>
            {card.carrierStatus ? <p className="mt-1 text-sm text-slate-500">Carrier: {card.carrierStatus}</p> : null}
          </Section>
        )}

        <Section title="Journey">
          <StageTimeline card={card} />
        </Section>

        {card.link === 'order' ? (
          <>
            <Section title="Tags">
              <PackageTags orderRowId={card.orderRowId} tags={card.tags} />
            </Section>

            <Section title="Comments" aside={card.noteCount > 0 ? <span className="text-xs text-slate-400">{card.noteCount}</span> : null}>
              <PackageCommentThread orderRowId={card.orderRowId} />
            </Section>
          </>
        ) : null}
      </div>

      {card.link === 'order' ? (
        <footer className="border-t border-slate-100 px-4 py-3">
          <PackageCommentComposer orderRowId={card.orderRowId} />
        </footer>
      ) : null}
    </div>
  );
}
