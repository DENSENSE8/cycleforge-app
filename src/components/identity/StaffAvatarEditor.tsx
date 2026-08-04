'use client';

/**
 * Clickable staff mark — name, color and photo without opening Settings.
 *
 * Composes the ONE upload waist (`POST`/`DELETE /api/staff/[id]/avatar`), the
 * self-service color route (`PATCH /api/staff/[id]/color`) and the name route
 * (`PATCH /api/staff/[id]/name`). Optimistic cache patches
 * ({@link setStaffAvatarPhotoId} / {@link setStaffColorHex}) flip every
 * on-screen mark before `/api/staff` refetches.
 *
 * Mounted from the MasterNav spine footer; Settings → Appearance still owns
 * the long-form copy, but operators should not have to leave the spine to
 * change their face.
 *
 * ## The header is the name, and the name is editable in place
 *
 * The header carries the staff name alone — no "Photo & colour" subtitle. That
 * line restated what the two section headings below it already said, and a
 * popover this small cannot afford a row that carries no fact. Clicking the name
 * turns it into an input: a rename is a one-field edit, so sending the operator
 * to Settings for it costs more than the edit is worth.
 *
 * Commit is Enter or blur; Escape reverts. A blur commit is safe here ONLY
 * because the route no-ops an unchanged name — otherwise every dismissal of the
 * popover would write, and the audit trail would fill with renames nobody made.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RoleColorPicker } from '@/components/admin/roles/RoleColorPicker';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { AnchoredLayer } from '@/design-system';
import { Button, IconButton } from '@/design-system/primitives';
import { Loader2, Pencil } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { qk } from '@/queries/keys';
import {
  getStaffAvatarPhotoId,
  getStaffColorHex,
  setStaffAvatarPhotoId,
  setStaffColorHex,
} from '@/utils/staff-colors';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const ACCEPTED = 'image/jpeg,image/png,image/webp';

export function StaffAvatarEditor({
  className,
  markSize = 'sm',
}: {
  className?: string;
  /** Trigger mark size — spine footer uses `xs` for a denser account row. */
  markSize?: 'xs' | 'sm';
}) {
  const { user, refresh } = useAuth();
  const queryClient = useQueryClient();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'upload' | 'clear' | 'color' | 'name' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  useStaffColorVersion();

  // Focus + select on entry, so the whole name is replaceable with one keystroke.
  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  if (!user) return null;

  const staffId = user.staffId;
  const staffName = user.name ?? '';
  const hasPhoto = !!getStaffAvatarPhotoId(staffId);
  const colorHex = getStaffColorHex({ id: staffId });

  async function commitPhoto(action: 'upload' | 'clear', file?: File) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${staffId}/avatar`, {
        method: action === 'clear' ? 'DELETE' : 'POST',
        body: action === 'clear' ? undefined : buildForm(file!),
      });
      const json = (await res.json().catch(() => ({}))) as {
        avatarPhotoId?: number | null;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error || 'Could not update your photo. Please try again.');
        return;
      }
      setStaffAvatarPhotoId(staffId, json.avatarPhotoId ?? null);
      await queryClient.invalidateQueries({ queryKey: qk.staff.all });
      await refresh();
    } catch {
      setError('Could not update your photo. Please try again.');
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function commitColor(hex: string) {
    if (hex.toLowerCase() === colorHex.toLowerCase()) return;
    setBusy('color');
    setError(null);
    // Optimistic — the mark flips immediately; roll back only on failure.
    setStaffColorHex(staffId, hex);
    try {
      const res = await fetch(`/api/staff/${staffId}/color`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color_hex: hex }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        colorHex?: string;
        error?: string;
      };
      if (!res.ok) {
        setStaffColorHex(staffId, colorHex);
        setError(json.error || 'Could not update your color. Please try again.');
        return;
      }
      if (json.colorHex) setStaffColorHex(staffId, json.colorHex);
      await queryClient.invalidateQueries({ queryKey: qk.staff.all });
    } catch {
      setStaffColorHex(staffId, colorHex);
      setError('Could not update your color. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function commitName(next: string) {
    const trimmed = next.trim();
    setEditingName(false);
    // Unchanged or emptied → drop the edit rather than writing. Empty is a
    // slip, not an intent: a nameless staffer would render as a blank pill on
    // every timeline they appear in.
    if (!trimmed || trimmed === staffName) return;

    setBusy('name');
    setError(null);
    try {
      const res = await fetch(`/api/staff/${staffId}/name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        name?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error || 'Could not update your name. Please try again.');
        return;
      }
      // No optimistic cache patch: unlike color and the photo id there is no
      // name entry in the staff identity cache, so the auth envelope refresh IS
      // the update path. Inventing a second store for it would be a fork.
      await queryClient.invalidateQueries({ queryKey: qk.staff.all });
      await refresh();
    } catch {
      setError('Could not update your name. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <HoverTooltip label="Edit your name, color or photo" asChild>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Edit your name, color or photo"
          aria-expanded={open}
          aria-haspopup="dialog"
          className={cn(
            'ds-raw-button shrink-0 rounded-full transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong',
            className,
          )}
        >
          <StaffAvatar
            staffId={staffId}
            name={staffName}
            size={markSize}
            alt={`Profile photo for ${staffName || `Staff #${staffId}`}`}
          />
        </button>
      </HoverTooltip>

      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="top-start"
        gap={4}
      >
        <div
          aria-label="Your name, color and photo"
          className="w-[220px] overflow-hidden rounded-lg border border-border-soft bg-surface-card p-2 shadow-md"
        >
          <div className="mb-2 flex items-center gap-2">
            {/* `md` (36px) — the house default. The mark was bumped to `lg`
                only to counterbalance a `role-display` name; now that the name
                is `role-title`, that justification is gone and so is the bump. */}
            <StaffAvatar staffId={staffId} name={staffName} size="md" />
            <div className="min-w-0 flex-1">
              {editingName ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  defaultValue={staffName}
                  maxLength={120}
                  aria-label="Your name"
                  disabled={busy !== null}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={(e) => void commitName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      // Revert, and swallow the key so the popover's own Escape
                      // owner does not close the whole layer on a cancelled edit
                      // (`overlay-stack` — the innermost editor owns Escape).
                      setEditingName(false);
                      setNameDraft('');
                    }
                  }}
                  className={cn(
                    'w-full rounded border border-border-default bg-surface-card px-1.5 py-0.5',
                    'text-role-title text-text-default',
                    focusRing('field', 'accent'),
                  )}
                />
              ) : (
                // Row, not a single button: the pencil is a dedicated,
                // discoverable affordance — a `HoverTooltip`-labelled icon,
                // not a hover-only cue the name text alone would have been.
                // Both halves open the same edit; the name reads at
                // `role-title` — prominent against the COLOR/PHOTO section
                // eyebrows below it, but not display-scale hero type this
                // 220px card's actual jobs (color, photo) don't call for.
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(staffName);
                      setEditingName(true);
                    }}
                    aria-label={`Edit your name — ${staffName || `Staff #${staffId}`}`}
                    className={cn(
                      'ds-raw-button min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left',
                      'text-role-title text-text-default hover:bg-surface-canvas',
                      focusRing('control', 'accent'),
                    )}
                  >
                    {busy === 'name' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {nameDraft || staffName}
                      </span>
                    ) : (
                      staffName || `Staff #${staffId}`
                    )}
                  </button>
                  <HoverTooltip label="Edit name" asChild>
                    <IconButton
                      size="sm"
                      tone="neutral"
                      disabled={busy !== null}
                      onClick={() => {
                        setNameDraft(staffName);
                        setEditingName(true);
                      }}
                      ariaLabel="Edit name"
                      icon={<Pencil className="h-3.5 w-3.5" />}
                    />
                  </HoverTooltip>
                </div>
              )}
            </div>
          </div>

          <div className="mb-2 border-t border-border-hairline pt-2">
            <div className="mb-1 text-role-micro uppercase tracking-[0.08em] text-text-faint">
              Color
            </div>
            <RoleColorPicker
              value={colorHex}
              onChange={(hex) => void commitColor(hex)}
              disabled={busy !== null}
            />
          </div>

          <div className="border-t border-border-hairline pt-2">
            <div className="mb-1.5 text-role-micro uppercase tracking-[0.08em] text-text-faint">
              Photo
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void commitPhoto('upload', file);
              }}
            />
            {/* One control. The trailing "Remove" button was dropped
                2026-08-02 — clearing a photo is a rare, reversible act that
                Settings → Appearance still owns, and a second button here made
                the row read as a choice when the common action is "set one".
                `commitPhoto('clear')` and the DELETE route are untouched, so
                restoring it is a markup change, not a rebuild. */}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => inputRef.current?.click()}
            >
              {busy === 'upload' ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                </>
              ) : hasPhoto ? (
                'Replace'
              ) : (
                'Upload'
              )}
            </Button>
          </div>

          {error ? (
            <p className="mt-2 text-role-micro text-text-danger" role="status">
              {error}
            </p>
          ) : null}
        </div>
      </AnchoredLayer>
    </>
  );
}

function buildForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}
