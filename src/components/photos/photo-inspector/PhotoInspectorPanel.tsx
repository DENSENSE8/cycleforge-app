'use client';

/**
 * Media Library desk inspector — the n = 1 face of the selection plane.
 *
 * ```text
 * [→|] ……………………………… [ 3 / 128 ] [↑] [↓]     ← DeskRailChromeRow (chrome ONLY)
 * ───────────────────────────────────────────
 * identity line                                ← S2 fills this out
 * ```
 *
 * **What opens it.** Ticking exactly one photo. Two or more hands the SAME
 * right-edge slot to {@link PhotoBatchInspectorPanel} (`detail:photo-batch`),
 * zero closes it. (Until 2026-08-09 that n ≥ 2 face was `PhotoLibraryToolbar`, a
 * chrome band that swapped itself over Bands 1–3; it is deleted — the bulk verbs
 * are armed ROWS on this edge now, so cardinality changes the content and never
 * the place.) The tile click is untouched and still opens the fullscreen viewer
 * — the axis on which the retired `PhotoInspectorPanel` failed, and the reason
 * this one never binds it.
 *
 * **Why the occupant id is stable.** `RightRailHost` keys its `AnimatePresence`
 * on the id, so `detail:photo:<id>` would play exit → empty → enter on every ↑↓
 * step. Walking the stream is the loop this rail exists for, so the id names the
 * SLOT and the record swaps inside it (`display/motion-crossfade.md` → a
 * queue-processing inspector swaps in place). Nothing here is a dirty draft yet,
 * so the flush-before-swap precondition is trivially met; **S3/S4 must re-check
 * it** when the label editor lands as a leaf.
 *
 * `push` is deliberately unset — it defaults `true`, which is the house ruling
 * (`source-of-truth.md` → Right-rail modality) and keeps this file off the
 * `FLOAT_ONLY` allowlist in `right-rail-push.guard.test.ts`.
 *
 * Operator copy is **Show inspector / Hide right panel** — never "Open
 * displays", which is the Station Displays column (`display/right-rail-inspector.md`).
 */

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { CursorPositionReadout, PaneHeaderLabel } from '@/components/ui/pane-header';
import { formatDateTimePST } from '@/utils/date';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import type { LibraryPhoto } from '../photo-library-types';
import { photoIdentityLine, photoPrimaryLabel } from '../photo-library-grid/photo-grid-format';

interface PhotoInspectorPanelProps {
  /** The one selected photo. */
  photo: LibraryPhoto;
  /** Source scope — drives the PO# vs ticket# identity label. */
  scope: PhotoLibrarySourceScope;
  /** 1-based position of `photo` in the loaded stream. */
  position: number;
  /** Loaded stream length, for the `N / M` readout. */
  total: number;
  /** Step to the previous / next photo in the loaded stream (`↑` = previous). */
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  onClose: () => void;
}

export function PhotoInspectorPanel({
  photo,
  scope,
  position,
  total,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  onClose,
}: PhotoInspectorPanelProps) {
  const primaryLabel = photoPrimaryLabel(photo, scope);
  const identityLine = photoIdentityLine(photo);

  return (
    <DetailStackRailRegistrar
      id="detail:photo"
      onClose={onClose}
      modal={false}
      ariaLabel={`Photo ${primaryLabel} details`}
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        data-testid="photo-inspector-panel"
      >
        <div className="shrink-0 border-b border-border-hairline bg-surface-card/90 backdrop-blur-xl">
          <DeskRailChromeRow
            onClose={onClose}
            onPrev={onPrev}
            onNext={onNext}
            prevDisabled={prevDisabled}
            nextDisabled={nextDisabled}
            prevTitle="Previous photo"
            nextTitle="Next photo"
            prevTestId="photo-inspector-prev"
            nextTestId="photo-inspector-next"
            cursor={<CursorPositionReadout position={position} total={total} />}
          />
        </div>

        {/* Deliberately one identity line. Topic depth is S2; an action floor is
            S3. A thin body now beats a facts dump that S2 has to unpick — the
            retired inspector was facts-only, which is what made it read as a
            redundant second Details. */}
        <div className="min-h-0 flex-1 overflow-y-auto inset-field">
          <PaneHeaderLabel
            eyebrow="Photo"
            value={primaryLabel}
            valueTitle={primaryLabel}
          />
          <p className="mt-1 truncate text-role-micro text-text-soft">
            {identityLine ? `${identityLine} · ` : ''}
            {formatDateTimePST(photo.createdAt)}
          </p>
        </div>
      </div>
    </DetailStackRailRegistrar>
  );
}
