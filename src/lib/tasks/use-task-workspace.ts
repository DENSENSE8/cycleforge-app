'use client';

/** The open task's evidence — its links and its media — as queries, plus the writes the evidence column makes. */

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deletePhoto } from '@/lib/photos/delete-photo-client';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { uploadVideoClient } from '@/lib/photos/video-upload-client';
import { screenTaskMediaFiles } from '@/lib/tasks/task-media-lessons';
import {
  TASK_LINK_REFUSAL_COPY,
  TASK_MEDIA_ENTITY_TYPE,
  type TaskLink,
  type TaskLinkCreateBody,
  type TaskLinksPayload,
  type TaskMediaPayload,
} from '@/lib/tasks/task-links-shared';
import {
  TASK_FOLLOW_UP_REFUSAL_COPY,
  type TaskFollowUp,
  type TaskFollowUpCreateBody,
  type TaskFollowUpLogPayload,
  type TaskFollowUpsPayload,
} from '@/lib/tasks/task-follow-ups-shared';
import {
  TASK_DOCUMENT_REFUSAL_COPY,
  type PlanFileEntry,
  type PlanFilesPayload,
  type TaskDocument,
  type TaskDocumentCreateBody,
  type TaskDocumentMeta,
  type TaskDocumentPatchBody,
  type TaskDocumentPayload,
  type TaskDocumentsPayload,
} from '@/lib/tasks/task-documents-shared';
import {
  TASK_DOC_COMMENT_REFUSAL_COPY,
  type TaskDocComment,
  type TaskDocCommentCreateBody,
  type TaskDocCommentsPayload,
} from '@/lib/tasks/task-document-comments-shared';
import {
  MEDIA_LINK_REFUSAL_COPY,
  type TaskMediaLink,
  type TaskMediaLinkCreateBody,
  type TaskMediaLinkPatchBody,
} from '@/lib/tasks/media-links';
import { toast } from '@/lib/toast';

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

/** The open task's follow-up log, newest first, plus the Log write. */
export function useTaskFollowUps(taskId: number | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['tasks', 'follow-ups', taskId],
    enabled: taskId != null,
    queryFn: async (): Promise<TaskFollowUp[]> => {
      const res = await fetch(`/api/tasks/${taskId}/follow-ups`, { cache: 'no-store' });
      return (await readJson<TaskFollowUpsPayload>(res)).followUps;
    },
  });

  const log = useMutation({
    mutationFn: async (body: TaskFollowUpCreateBody): Promise<TaskFollowUp> => {
      const res = await fetch(`/api/tasks/${taskId}/follow-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await readJson<TaskFollowUpLogPayload>(res, TASK_FOLLOW_UP_REFUSAL_COPY)).followUp;
    },
    // The desk row carries lastFollowUpAtMs / nextFollowUpAtMs, so it re-reads too.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'follow-ups', taskId] });
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'desk'] });
    },
  });

  return { followUps: query.data ?? [], loading: query.isLoading, error: query.error, log };
}

/** Upload progress, one file at a time — the surface paints `Uploading clip.mp4 · 40% · 1 of 3`. */
export interface TaskMediaUploadState {
  done: number;
  total: number;
  /** The file in flight. */
  name: string;
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
  /** Refused or failed files, in operator words — painted inline until the next upload or a dismiss. */
  const [problems, setProblems] = useState<string[]>([]);

  /** Photos and videos through ONE door — a drop, a paste or a picker hands a mixed bag, and asking the operator to sort it first is a step… */
  const upload = useCallback(
    async (files: readonly File[]) => {
      if (taskId == null || files.length === 0) return;
      const { accepted, refused } = screenTaskMediaFiles(files);
      const failed = [...refused];
      setProblems(failed);
      if (accepted.length === 0) return;
      let photos = 0;
      let videos = 0;
      for (const [index, { file, kind }] of accepted.entries()) {
        setUploading({ done: index, total: accepted.length, name: file.name, fraction: kind === 'video' ? 0 : null });
        try {
          if (kind === 'video') {
            await uploadVideoClient({
              file,
              entityType: TASK_MEDIA_ENTITY_TYPE,
              entityId: taskId,
              onProgress: (fraction) => setUploading({ done: index, total: accepted.length, name: file.name, fraction }),
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
          failed.push(`${file.name} did not upload — ${err instanceof Error ? err.message : 'try again.'}`);
          setProblems([...failed]);
        }
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
    problems,
    dismissProblems: () => setProblems([]),
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

/**
 * Save one document (`PATCH …?docId=`), guarded by the `updatedAt` the editor
 * loaded. A 409 throws `TASK_DOCUMENT_REFUSAL_COPY.stale_document` and leaves
 * the cache alone, so the editor keeps the unsaved draft on screen.
 */
export function useSaveTaskDocument(taskId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, body }: { docId: number; body: TaskDocumentPatchBody }): Promise<TaskDocument> => {
      const res = await fetch(`/api/tasks/${taskId}/documents?docId=${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await readJson<TaskDocumentPayload>(res, TASK_DOCUMENT_REFUSAL_COPY)).document;
    },
    onSuccess: (document) => {
      queryClient.setQueryData(['tasks', 'documents', taskId, document.id], document);
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'documents', taskId], exact: true });
    },
  });
}

/** Comments on one document, oldest first, with post / resolve / remove. */
export function useTaskDocComments(taskId: number, docId: number | null) {
  const queryClient = useQueryClient();
  const key = ['tasks', 'documents', taskId, docId, 'comments'] as const;
  const query = useQuery({
    queryKey: key,
    enabled: docId != null,
    queryFn: async (): Promise<TaskDocComment[]> => {
      const res = await fetch(`/api/tasks/${taskId}/documents/comments?docId=${docId}`, { cache: 'no-store' });
      return (await readJson<TaskDocCommentsPayload>(res, TASK_DOC_COMMENT_REFUSAL_COPY)).comments;
    },
  });
  const settle = () => void queryClient.invalidateQueries({ queryKey: key });
  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not update the comment.');

  const post = useMutation({
    mutationFn: async (body: Omit<TaskDocCommentCreateBody, 'docId'>): Promise<TaskDocComment> => {
      const res = await fetch(`/api/tasks/${taskId}/documents/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, docId }),
      });
      return (await readJson<{ comment: TaskDocComment }>(res, TASK_DOC_COMMENT_REFUSAL_COPY)).comment;
    },
    onSettled: settle,
    onError,
  });

  const resolve = useMutation({
    mutationFn: async ({ commentId, resolved }: { commentId: number; resolved: boolean }) => {
      const res = await fetch(`/api/tasks/${taskId}/documents/comments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId, commentId, resolved }),
      });
      await readJson(res, TASK_DOC_COMMENT_REFUSAL_COPY);
    },
    onSettled: settle,
    onError,
  });

  const remove = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await fetch(`/api/tasks/${taskId}/documents/comments?docId=${docId}&commentId=${commentId}`, {
        method: 'DELETE',
      });
      await readJson(res, TASK_DOC_COMMENT_REFUSAL_COPY);
    },
    onSettled: settle,
    onError,
  });

  return { comments: query.data ?? [], loading: query.isLoading, error: query.error, post, resolve, remove };
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
