'use client';

import { StaffAvatar } from '@/components/identity';
import { getStaffTheme } from '@/utils/staff-colors';

interface StaffSigningInProps {
  staff: { id?: number; name: string; color_hex?: string; avatar_photo_id?: number | null };
}

/** Shown after a pinless tap while the session is being created. */
export function StaffSigningIn({ staff }: StaffSigningInProps) {
  const theme = getStaffTheme(staff);
  const ring =
    theme === 'green' ? 'ring-emerald-100'
    : theme === 'blue' ? 'ring-blue-100'
    : theme === 'purple' ? 'ring-purple-100'
    : theme === 'yellow' ? 'ring-amber-100'
    : theme === 'red' ? 'ring-red-100'
    : theme === 'lightblue' ? 'ring-sky-100'
    : theme === 'pink' ? 'ring-pink-100'
    : 'ring-border-soft';

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
      <StaffAvatar
        staffId={staff.id ?? null}
        name={staff.name}
        colorHex={staff.color_hex ?? undefined}
        avatarPhotoId={staff.avatar_photo_id ?? null}
        size="xl"
        ring={false}
        className={`ring-4 ${ring}`}
      />
      <div>
        <p className="text-lg font-semibold tracking-tight text-text-default">Signing in as {staff.name}</p>
        <p className="mt-1.5 text-sm text-text-soft">One moment…</p>
      </div>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-soft border-t-text-muted" aria-hidden />
    </div>
  );
}
