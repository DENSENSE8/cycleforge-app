import { Check, Pencil } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';

/**
 * Eyebrow pencil — flips the rail into checkbox multi-select (see
 * {@link useRailEditMode}). Eyebrow-scale sibling of actions like the Scanned
 * rail's "Sync Zoho"; active state fills blue and swaps to a ✓ ("done").
 *
 * Always resident — it anchors the right column that lines up with each row's
 * relative-time (`5h`). Hover-hiding it leaves that edge empty at rest and
 * breaks the rail's title↔time hierarchy.
 *
 * Centers in {@link STATION_SECONDARY_BAND_FACE} (`h-6`) — the shared seam with
 * carton commerce row 2 and Displays VERIFICATION eyebrows.
 */
export function RailEditPencil({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <HoverTooltip label={active ? 'Done' : 'Select rows (bulk delete)'} asChild>
      <IconButton
        onClick={onToggle}
        aria-pressed={active}
        ariaLabel={active ? 'Done — exit select mode' : 'Select rows for bulk actions'}
        className={`group flex h-5 w-5 shrink-0 items-center justify-center rounded ${
          active ? 'bg-blue-600 shadow-sm hover:bg-blue-700' : 'hover:bg-surface-sunken'
        }`}
        icon={
          active ? (
            <Check className="h-3 w-3 text-white" />
          ) : (
            <Pencil className="h-3 w-3 text-text-faint group-hover:text-text-muted" />
          )
        }
      />
    </HoverTooltip>
  );
}
