'use client';

/**
 * Photo inspector — the non-modal right-rail occupant for `/ops/photos`.
 *
 * ## Why non-modal
 *
 * `modal` defaults to `true` on every right-rail occupant, and that is right for
 * a surface that must block until dismissed. This one must NOT block. The job is
 * "pick a photo, read its evidence identity, compare it with its neighbours" —
 * a scrim would hide exactly the context that makes the comparison possible
 * (the sibling tiles, the day band, the lifecycle tabs). Non-modal means no
 * scrim, no body scroll lock, and `role="region"` rather than a `role="dialog"`
 * the DOM never honoured (the host installs no focus trap — see
 * `.claude/rules/source-of-truth.md` → Right-rail modality).
 *
 * ## Why a STABLE occupant id
 *
 * `RightRailHost` keys its `AnimatePresence mode="wait"` on the occupant id, so
 * a per-photo id (`detail:photo:<id>`) would make every arrow-key step a full
 * exit-then-enter with an empty slot in between. Stepping through a day's
 * captures is the core loop of an evidence review, so the id is `detail:photo`
 * and the content swaps in place.
 *
 * That exception carries preconditions (`display/motion-crossfade.md`): the
 * panel must fully re-seed on record change, and navigating must never write.
 * **Both hold trivially here because this panel is read-only.** It renders
 * resolved facts and delegates every mutation — labels, delete, share — to the
 * existing grid affordances, so there is no draft to flush and no field that
 * could carry one photo's edit onto another. Keep it that way: adding an
 * inline-editable field here means also adding a flush-before-swap, or the
 * stable id silently corrupts data.
 */

import { Download, ExternalLink, Image as ImageIcon, X } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { Button, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { OrderIdChip, SerialChip, TrackingChip } from '@/components/ui/CopyChip';
import { PhotoLabelChips } from '@/components/photos/PhotoLabelChips';
import { photoStageLabel } from '@/lib/photos/stages';
import { PHOTO_SOURCE_SCOPE_LABELS } from '@/lib/photos/library-filter-state';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import type { LibraryPhoto } from './photo-library-types';
import { isLibraryDocument, libraryDocumentId } from './photo-library-types';

/** Label above, value below — the house field-group shape. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-role-micro uppercase tracking-widest text-text-soft">{label}</p>
      <div className="text-role-caption text-text-default">{children}</div>
    </div>
  );
}

function EmptyValue() {
  return <span className="text-text-faint">—</span>;
}

/**
 * Takes a NON-NULL photo, and the caller renders it conditionally
 * (`{photo ? <PhotoInspectorPanel …/> : null}`) — matching
 * `GlobalDetailStackHost`, which does `if (!active) return null`.
 *
 * This is load-bearing, not style. Keeping the registrar mounted and toggling
 * `enabled` from true→false left `RightRailHost`'s `AnimatePresence` with a
 * completed-but-unremoved child: the aside sat at `opacity: 0` with
 * `pointer-events: auto`, an invisible 420px column swallowing clicks on the
 * right-hand tiles. Unmounting the registrar gives AnimatePresence a clean
 * removal. Do not "simplify" this back to an always-mounted `enabled` toggle.
 */
export function PhotoInspectorPanel({
  photo,
  onClose,
}: {
  photo: LibraryPhoto;
  onClose: () => void;
}) {
  const isDocument = isLibraryDocument(photo);
  const contentHref = isDocument
    ? `/api/documents/${libraryDocumentId(photo)}/content`
    : `/api/photos/${photo.id}/content`;

  return (
    <DetailStackRailRegistrar
      id="detail:photo"
      onClose={onClose}
      modal={false}
      ariaLabel={`Photo ${photo.id} details`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-soft inset-field">
            <div className="min-w-0">
              <p className="truncate text-role-caption font-semibold text-text-default">
                {photo.filename ?? (isDocument ? 'Document' : `Photo ${photo.id}`)}
              </p>
              <p className="truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
                {photo.sourceScope
                  ? PHOTO_SOURCE_SCOPE_LABELS[photo.sourceScope]
                  : 'Media library'}
              </p>
            </div>
            <IconButton
              size="sm"
              ariaLabel="Close photo details"
              icon={<X className="h-4 w-4" />}
              onClick={onClose}
            />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto stack-section inset-card">
            {/* Preview. Object-contain so a portrait carton shot is not cropped
                into something an operator could misread as a different photo. */}
            <div className="overflow-hidden rounded-xl border border-border-soft bg-surface-canvas">
              {isDocument ? (
                <div className="flex aspect-square flex-col items-center justify-center gap-2 text-text-soft">
                  <ImageIcon className="h-6 w-6" />
                  <p className="text-role-micro uppercase tracking-widest">Document</p>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.thumbUrl}
                  alt={photo.caption ?? `Photo ${photo.id}`}
                  className="max-h-64 w-full object-contain"
                />
              )}
            </div>

            {photo.caption ? (
              <Field label="Caption">{photo.caption}</Field>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Captured">
                {photo.createdAt ? formatDateTimePST(photo.createdAt) : <EmptyValue />}
              </Field>
              <Field label="By">{photo.takenByStaffName ?? <EmptyValue />}</Field>
              <Field label="Stage">
                {photo.stage ? photoStageLabel(photo.stage) : <EmptyValue />}
              </Field>
              <Field label="SKU">{photo.sku ?? <EmptyValue />}</Field>
            </div>

            {/* Typed identifiers go through the CopyChip family — never a bare
                string, so a serial reads and copies here exactly as it does in
                the grid, the timeline, and the station benches. */}
            <div className="stack-row">
              <Field label="PO">
                {photo.poRef ? (
                  <OrderIdChip value={photo.poRef} display={photo.poRef} plain />
                ) : (
                  <EmptyValue />
                )}
              </Field>
              <Field label="Serial">
                {photo.serialNumber ? (
                  <SerialChip value={photo.serialNumber} width="w-fit max-w-full" />
                ) : (
                  <EmptyValue />
                )}
              </Field>
              <Field label="Tracking">
                {photo.tracking ? <TrackingChip value={photo.tracking} /> : <EmptyValue />}
              </Field>
              {photo.unitUid ? <Field label="Unit">{photo.unitUid}</Field> : null}
              {photo.ticketId ? <Field label="Ticket">#{photo.ticketId}</Field> : null}
            </div>

            <Field label="Labels">
              {photo.labels?.length ? (
                <PhotoLabelChips labels={photo.labels} max={8} />
              ) : (
                <EmptyValue />
              )}
            </Field>

            {photo.damageDetected ? (
              <div
                className={cn(
                  'rounded-xl border border-dashed border-rose-200 bg-rose-50 inset-field',
                  'text-role-caption text-rose-900',
                )}
              >
                Damage detected on this capture.
              </div>
            ) : null}
          </div>

          <footer className="flex shrink-0 items-center gap-2 border-t border-border-soft inset-field">
            <HoverTooltip label="Open the full-size original in a new tab" placement="above" asChild>
              <Button
                variant="secondary"
                size="sm"
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                onClick={() => window.open(contentHref, '_blank', 'noopener,noreferrer')}
              >
                Open
              </Button>
            </HoverTooltip>
            <Button
              variant="ghost"
              size="sm"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => window.open(`${contentHref}?download=1`, '_blank', 'noopener')}
            >
              Download
            </Button>
          </footer>
        </div>
    </DetailStackRailRegistrar>
  );
}
