'use client';

/**
 * Drawer/rail bottom bar — staff colour + initials bubble at the far left,
 * name with the signed-in email under it, no hairline: separation from the
 * nav list above is a soft
 * drop shadow (elevation token). The row is EDGE-TO-EDGE — no side padding on
 * the button, the bubble sits flush left — and the whole bar is the door to
 * `/m/settings`.
 *
 * Callers: `MobileSidebarDrawer`. Affected API: none.
 * User (2026-09-14): "remove the hairline at the bottom of the mobile nav and
 * just a drop shadow and just the staffs name only use shadCN UI for this" ·
 * "just the bottom bar first" · "keep the staff color and initial bubble on
 * the most left and the button must be edge to edge no padding on the edges
 * for just the bottom".
 * The bar is ONE door, not a toolbar: avatar + name + email, full-bleed, to
 * `/m/settings`. It carried trailing Switch-staff / Log-out squares for a
 * while; the operator pulled them (2026-09-23: *"it must display at the
 * bottom of settings, not a logout button and a switch staff button at the
 * bottom of the sidebar on mobile"*). Both shift-change verbs live at the
 * foot of `/m/settings` (`MobileSettingsList`) — one place, not two.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { elevationClass } from '@/design-system/tokens/shadows';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/_cn';

export function MobileAccountFooter({
  className,
  onNavigate,
  /** Explicit override / render-contract seam; defaults to the signed-in staff. */
  displayName,
}: {
  className?: string;
  onNavigate?: () => void;
  displayName?: string;
}) {
  const { user } = useAuth();
  const name = displayName ?? (user ? user.name?.trim() || `Staff #${user.staffId}` : null);
  if (!name) return null;

  return (
    <footer
      className={cn(
        'flex w-full shrink-0 items-center bg-surface-card',
        elevationClass('raised', 'soft'),
        className,
      )}
    >
      {/* shadcn ghost chrome (not an ops CTA — the DS Button law is untouched);
          asChild merges the row onto the anchor so the whole bar is the door.
          The BUTTON is edge-to-edge (px-0: full-bleed tap + hover fill); the
          CONTENT carries the inset (px-3 on the inner wrapper) — the standard
          full-bleed-row pattern: interactive surface spans the bar, content
          starts inset. */}
      <Button
        asChild
        variant="ghost"
        aria-label={`Settings, signed in as ${name}`}
        className="h-auto min-h-11 min-w-0 flex-1 justify-start px-0 py-2.5 text-left text-text-default"
      >
        <Link href="/m/settings" prefetch={false} onClick={onNavigate}>
          <span className="flex w-full items-center gap-2.5 px-3">
            <StaffAvatar
              staffId={user?.staffId ?? null}
              name={name}
              avatarPhotoId={null}
              size="md"
              alt=""
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium leading-tight">{name}</span>
              {user?.email ? (
                <span className="block truncate text-role-micro font-normal leading-tight text-text-soft">
                  {user.email}
                </span>
              ) : null}
            </span>
          </span>
        </Link>
      </Button>
    </footer>
  );
}
