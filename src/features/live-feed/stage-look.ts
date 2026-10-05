/**
 * Each stage's face on the Live feed: one glyph and one hue, carried by the
 * column's icon tile, the card's track, the phone tab and the timeline — the
 * colour alone says where a package is. The glyph is Allocate's own
 * (`LIFECYCLE` → `LIFECYCLE_GLYPH`), so a stage wears one icon on both desks.
 */

import type { ComponentType } from 'react';
import { LIFECYCLE_GLYPH } from '@/design-system/components/record-ledger/LifecycleCode';
import { LIFECYCLE } from '@/design-system/tokens/lifecycle';
import type { PackageStage } from '@/lib/live-feed/stages';

export interface StageLook {
  Icon: ComponentType<{ className?: string }>;
  /** Solid fill — a track segment, the active tab, a timeline node. */
  solid: string;
  /** Soft tile behind the glyph. */
  tile: string;
  /** Ink on white. */
  ink: string;
  /** Border colour of a selected card's outline overlay (`STATE_OUTLINE_CLASS`) — geometry, never a ring. */
  outline: string;
}

export const STAGE_LOOK: Readonly<Record<PackageStage, StageLook>> = {
  to_pick: {
    Icon: LIFECYCLE_GLYPH[LIFECYCLE.toPick.icon],
    solid: 'bg-amber-500',
    tile: 'bg-amber-50 text-amber-600 ring-amber-200/70',
    ink: 'text-amber-700',
    outline: 'border-amber-300',
  },
  picked: {
    Icon: LIFECYCLE_GLYPH[LIFECYCLE.picked.icon],
    solid: 'bg-sky-500',
    tile: 'bg-sky-50 text-sky-600 ring-sky-200/70',
    ink: 'text-sky-700',
    outline: 'border-sky-300',
  },
  packed: {
    Icon: LIFECYCLE_GLYPH[LIFECYCLE.packed.icon],
    solid: 'bg-violet-500',
    tile: 'bg-violet-50 text-violet-600 ring-violet-200/70',
    ink: 'text-violet-700',
    outline: 'border-violet-300',
  },
  scanned_out: {
    Icon: LIFECYCLE_GLYPH[LIFECYCLE.shipped.icon],
    solid: 'bg-emerald-500',
    tile: 'bg-emerald-50 text-emerald-600 ring-emerald-200/70',
    ink: 'text-emerald-700',
    outline: 'border-emerald-300',
  },
};
