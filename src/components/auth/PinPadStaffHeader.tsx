'use client';

/** @domain-job Staff identity header above a PIN numpad (back, avatar, name, role). */

// Deep path, not the barrel — see the note in `src/app/signin/page.tsx`.
import { Button } from '@/design-system/primitives/Button';
import { StaffAvatar } from '@/components/identity';
import { numpadTheme } from '@/components/auth/theme-numpad';
import type { StationTheme } from '@/utils/staff-colors';

export function PinPadStaffHeader({
  staff,
  theme,
  onBack,
}: {
  staff: {
    id: number;
    name: string;
    role: string;
    color_hex?: string;
    avatar_photo_id?: number | null;
  };
  theme: StationTheme;
  onBack?: () => void;
}) {
  const t = numpadTheme(theme);
  return (
    <>
      {onBack && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onBack}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>}
          className="absolute left-4 top-4"
        >
          Not you?
        </Button>
      )}

      <div className="relative">
        <div className={`absolute -inset-3 rounded-full bg-gradient-radial ${t.haloFrom} to-transparent blur-2xl opacity-70`} aria-hidden />
        <StaffAvatar
          staffId={staff.id}
          name={staff.name}
          colorHex={staff.color_hex ?? undefined}
          avatarPhotoId={staff.avatar_photo_id ?? null}
          size="2xl"
          ring={false}
          className="relative shadow-lg shadow-gray-900/10 ring-4 ring-white"
        />
      </div>
      <div className="mt-5 text-2xl font-semibold tracking-tight text-text-default">{staff.name}</div>
      <div className={`mt-0.5 text-role-caption font-medium uppercase tracking-[0.18em] ${t.accentText}`}>
        {staff.role.replace(/_/g, ' ')}
      </div>
    </>
  );
}
