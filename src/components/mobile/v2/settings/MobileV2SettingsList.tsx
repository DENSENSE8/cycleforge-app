'use client';

/** Dedicated phone settings SoT (`/m/settings`). */

import Link from 'next/link';
import { ChevronRight } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffSwitcher } from '@/contexts/StaffSwitcherContext';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  SETTINGS_CATEGORY_LABELS,
  SETTINGS_SECTION_CATEGORY,
  SETTINGS_SECTION_OPTIONS,
  SETTINGS_TONE_INK,
  settingsSectionHref,
  type SettingsCategory,
  type SettingsSectionOption,
} from '@/components/settings/settings-sections';

const CATEGORY_ORDER: SettingsCategory[] = [
  'workspace', 'apps', 'people', 'data', 'devices', 'developer',
];

const GROUP_CLASS = cn(
  'overflow-hidden border border-border-soft bg-surface-card',
  cornerClass('surface'),
);

const ROW_CLASS = cn(
  'flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left',
  'border-b border-border-hairline last:border-b-0',
  'active:bg-surface-sunken',
);

function SettingsRows({ sections }: { sections: SettingsSectionOption[] }) {
  return (
    <ul className={GROUP_CLASS}>
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <li key={section.id}>
            <Link href={settingsSectionHref(section.id)} className={ROW_CLASS}>
              <Icon className={cn('h-5 w-5 shrink-0', SETTINGS_TONE_INK[section.tone])} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-role-body font-medium text-text-default">
                {section.label}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-faint" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileV2SettingsList() {
  const { user, signOut, has, isLoaded } = useAuth();
  const { openSwitcher } = useStaffSwitcher();
  const displayName = user?.name?.trim() || (user ? `Staff #${user.staffId}` : 'Account');

  const personal = SETTINGS_SECTION_OPTIONS.filter((s) => s.group === 'Personal');
  const visibleOrg = SETTINGS_SECTION_OPTIONS.filter((s) => {
    if (s.group !== 'Organization') return false;
    if (!s.requires) return true;
    return isLoaded && has(s.requires);
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-3">
        {user ? (
          <StaffAvatar staffId={user.staffId} name={displayName} size="lg" alt="" />
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-role-title font-semibold text-text-default">Settings</h1>
          <p className="truncate text-role-caption text-text-soft">{displayName}</p>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="px-1 text-role-caption font-semibold text-text-soft">Your setup</h2>
        <SettingsRows sections={personal} />
      </section>

      {CATEGORY_ORDER.map((category) => {
        const sections = visibleOrg.filter((s) => SETTINGS_SECTION_CATEGORY[s.id] === category);
        if (sections.length === 0) return null;
        return (
          <section key={category} className="space-y-2">
            <h2 className="px-1 text-role-caption font-semibold text-text-soft">
              {SETTINGS_CATEGORY_LABELS[category]}
            </h2>
            <SettingsRows sections={sections} />
          </section>
        );
      })}

      <div className="flex flex-col gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="min-h-11 w-full justify-center text-text-default"
          onClick={openSwitcher}
        >
          Switch staff
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="min-h-11 w-full justify-center text-text-danger hover:bg-surface-danger"
          onClick={() => {
            void signOut();
          }}
        >
          Log out
        </Button>
      </div>
    </div>
  );
}
