'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import type {
  ClaimMode,
  ClaimPhotoInput,
  ClaimPriority,
  ClaimResult,
  ZendeskClaimModalProps,
} from './claim-types';

export type ZendeskClaimController = ReturnType<typeof useZendeskClaimController>;

interface AddedFile {
  id: string;
  file: File;
  url: string;
}

let addedSeq = 0;

/**
 * All state + the submit pipeline for {@link ZendeskClaimModal}. Thin shell +
 * presentational sections read from this (the God-component split pattern).
 */
export function useZendeskClaimController(props: ZendeskClaimModalProps) {
  const { open, onClose, photos, defaultMode, defaultTicketId, onDone } = props;

  const [mode, setMode] = useState<ClaimMode>(defaultMode ?? 'update');

  // ── Create fields ──────────────────────────────────────────────────────────
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ClaimPriority>('normal');
  const [tags, setTags] = useState<string[]>([]);
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  // First comment is internal by default so filing a ticket never emails anyone.
  const [createPublic, setCreatePublic] = useState(false);

  // The library selection is the only way photos are chosen; the modal attaches all of them.
  const [libraryPhotos, setLibraryPhotos] = useState<ClaimPhotoInput[]>([]);

  // ── Attachments: the library selection + ad-hoc dropped files ────────────────
  const [added, setAdded] = useState<AddedFile[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);

  // Seed once on open; reset once on close. A ref guard keeps `photos` changes
  // from re-seeding mid-edit and stops the close-reset from looping.
  const booted = useRef(false);
  useEffect(() => {
    if (open && !booted.current) {
      booted.current = true;
      setLibraryPhotos(photos);
      setMode(defaultMode ?? 'update');
      const refs = Array.from(
        new Set(photos.map((p) => p.poRef?.trim()).filter((v): v is string => Boolean(v))),
      );
      const poPart = refs.length === 1 ? ` — PO ${refs[0]}` : '';
      setSubject(`Photo evidence${poPart}`);
      setDescription(
        `Attaching ${photos.length} photo${photos.length === 1 ? '' : 's'} from the library` +
          (refs.length ? ` for ${refs.map((r) => `PO ${r}`).join(', ')}` : '') +
          '.',
      );
    }
    if (!open && booted.current) {
      booted.current = false;
      setLibraryPhotos([]);
      setMode(defaultMode ?? 'update');
      setSubject('');
      setDescription('');
      setPriority('normal');
      setTags([]);
      setRequesterName('');
      setRequesterEmail('');
      setCreatePublic(false);
      setAdded((prev) => {
        prev.forEach((a) => URL.revokeObjectURL(a.url));
        return [];
      });
      setSubmitting(false);
      setError(null);
      setResult(null);
    }
  }, [open, defaultMode, photos]);

  const includedPhotoIds = useMemo(() => libraryPhotos.map((p) => p.id), [libraryPhotos]);

  const addFiles = useCallback((files: File[]) => {
    setAdded((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `added-${(addedSeq += 1)}`,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
  }, []);

  const removeAdded = useCallback((id: string) => {
    setAdded((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const totalAttach = includedPhotoIds.length + added.length;

  // Link replies through the ticket's own composer (ClaimTicketReply);
  // this pipeline files a NEW ticket.
  const canSubmit =
    !submitting && mode === 'create' && subject.trim().length > 0 && description.trim().length > 0;

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const meta = {
        mode: 'create' as const,
        subject: subject.trim(),
        description: description.trim(),
        isPublic: createPublic,
        priority,
        tags: tags.length ? tags : undefined,
        requester:
          requesterName || requesterEmail
            ? { name: requesterName || undefined, email: requesterEmail || undefined }
            : undefined,
        photoIds: includedPhotoIds,
      };

      const fd = new FormData();
      fd.append('meta', JSON.stringify(meta));
      added.forEach((a) => fd.append('files', a.file, a.file.name));

      const res = await fetch('/api/zendesk/photo-ticket', { method: 'POST', body: fd });
      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; message?: string; ticket?: { id: number; number: string; url: string | null }; attached?: number }
        | null;
      if (!res.ok || !data?.success || !data.ticket) {
        throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
      }
      const r: ClaimResult = {
        ticketId: data.ticket.id,
        number: data.ticket.number,
        url: data.ticket.url ?? null,
        mode: 'create',
        attached: data.attached ?? 0,
      };
      setResult(r);
      onDone?.(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    subject,
    description,
    createPublic,
    priority,
    tags,
    requesterName,
    requesterEmail,
    includedPhotoIds,
    added,
    onDone,
  ]);

  return {
    open,
    onClose,
    photos: libraryPhotos,
    libraryPhotos,
    mode,
    setMode,
    // create
    subject,
    setSubject,
    description,
    setDescription,
    priority,
    setPriority,
    tags,
    setTags,
    requesterName,
    setRequesterName,
    requesterEmail,
    setRequesterEmail,
    createPublic,
    setCreatePublic,
    // update — the ticket to open on, when launched from a ticket context
    defaultTicketId: defaultTicketId ?? null,
    // attachments
    includedPhotoIds,
    added,
    addFiles,
    removeAdded,
    totalAttach,
    // status
    submitting,
    error,
    result,
    canSubmit,
    submit,
  };
}
