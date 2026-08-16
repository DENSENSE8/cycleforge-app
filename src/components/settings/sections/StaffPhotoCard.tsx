'use client';

/**
 * Settings → Appearance ▸ "Your photo". The one place a staffer sets their own
 * profile photo; an admin does the same for someone else through the identical
 * route (`/api/staff/[id]/avatar`), which authorizes self OR
 * `admin.manage_staff`.
 *
 * Uploads go through the photos platform waist, not a second uploader: this
 * component posts the file to that route, which calls `uploadPhoto()` → GCS →
 * `photo_entity_links(entity_type='STAFF')` and points `staff.avatar_photo_id`
 * at the result.
 *
 * The optimistic patch is a CACHE patch, not a full replace: it flips this
 * staffer's mark everywhere on screen (spine footer, any open timeline) before
 * `/api/staff` refetches, without discarding every other staffer's warm colour.
 */

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { StaffAvatar } from '@/components/identity';
import { Panel, Button } from '@/design-system/primitives';
import { Loader2 } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { qk } from '@/queries/keys';
import { getStaffAvatarPhotoId, setStaffAvatarPhotoId } from '@/utils/staff-colors';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';

/** Mirrors the upload waist's ALLOWED_MIME so a reject is caught before the POST. */
const ACCEPTED = 'image/jpeg,image/png,image/webp';

export function StaffPhotoCard() {
  const { user, refresh } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useStaffColorVersion();

  if (!user) return null;

  const staffId = user.staffId;
  const hasPhoto = !!getStaffAvatarPhotoId(staffId);

  async function commit(action: 'upload' | 'clear', file?: File) {
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
      // Patch the one staffer, then let the durable sources catch up.
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

  return (
    <Panel radius="2xl">
      <h3 className="mb-3 text-sm font-semibold text-text-default">Your photo</h3>
      <div className="flex items-center gap-4">
        <StaffAvatar
          staffId={staffId}
          name={user.name}
          size="lg"
          alt={`Profile photo for ${user.name}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-role-caption text-text-soft">
            Shown wherever your work is attributed — the sidebar, sign-in, timelines and unit
            journeys. Without one, your initials on your staff colour are used instead.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void commit('upload', file);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => inputRef.current?.click()}
            >
              {busy === 'upload' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : hasPhoto ? (
                'Replace photo'
              ) : (
                'Upload photo'
              )}
            </Button>
            {hasPhoto ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void commit('clear')}
              >
                {busy === 'clear' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Removing…
                  </>
                ) : (
                  'Remove'
                )}
              </Button>
            ) : null}
          </div>
          {error ? (
            <p className="mt-2 text-role-caption text-text-danger" role="status">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function buildForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}
