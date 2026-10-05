'use client';

/** Leaf parts of the inline New Support item form (`NewSupportItemForm`). */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Plus, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { AssigneeComboboxPanel } from '@/design-system/components/AssigneeCombobox';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { Button } from '@/design-system/primitives';
import { IconButton } from '@/design-system/primitives/IconButton';
import { ComposerStagedPhotoStrip } from '@/components/ui/ComposerStagedPhotoStrip';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { useActiveStaffDirectory } from '@/components/sidebar/hooks';
import type { UsePhotoDropzone } from '@/hooks/usePhotoDropzone';
import type { StagedPhoto } from '@/hooks/useTicketPhotoStaging';
import { safeRandomUUID } from '@/lib/safe-uuid';

/** A photo staged before the item exists — uploaded onto its task once it does. */
interface StagedFile {
  tempId: string;
  file: File;
  previewUrl: string;
}

/** Photos staged on the form (blob previews, freed on remove and when the form goes away). */
export interface StagedPhotoFiles {
  files: File[];
  /** Thumbnails for ComposerStagedPhotoStrip. */
  faces: StagedPhoto[];
  stage: (files: File[]) => void;
  remove: (tempId: string) => void;
}

export function useStagedPhotoFiles(): StagedPhotoFiles {
  const [photos, setPhotos] = useState<StagedFile[]>([]);
  const stage = useCallback((files: File[]) => {
    setPhotos((prev) => [
      ...prev,
      ...files.map((file) => ({ tempId: safeRandomUUID(), file, previewUrl: URL.createObjectURL(file) })),
    ]);
  }, []);
  const remove = useCallback((tempId: string) => {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.tempId === tempId);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.tempId !== tempId);
    });
  }, []);
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  });
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);
  const faces = useMemo(
    () => photos.map((p) => ({ tempId: p.tempId, name: p.file.name, previewUrl: p.previewUrl, status: 'done' as const })),
    [photos],
  );
  const files = useMemo(() => photos.map((p) => p.file), [photos]);
  return { files, faces, stage, remove };
}

/** (4) Add photos + the staged thumbnails (× removes). Dropping / pasting works on the whole form. */
export function StagedPhotosRow({
  dropzone,
  staged,
}: {
  dropzone: UsePhotoDropzone;
  staged: StagedPhotoFiles;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="support-item-photos">
      {/* ds-raw-button: the hidden file input Add photos opens (usePhotoDropzone owns it) */}
      <input ref={dropzone.inputRef} {...dropzone.inputProps} />
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Button size="sm" variant="ghost" icon={<ImagePlus aria-hidden />} onClick={dropzone.openPicker} className="h-6 px-1.5 text-role-micro">
          Add photos
        </Button>
        <span className="text-text-muted">or drop / paste images on the form</span>
      </div>
      <ComposerStagedPhotoStrip staged={staged.faces} onRemove={staged.remove} />
    </div>
  );
}

/** (5) Who owns the item — staff chips (avatar + name) and the house staff combobox to add one. */
export function SupportItemOwners({ assignees, onChange }: { assignees: number[]; onChange: (next: number[]) => void }) {
  const directory = useActiveStaffDirectory();
  const [picking, setPicking] = useState(false);
  const [find, setFind] = useState('');
  const nameOf = (id: number) => directory.find((s) => s.id === id)?.name ?? `Staff #${id}`;

  const candidates = useMemo(() => {
    const needle = find.trim().toLowerCase();
    return directory
      .filter((staff) => !assignees.includes(staff.id) && (!needle || staff.name.toLowerCase().includes(needle)))
      .map((staff) => ({
        id: staff.id,
        name: staff.name,
        leading: <StaffAvatar staffId={staff.id} name={staff.name} size="sm" colorRing alt="" />,
      }));
  }, [assignees, directory, find]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold text-text-default" data-testid="support-item-owners">
        <span className="text-text-muted">Who</span>
        {assignees.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-sunken py-0.5 pl-0.5 pr-1">
            <StaffAvatar staffId={id} name={nameOf(id)} size="xs" alt="" />
            <StaffBadge staffId={id} name={nameOf(id)} />
            <IconButton
              size="xs"
              radius="pill"
              ariaLabel={`Remove ${nameOf(id)}`}
              onClick={() => onChange(assignees.filter((x) => x !== id))}
              icon={<X aria-hidden className="size-3" />}
            />
          </span>
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus aria-hidden />}
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
          className="h-6 px-1.5 text-role-micro"
        >
          Add
        </Button>
      </div>
      {picking ? (
        <div className="overflow-hidden rounded-xl border border-border-hairline">
          <AssigneeComboboxPanel
            query={find}
            onQueryChange={setFind}
            rows={candidates}
            loading={directory.length === 0}
            emptyMessage={directory.length === 0 ? 'Loading staff…' : 'Everyone is already on it'}
            roster={false}
            autoFocusSearch
            onEscape={() => setPicking(false)}
            onSelect={(row) => {
              onChange([...assignees, row.id]);
              setFind('');
              setPicking(false);
            }}
          />
        </div>
      ) : null}
    </>
  );
}

/** The whole form is the photo drop target: say so while a file is over it. */
export function PhotoDropVeil({ active }: { active: boolean }) {
  const presence = useMotionPresence(motionPresence.workOrderScrim);
  const transition = useMotionTransition(motionTransition.overlayScrim);
  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          {...presence}
          transition={transition}
          className="pointer-events-none absolute inset-1 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-border bg-surface-sunken/80 text-accent-bg backdrop-blur-sm"
          data-testid="support-item-drop"
        >
          <Upload aria-hidden className="size-7" />
          <p className="text-role-caption font-semibold">Drop photos to attach</p>
          <p className="text-role-caption font-semibold text-text-soft">They land on the new item’s Media tab</p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
