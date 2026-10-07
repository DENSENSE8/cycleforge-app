/**
 * Each stage's face on the Live feed: one glyph and one hue, carried by the
 * column's icon tile, the card's track, the phone tab and the timeline — the
 * colour alone says where a package is. The hue is the stage's status tone
 * (`OUTBOUND_INTERNAL_STATUS` → `RECORD_STATUS_TONE_CLASSES`,
 * `src/lib/status/record-status.ts`); the glyph is Allocate's own (`LIFECYCLE`
 * → `LIFECYCLE_GLYPH`), so a stage wears one icon on both desks.
 */

import type { ComponentType } from 'react';
import { LIFECYCLE_GLYPH } from '@/design-system/components/record-ledger/LifecycleCode';
import { LIFECYCLE, type LifecycleState } from '@/design-system/tokens/lifecycle';
import type { PackageStage } from '@/lib/live-feed/stages';
import { OUTBOUND_INTERNAL_STATUS, RECORD_STATUS_TONE_CLASSES } from '@/lib/status/record-status';

export interface StageLook {
  Icon: ComponentType<{ className?: string }>;
  /** Solid fill — a track segment, the active tab, a timeline node. */
  solid: string;
  /** Soft tile behind the glyph (callers add `ring-1 ring-inset`). */
  tile: string;
  /** Ink on white. */
  ink: string;
  /** Border colour of a selected card's outline overlay (`STATE_OUTLINE_CLASS`) — geometry, never a ring. */
  outline: string;
}

function stageLook(stage: PackageStage, glyph: LifecycleState): StageLook {
  const tone = RECORD_STATUS_TONE_CLASSES[OUTBOUND_INTERNAL_STATUS[stage].tone];
  return { Icon: LIFECYCLE_GLYPH[LIFECYCLE[glyph].icon], solid: tone.dot, tile: `${tone.pill} ${tone.ring}`, ink: tone.ink, outline: tone.border };
}

export const STAGE_LOOK: Readonly<Record<PackageStage, StageLook>> = {
  to_pick: stageLook('to_pick', 'toPick'),
  picked: stageLook('picked', 'picked'),
  packed: stageLook('packed', 'packed'),
  scanned_out: stageLook('scanned_out', 'shipped'),
};
