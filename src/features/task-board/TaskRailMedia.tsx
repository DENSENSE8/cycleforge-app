'use client';

/**
 * The rail's **Media** tab — where the owner teaches a skill (2026-09-29):
 * paste an unlisted YouTube / Vimeo / Loom / Drive link or upload a recording,
 * and staff watch it here. Composes `TaskMediaSection` over `useTaskMedia`
 * (same routes, same embeds — never a second media pipeline); this tab owns
 * the file input, drag-drop onto the tab, and paste while the tab is open.
 */

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { TaskMediaSection } from '@/features/tasks/workspace/TaskMediaSection';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { parseMediaLink } from '@/lib/tasks/media-links';
import { TASK_MEDIA_ACCEPT } from '@/lib/tasks/task-media-lessons';
import { useTaskMedia } from '@/lib/tasks/use-task-workspace';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

export function TaskRailMedia({ taskId }: { taskId: number }) {
  const media = useTaskMedia(taskId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const { upload } = media;
  const addLink = media.addLink.mutateAsync;
  // Paste lands here while the tab is open: files upload, a media link outside a field attaches.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        void upload(files);
        return;
      }
      if (isEditableKeyTarget(event.target)) return;
      const text = event.clipboardData?.getData('text/plain')?.trim() ?? '';
      if (!parseMediaLink(text).ok) return;
      event.preventDefault();
      addLink({ url: text }).then(
        () => toast.success('Video added to the task'),
        (err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not add that link.'),
      );
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [upload, addLink]);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    event.preventDefault();
    void upload(files);
  };

  return (
    <div
      className={cn(
        '-mx-2 rounded-2xl px-2 pb-2 pt-1 transition-shadow',
        dragging && 'bg-surface-hover ring-2 ring-inset ring-fuchsia-500/60',
      )}
      data-testid="task-rail-media"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={onDrop}
    >
      <input
        ref={fileRef}
        type="file"
        accept={TASK_MEDIA_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void upload(files);
        }}
        data-testid="task-media-input"
      />
      <TaskMediaSection
        photos={media.photos}
        videos={media.videos}
        links={media.links}
        loading={media.loading}
        uploading={media.uploading}
        problems={media.problems}
        onDismissProblems={media.dismissProblems}
        onPick={() => fileRef.current?.click()}
        onAddLink={addLink}
        onRenameLink={(id, title) => media.updateLink.mutateAsync({ id, title })}
        onRemoveLink={(id) => media.removeLink.mutate(id)}
        onRemoveVideo={(id) => media.removeVideo.mutate(id)}
        onRemovePhoto={(photo) => media.removePhoto.mutate({ id: photo.id, url: photo.url })}
      />
    </div>
  );
}
