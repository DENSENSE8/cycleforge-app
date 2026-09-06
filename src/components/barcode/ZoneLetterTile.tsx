import { HoverTooltip } from '@/components/ui/HoverTooltip';

/**
 * The one sentence that explains an unassigned zone letter, wherever the amber
 * "?" appears — the bin printer, the rack printer, and the label-room sidebar.
 *
 * It was authored three times in three files. A hint is copy, and copy drifts:
 * re-word it in one place and the operator gets two different explanations of
 * the same amber square depending on which printer they opened.
 */
export const ZONE_LETTER_UNASSIGNED_HINT = 'No zone letter assigned yet — go to the Rooms tab';

/**
 * The square zone-letter badge (or an amber "?" when no letter is assigned).
 *
 * Shared by the bin printer and the rack printer, which shipped byte-identical
 * copies of this file. `LabelRoomSidebar` keeps its own smaller, selectable
 * variant (h-8, `active`) — a different instrument, not a second copy of this
 * one — but it shares {@link ZONE_LETTER_UNASSIGNED_HINT}.
 */
export function ZoneLetterTile({ letter }: { letter: string | undefined }) {
  if (letter) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/70 font-mono text-xl font-semibold text-blue-700 ring-1 ring-blue-200">
        {letter}
      </div>
    );
  }
  return (
    <HoverTooltip label={ZONE_LETTER_UNASSIGNED_HINT} asChild focusable={false}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 font-mono text-lg font-semibold text-amber-700 ring-1 ring-amber-200">
        ?
      </div>
    </HoverTooltip>
  );
}
