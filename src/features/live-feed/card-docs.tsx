'use client';

/**
 * A card's document marks — shipping label · packing slip · product
 * paperwork, at a glance: bright when on file, muted when still owed, faint
 * when not required (operator 2026-10-06). Pressing one opens the docs
 * popover (`PrintPacketsDialog`) for THAT order on that tab, where the
 * missing one is linked. The board provides the opener
 * (`LiveFeedDocsContext`); without it the marks only show.
 */

import { createContext, useContext } from 'react';
import { FileText, ReceiptText, Tag, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { PackageCard, PackagePaperwork } from '@/lib/live-feed/types';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { DocTab } from './docs-triage/doc-tabs';
import { useLinkPop } from './docs-triage/use-link-pop';

export type OpenCardDocs = (card: PackageCard, tab: DocTab) => void;

export const LiveFeedDocsContext = createContext<OpenCardDocs | null>(null);

const ICON_BUTTON = cn('pointer-events-auto inline-flex size-6 items-center justify-center rounded-md transition-colors', focusRing('control'));

/** On file = a saturated fill; owed = a muted outline that reads "link me"; exempt = faint. */
const LOOK: Readonly<Record<PackagePaperwork, string>> = {
  linked: 'bg-fill-success text-text-inverse shadow-sm hover:brightness-110',
  missing: 'bg-surface-sunken text-text-faint ring-1 ring-inset ring-border-default hover:bg-surface-hover hover:text-text-muted',
  not_required: 'text-text-faint/60 hover:bg-surface-hover',
};

const MARKS: ReadonlyArray<{ tab: DocTab; icon: LucideIcon; noun: string }> = [
  { tab: 'label', icon: Tag, noun: 'Shipping label' },
  { tab: 'slip', icon: ReceiptText, noun: 'Packing slip' },
  { tab: 'paperwork', icon: FileText, noun: 'Product paperwork' },
];

const TIP: Readonly<Record<PackagePaperwork, (noun: string) => string>> = {
  linked: (noun) => `${noun} on file — view or print`,
  missing: (noun) => `No ${noun.toLowerCase()} yet — link it`,
  not_required: (noun) => `${noun} not required`,
};

export function CardDocs({ card }: { card: PackageCard }) {
  const open = useContext(LiveFeedDocsContext);
  if (!card.docs) return null;
  const state: Readonly<Record<DocTab, PackagePaperwork>> = {
    label: card.docs.label ? 'linked' : 'missing',
    slip: card.docs.slip,
    paperwork: card.docs.paperwork,
  };

  return (
    <span className="relative z-20 flex items-center gap-1" data-testid={`live-feed-card-docs-${card.orderRowId}`}>
      {MARKS.map(({ tab, icon, noun }) => (
        <CardMark key={tab} icon={icon} noun={noun} state={state[tab]} testId={`live-feed-card-${tab}-${card.orderRowId}`} onOpen={() => open?.(card, tab)} />
      ))}
    </span>
  );
}

/** One mark — it pops when its document links while the card is on screen. */
function CardMark({
  icon: Icon,
  noun,
  state,
  testId,
  onOpen,
}: {
  icon: LucideIcon;
  noun: string;
  state: PackagePaperwork;
  testId: string;
  onOpen: () => void;
}) {
  const pop = useLinkPop(state === 'linked');
  const tip = TIP[state](noun);
  return (
    <HoverTooltip label={tip} asChild placement="above">
      {/* ds-raw-button: the mark's own state fill must scale as one element when it links (motion controls); IconButton takes no motion props. */}
      <motion.button
        {...pop}
        type="button"
        aria-label={tip}
        data-linked={state === 'linked' ? 'true' : 'false'}
        data-state={state}
        data-testid={testId}
        className={cn(ICON_BUTTON, LOOK[state])}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        <Icon className="size-3.5" strokeWidth={2.25} />
      </motion.button>
    </HoverTooltip>
  );
}
