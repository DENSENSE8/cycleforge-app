'use client';

/**
 * Top-left identity — Linear / Vercel style.
 *
 * The beam used to open with SCAN · TYPE TO SEARCH. That cluster is gone.
 * The signed-in name is pinned here; the click is workspace identity
 * (switch staff · settings · more), not a page readout.
 *
 * Scan is still the floor verb — it lives on Ctrl+K / Ctrl+N via the
 * launcher, not as a 300px header field.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { writeRecentSignin } from '@/lib/auth/recent-signins';
import { Icon } from '@/shell/icons';
import type { ShellApi } from '@/shell/useShell';

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
  const wrapRef = useRef<HTMLDivElement>(null);
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
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, open]);

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

  const openMenu = () => {
    setOpen((was) => {
      if (was) {
        setView('root');
        return false;
      }
      setView('root');
      return true;
    });
  };

  const openSwitch = () => {
    setView('switch');
    setPicked(null);
    setPin('');
    setPinError(null);
    void loadStaff();
  };

  const pickStaff = (row: StaffRow) => {
    if (user && row.id === user.staffId) {
      close();
      return;
    }
    setPicked(row);
    setPin('');
    setPinError(null);
    setView('pin');
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

  const openSettings = () => {
    close();
    shell.setSettingsPopoverOpen(true);
  };

  const openMore = () => setView('more');

  return (
    <div ref={wrapRef} className={`identity-slot${open ? ' open' : ''}`}>
      <button
        type="button"
        className={`identity-face${open ? ' open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${displayName} — account menu`}
        title={`${displayName} · ${orgName}`}
        onClick={openMenu}
      >
        <span className="identity-mark" aria-hidden>
          {initials(displayName)}
        </span>
        <span className="identity-copy">
          <span className="identity-name">{displayName}</span>
          <span className="identity-org">{orgName}</span>
        </span>
        <span className="identity-chevron" aria-hidden>
          <Icon name="chevron-down" size={10} />
        </span>
      </button>

      {open ? (
        <div className="identity-menu" role="menu" aria-label="Account">
          {view === 'root' ? (
            <>
              <div className="identity-menu-header">
                <div className="identity-menu-org">{orgName}</div>
                <div className="identity-menu-title">{displayName}</div>
                <div className="identity-menu-meta">
                  {user ? `${user.organizationSlug ?? '—'} · ${roleLabel(user.role)}` : 'Not signed in'}
                </div>
              </div>
              <button type="button" className="identity-item" role="menuitem" onClick={openSwitch}>
                <Icon name="refresh" size={13} />
                Switch staff
              </button>
              <button type="button" className="identity-item" role="menuitem" onClick={openSettings}>
                <Icon name="settings" size={13} />
                Settings
              </button>
              <button type="button" className="identity-item" role="menuitem" onClick={openMore}>
                <Icon name="info" size={13} />
                More information
              </button>
              <div className="identity-divider" />
              <button
                type="button"
                className="identity-item danger"
                role="menuitem"
                onClick={() => {
                  close();
                  void signOut();
                }}
              >
                <Icon name="close" size={13} />
                Sign out
              </button>
            </>
          ) : null}

          {view === 'switch' ? (
            <>
              <div className="identity-menu-header identity-menu-header-row">
                <button
                  type="button"
                  className="identity-back"
                  onClick={() => setView('root')}
                  aria-label="Back"
                >
                  ←
                </button>
                <span>Switch staff</span>
              </div>
              <div className="identity-staff-list">
                {staffLoading ? <div className="identity-empty">Loading…</div> : null}
                {staffError ? <div className="identity-empty">{staffError}</div> : null}
                {!staffLoading && !staffError && staff.length === 0 ? (
                  <div className="identity-empty">No active staff.</div>
                ) : null}
                {staff.map((row) => {
                  const current = user?.staffId === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className={`identity-item${current ? ' current' : ''}`}
                      role="menuitem"
                      onClick={() => pickStaff(row)}
                    >
                      <span className="identity-mark sm" aria-hidden>
                        {initials(row.name || `Staff #${row.id}`)}
                      </span>
                      <span className="identity-item-copy">
                        <span className="identity-item-title">{row.name || `Staff #${row.id}`}</span>
                        <span className="identity-item-meta">{roleLabel(row.role)}</span>
                      </span>
                      {current ? <Icon name="check" size={12} /> : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {view === 'pin' && picked ? (
            <>
              <div className="identity-menu-header identity-menu-header-row">
                <button
                  type="button"
                  className="identity-back"
                  onClick={() => {
                    setView('switch');
                    setPin('');
                    setPinError(null);
                  }}
                  aria-label="Back"
                >
                  ←
                </button>
                <span>PIN · {picked.name}</span>
              </div>
              <form
                className="identity-pin"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitSwitch();
                }}
              >
                <label htmlFor="identity-pin">PIN for {picked.name}</label>
                <input
                  ref={pinRef}
                  id="identity-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  disabled={switching}
                />
                {pinError ? <div className="identity-empty danger">{pinError}</div> : null}
                <button type="submit" className="btn btn-sm btn-primary" disabled={switching}>
                  {switching ? 'Switching…' : 'Switch'}
                </button>
              </form>
            </>
          ) : null}

          {view === 'more' ? (
            <>
              <div className="identity-menu-header identity-menu-header-row">
                <button
                  type="button"
                  className="identity-back"
                  onClick={() => setView('root')}
                  aria-label="Back"
                >
                  ←
                </button>
                <span>More information</span>
              </div>
              <dl className="identity-facts">
                <div>
                  <dt>Staff</dt>
                  <dd>{displayName}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{user ? roleLabel(user.role) : '—'}</dd>
                </div>
                <div>
                  <dt>Workspace</dt>
                  <dd>{orgName}</dd>
                </div>
                <div>
                  <dt>Slug</dt>
                  <dd className="mono">{user?.organizationSlug ?? '—'}</dd>
                </div>
                <div>
                  <dt>Plan</dt>
                  <dd>{user?.organizationPlan ?? '—'}</dd>
                </div>
                <div>
                  <dt>Staff id</dt>
                  <dd className="mono">{user?.staffId ?? '—'}</dd>
                </div>
              </dl>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
