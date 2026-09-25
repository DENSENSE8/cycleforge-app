'use client';

/**
 * The open task's evidence — its links and its media — as queries, plus the
 * writes the evidence column makes.
 *
 * Keys live under `['tasks', …]` beside the desk's own `['tasks','desk',…]`,
 * and every write here ALSO invalidates the desk: the ledger row paints the
 * link faces and the photo / video counts, so a link added in the column must
 * repaint the row it was added to or the two disagree about the same task.
 */

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deletePhoto } from '@/components/shipped/photo-gallery/photo-gallery-api';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { uploadVideoClient } from '@/lib/photos/video-upload-client';
import { normalizeMime } from '@/lib/photos/video-upload-rules';
import {
  TASK_LINK_REFUSAL_COPY,
  TASK_MEDIA_ENTITY_TYPE,
  type TaskLink,
  type TaskLinkCreateBody,
  type TaskLinksPayload,
  type TaskMediaPayload,
} from '@/lib/tasks/task-links-shared';
import {
  TASK_DOCUMENT_REFUSAL_COPY,
  type PlanFileEntry,
  type PlanFilesPayload,
  type TaskDocument,
  type TaskDocumentCreateBody,
  type TaskDocumentMeta,
  type TaskDocumentPayload,
  type TaskDocumentsPayload,
} from '@/lib/tasks/task-documents-shared';
import {
  MEDIA_LINK_REFUSAL_COPY,
  type TaskMediaLink,
  type TaskMediaLinkCreateBody,
  type TaskMediaLinkPatchBody,
} from '@/lib/tasks/media-links';
import { toast } from '@/lib/toast';

const VIDEO_EXTENSION = /\.(mp4|m4v|mov|qt|webm)$/i;

async function readJson<T>(res: Response, refusalCopy?: Readonly<Record<string, string>>): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    const reason = typeof data.error === 'string' ? data.error : '';
    throw new Error(refusalCopy?.[reason] ?? (reason || `Request failed (${res.status})`));
  }
  return data as T;
}

export function useTaskLinks(taskId: number | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['tasks', 'links', taskId],
    enabled: taskId != null,
    queryFn: async (): Promise<TaskLink[]> => {
      const res = await fetch(`/api/tasks/${taskId}/links`, { cache: 'no-store' });
      return (await readJson<TaskLinksPayload>(res)).links;
    },
  });

  const settle = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['tasks', 'links', taskId] });
    void queryClient.invalidateQueries({ queryKey: ['tasks', 'desk'] });
  }, [queryClient, taskId]);

  const add = useMutation({
    mutationFn: async (body: TaskLinkCreateBody): Promise<TaskLink> => {
      const res = await fetch(`/api/tasks/${taskId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await readJson<{ link: TaskLink }>(res, TASK_LINK_REFUSAL_COPY)).link;
    },
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: async (linkId: number) => {
      const res = await fetch(`/api/tasks/${taskId}/links?linkId=${linkId}`, { method: 'DELETE' });
      await readJson(res);
    },
    onSettled: settle,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not remove the link.'),
  });

  return { links: query.data ?? [], loading: query.isLoading, error: query.error, add, remove };
}

/** Upload progress, one file at a time — the column paints `Uploading 2/5 · 40%`. */
export interface TaskMediaUploadState {
  done: number;
  total: number;
  /** 0–1 of the CURRENT file, videos only (photos are one request). */
  fraction: number | null;
}

export function useTaskMedia(taskId: number | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['tasks', 'media', taskId],
    enabled: taskId != null,
    queryFn: async (): Promise<TaskMediaPayload> => {
      const res = await fetch(`/api/tasks/${taskId}/media`, { cache: 'no-store' });
      return readJson<TaskMediaPayload>(res);
    },
  });

  const settle = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks', 'media', taskId] }),
      queryClient.invalidateQueries({ queryKey: ['tasks', 'desk'] }),
    ]);
  }, [queryClient, taskId]);

  const [uploading, setUploading] = useState<TaskMediaUploadState | null>(null);

  /**
   * Photos and videos through ONE door — a drop, a paste or a picker hands a
   * mixed bag, and asking the operator to sort it first is a step that says
   * nothing. Images take the multipart photo route; videos go direct to GCS
   * through the signed two-step upload, so a 400 MB clip never transits a
   * function. Sequential, so the progress face is one honest number.
   */
  const upload = useCallback(
    async (files: readonly File[]) => {
      if (taskId == null || files.length === 0) return;
      let photos = 0;
      let videos = 0;
      setUploading({ done: 0, total: files.length, fraction: null });
      for (const [index, file] of files.entries()) {
        try {
          if (normalizeMime(file.type).startsWith('video/') || VIDEO_EXTENSION.test(file.name)) {
            await uploadVideoClient({
              file,
              entityType: TASK_MEDIA_ENTITY_TYPE,
              entityId: taskId,
              onProgress: (fraction) => setUploading({ done: index, total: files.length, fraction }),
            });
            videos += 1;
          } else {
            await uploadPhotoClient({
              file,
              entityType: TASK_MEDIA_ENTITY_TYPE,
              entityId: taskId,
              clientCapturedAtMs: file.lastModified || null,
            });
            photos += 1;
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `Could not upload ${file.name}`);
        }
        setUploading({ done: index + 1, total: files.length, fraction: null });
      }
      setUploading(null);
      await settle();
      const added = [
        photos > 0 ? `${photos} photo${photos === 1 ? '' : 's'}` : null,
        videos > 0 ? `${videos} video${videos === 1 ? '' : 's'}` : null,
      ].filter(Boolean);
      if (added.length > 0) toast.success(`Added ${added.join(' and ')}`);
    },
    [settle, taskId],
  );

  const removePhoto = useMutation({
    mutationFn: async ({ id, url }: { id: number; url: string }) => deletePhoto(id, url),
    onSettled: settle,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not delete the photo.'),
  });

  const removeVideo = useMutation({
    mutationFn: async (videoId: number) => {
      const res = await fetch(`/api/photos/videos/${videoId}`, { method: 'DELETE' });
      await readJson(res);
    },
    onSettled: settle,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not delete the video.'),
  });

  /**
   * Media by URL — an unlisted YouTube walkthrough, a Loom, a hosted image.
   * The server parses and stores the embed (`parseMediaLink`); these are its
   * full CRUD. Mutations resolve with the stored link or throw the refusal.
   */
  const addLink = useMutation({
    mutationFn: async (body: TaskMediaLinkCreateBody): Promise<TaskMediaLink> => {
      const res = await fetch(`/api/tasks/${taskId}/media/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await readJson<{ link: TaskMediaLink }>(res, MEDIA_LINK_REFUSAL_COPY)).link;
    },
    onSettled: settle,
  });

  const updateLink = useMutation({
    mutationFn: async ({ id, ...body }: TaskMediaLinkPatchBody & { id: number }): Promise<TaskMediaLink> => {
      const res = await fetch(`/api/tasks/${taskId}/media/links?linkId=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await readJson<{ link: TaskMediaLink }>(res, MEDIA_LINK_REFUSAL_COPY)).link;
    },
    onSettled: settle,
  });

  const removeLink = useMutation({
    mutationFn: async (linkId: number) => {
      const res = await fetch(`/api/tasks/${taskId}/media/links?linkId=${linkId}`, { method: 'DELETE' });
      await readJson(res, MEDIA_LINK_REFUSAL_COPY);
    },
    onSettled: settle,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not remove the link.'),
  });

  return {
    photos: query.data?.photos ?? [],
    videos: query.data?.videos ?? [],
    links: query.data?.links ?? [],
    loading: query.isLoading,
    error: query.error,
    uploading,
    upload,
    removePhoto,
    removeVideo,
    addLink,
    updateLink,
    removeLink,
  };
}

export function useTaskDocuments(taskId: number | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['tasks', 'documents', taskId],
    enabled: taskId != null,
    queryFn: async (): Promise<TaskDocumentMeta[]> => {
      const res = await fetch(`/api/tasks/${taskId}/documents`, { cache: 'no-store' });
      return (await readJson<TaskDocumentsPayload>(res, TASK_DOCUMENT_REFUSAL_COPY)).documents;
    },
  });

  const settle = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['tasks', 'documents', taskId] });
    void queryClient.invalidateQueries({ queryKey: ['tasks', 'desk'] });
  }, [queryClient, taskId]);

  const add = useMutation({
    mutationFn: async (body: TaskDocumentCreateBody): Promise<TaskDocumentMeta> => {
      const res = await fetch(`/api/tasks/${taskId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await readJson<{ document: TaskDocumentMeta }>(res, TASK_DOCUMENT_REFUSAL_COPY)).document;
    },
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: async (docId: number) => {
      const res = await fetch(`/api/tasks/${taskId}/documents?docId=${docId}`, { method: 'DELETE' });
      await readJson(res, TASK_DOCUMENT_REFUSAL_COPY);
    },
    onSettled: settle,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not remove the document.'),
  });

  return { documents: query.data ?? [], loading: query.isLoading, add, remove };
}

/** One document's markdown — a repo plan file is read as it is NOW, on every open. */
export function useTaskDocument(taskId: number, docId: number | null) {
  return useQuery({
    queryKey: ['tasks', 'documents', taskId, docId],
    enabled: docId != null,
    queryFn: async (): Promise<TaskDocument> => {
      const res = await fetch(`/api/tasks/${taskId}/documents?docId=${docId}`, { cache: 'no-store' });
      return (await readJson<TaskDocumentPayload>(res, TASK_DOCUMENT_REFUSAL_COPY)).document;
    },
  });
}

/** The codebase's plan files, searched on the server (the catalog is hundreds of files). */
export function usePlanFiles(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['tasks', 'plan-files', q],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<PlanFileEntry[]> => {
      const res = await fetch(`/api/tasks/plan-files?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      return (await readJson<PlanFilesPayload>(res)).files;
    },
  });
}
