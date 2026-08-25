'use client';

/**
 * TOP-LEFT IDENTITY — on shadcn `DropdownMenu` + `Avatar` (2026-08-24).
 *
 * The hand-rolled version this replaces was the surface the operator
 * pointed at: a square panel, hard 1px rules between every row, a grey
 * header block, and cramped 13px items. It also hand-built things Radix
 * already does correctly — an outside-click listener, an Escape handler,
 * `role="menu"` stamped on a div, and roving focus that never existed.
 *
 * What Radix brings that the hand-rolled menu did not have at all:
 * focus is trapped and returned to the trigger on close, arrow keys and
 * type-ahead move between items, the menu flips and shifts when it would
 * cross a viewport edge, and it is portalled so no rail's stacking
 * context can clip it (the old one needed `--z-panelPopover` on the beam
 * to escape `.rail`; that hack is now unnecessary).
 *
 * The multi-VIEW structure survives, deliberately. Radix sub-menus fly
 * out sideways, which is wrong for "switch staff" — a list of people with
 * a PIN step is a DRILL-DOWN, and it must not be dismissed by moving the
 * pointer. `view` state inside one Content keeps that.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, CheckIcon, InfoIcon, LogOutIcon, SettingsIcon, UsersIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { writeRecentSignin } from '@/lib/auth/recent-signins';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { railIconBare } from '@/shell/rail-icon';
import type { ShellApi } from '@/shell/useShell';
import { cn } from '@/utils/_cn';

type StaffRow = {
  id: number;
  name: string;
  role: string;
  has_pin: boolean;
};

type MenuView = 'root' | 'switch' | 'pin' | 'more';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function roleLabel(role: string): string {
  return role.replace(/_/g, ' ');
}

export function IdentityMenu({ shell }: { shell: ShellApi }) {
  const { user, refresh, signOut } = useAuth();
  const pinRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>('root');
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffLoading, setStaffLoading] = useState(false);
  const [picked, setPicked] = useState<StaffRow | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const displayName = user?.name?.trim() || (user ? `Staff #${user.staffId}` : 'Sign in');
  const orgName = user?.organizationName?.trim() || 'Workspace';

  const close = useCallback(() => {
    setOpen(false);
    setView('root');
    setPicked(null);
    setPin('');
    setPinError(null);
    setStaffError(null);
  }, []);

  useEffect(() => {
    if (view === 'pin') pinRef.current?.focus();
  }, [view]);

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    setStaffError(null);
    try {
      const res = await fetch('/api/auth/staff-picker', { credentials: 'include', cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as {
        staff?: StaffRow[];
        degraded?: boolean;
        error?: string;
      };
      if (!res.ok || data.degraded) {
        setStaff([]);
        setStaffError(data.error ?? 'Could not load staff.');
        return;
      }
      setStaff(Array.isArray(data.staff) ? data.staff : []);
    } catch {
      setStaff([]);
      setStaffError('Could not load staff.');
    } finally {
      setStaffLoading(false);
    }
  }, []);

  const openSwitch = () => {
    setView('switch');
    void loadStaff();
  };

  const pickStaff = (row: StaffRow) => {
    setPicked(row);
    setPin('');
    setPinError(null);
    setView(row.has_pin ? 'pin' : 'switch');
    if (!row.has_pin) setPinError('This account has no PIN.');
  };

  const submitSwitch = async () => {
    if (!picked) return;
    const digits = pin.trim();
    if (!digits) {
      setPinError('Enter the PIN.');
      return;
    }
    setSwitching(true);
    setPinError(null);
    try {
      const res = await fetch('/api/auth/switch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ staffId: picked.id, pin: digits, deviceKind: 'station' }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const code = data.error;
        setPinError(
          code === 'WRONG'
            ? 'PIN incorrect.'
            : code === 'NO_PIN'
              ? 'This account has no PIN.'
              : code === 'ACCOUNT_NOT_ACTIVE'
                ? 'Account is not active.'
                : 'Switch failed. Try again.',
        );
        return;
      }
      writeRecentSignin(picked.id);
      await refresh();
      close();
    } catch {
      setPinError('Switch failed. Try again.');
    } finally {
      setSwitching(false);
    }
  };

  /* A drill-down header: back arrow + where you are. */
  const Drill = ({ label, onBack }: { label: string; onBack: () => void }) => (
    <div className="flex items-center gap-1 px-1 pb-1 pt-0.5">
      <Button variant="ghost" size="icon" className="size-6" onClick={onBack} aria-label="Back">
        <ArrowLeftIcon />
      </Button>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) close();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-7 rounded-circle', railIconBare)}
          aria-label={`${displayName} — account menu`}
        >
          <Avatar className="size-6">
            <AvatarFallback>{initials(displayName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-64"
        /* The drill-down views own the keyboard (a PIN field, a staff
           list). Radix's type-ahead would swallow digits typed into the
           PIN input, so it is off while a view other than root is up. */
        loop
        onCloseAutoFocus={(e) => { if (view !== 'root') e.preventDefault(); }}
      >
        {view === 'root' ? (
          <>
            <DropdownMenuLabel className="pb-2">
              <span className="block truncate text-sm font-medium text-foreground">{displayName}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {orgName}
                {user ? ` · ${roleLabel(user.role)}` : ''}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openSwitch(); }}>
              <UsersIcon />
              Switch staff
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                close();
                shell.setSettingsPopoverOpen(true);
              }}
            >
              <SettingsIcon />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setView('more'); }}>
              <InfoIcon />
              More information
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                close();
                void signOut();
              }}
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </>
        ) : null}

        {view === 'switch' ? (
          <>
            <Drill label="Switch staff" onBack={() => setView('root')} />
            <DropdownMenuSeparator />
            {staffLoading ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
            ) : null}
            {staffError ? <p className="px-2 py-3 text-xs text-destructive">{staffError}</p> : null}
            {!staffLoading && !staffError && staff.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">No active staff.</p>
            ) : null}
            {staff.map((row) => {
              const current = user?.staffId === row.id;
              return (
                <DropdownMenuItem
                  key={row.id}
                  onSelect={(e) => { e.preventDefault(); pickStaff(row); }}
                  className="gap-2"
                >
                  <Avatar className="size-5">
                    <AvatarFallback className="text-[8px]">
                      {initials(row.name || `Staff #${row.id}`)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{row.name || `Staff #${row.id}`}</span>
                    <span className="truncate text-xs text-muted-foreground">{roleLabel(row.role)}</span>
                  </span>
                  {current ? <CheckIcon className="ml-auto size-3.5" /> : null}
                </DropdownMenuItem>
              );
            })}
          </>
        ) : null}

        {view === 'pin' && picked ? (
          <>
            <Drill
              label={`PIN · ${picked.name}`}
              onBack={() => { setView('switch'); setPin(''); setPinError(null); }}
            />
            <DropdownMenuSeparator />
            <form
              className="flex flex-col gap-2 p-2"
              onSubmit={(event) => { event.preventDefault(); void submitSwitch(); }}
            >
              <label htmlFor="identity-pin" className="text-xs text-muted-foreground">
                PIN for {picked.name}
              </label>
              <Input
                ref={pinRef}
                id="identity-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                disabled={switching}
              />
              {pinError ? <p className="text-xs text-destructive">{pinError}</p> : null}
              <Button type="submit" size="sm" disabled={switching}>
                {switching ? 'Switching…' : 'Switch'}
              </Button>
            </form>
          </>
        ) : null}

        {view === 'more' ? (
          <>
            <Drill label="More information" onBack={() => setView('root')} />
            <DropdownMenuSeparator />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 p-2 text-xs">
              {([
                ['Staff', displayName],
                ['Role', user ? roleLabel(user.role) : '—'],
                ['Workspace', orgName],
                ['Slug', user?.organizationSlug ?? '—'],
                ['Plan', user?.organizationPlan ?? '—'],
                ['Staff id', String(user?.staffId ?? '—')],
              ] as const).map(([k, v]) => (
                <Fragment key={k}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className={k === 'Slug' || k === 'Staff id' ? 'mono truncate' : 'truncate'}>{v}</dd>
                </Fragment>
              ))}
            </dl>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
