'use client';

/** `/settings/me` — Personal settings as ONE scroll page with sticky PageHeader + TabSwitch pills. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HardwareSection } from '@/components/settings/sections/HardwareSection';
import { WorkstationSection } from '@/components/settings/sections/WorkstationSection';
import { QuickAccessSection } from '@/components/settings/sections/QuickAccessSection';
import { AppearanceSection } from '@/components/settings/sections/AppearanceSection';
import { KeyboardSection } from '@/components/settings/sections/KeyboardSection';
import { SecuritySection } from '@/components/settings/sections/SecuritySection';
import { AboutSection } from '@/components/settings/sections/AboutSection';
import { LegalSection } from '@/components/settings/sections/LegalSection';
import { SETTINGS_FLOOR_CLASS, SETTINGS_SECTION_OPTIONS } from '@/components/settings/settings-sections';
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { useRouter } from 'next/navigation';

const ME_BODIES: Record<string, () => React.ReactNode> = {
  hardware: () => <HardwareSection />,
  workstation: () => <WorkstationSection />,
  'quick-access': () => <QuickAccessSection />,
  appearance: () => <AppearanceSection />,
  keyboard: () => <KeyboardSection />,
  security: () => <SecuritySection />,
  about: () => <AboutSection />,
  legal: () => <LegalSection />,
};

const BAND_OFFSET_PX = 96;

export default function PersonalSettingsPage() {
  const sections = useMemo(
    () => SETTINGS_SECTION_OPTIONS.filter((s) => s.group === 'Personal' && ME_BODIES[s.id]),
    [],
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<string>(sections[0]?.id ?? 'hardware');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      const atBottom =
        container.scrollTop + container.clientHeight >= container.scrollHeight - 4;
      if (atBottom && sections.length > 0) {
        setActive(sections[sections.length - 1].id);
        return;
      }
      const line = BAND_OFFSET_PX;
      let current = sections[0]?.id ?? 'hardware';
      for (const s of sections) {
        const el = sectionRefs.current[s.id];
        if (el && el.getBoundingClientRect().top - containerTop <= line) current = s.id;
      }
      setActive(current);
    };
    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    const raf = requestAnimationFrame(() => requestAnimationFrame(onScroll));
    const settle = setTimeout(onScroll, 300);
    const restoreAnchor = () => {
      const id = window.location.hash.replace(/^#/, '');
      const el = sectionRefs.current[id];
      if (!el) return;
      const target =
        container.scrollTop +
        (el.getBoundingClientRect().top - container.getBoundingClientRect().top) -
        BAND_OFFSET_PX;
      if (Math.abs(target - container.scrollTop) < 8) return;
      container.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
    };
    const restore1 = setTimeout(restoreAnchor, 450);
    const restore2 = setTimeout(restoreAnchor, 1500);
    return () => {
      container.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      clearTimeout(restore1);
      clearTimeout(restore2);
    };
  }, [sections]);

  const scrollTo = useCallback((id: string) => {
    setActive(id);
    const container = scrollRef.current;
    const el = sectionRefs.current[id];
    if (!container || !el) return;
    container.scrollTo({
      top: container.scrollTop + (el.getBoundingClientRect().top - container.getBoundingClientRect().top) - BAND_OFFSET_PX,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, []);

  const router = useRouter();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      }
      if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]')) return;
      const idx = sections.findIndex((s) => s.id === active);
      if (e.key === 'Escape') {
        e.preventDefault();
        router.push('/settings');
        return;
      }
      if (e.key === 'ArrowRight' && idx >= 0 && idx < sections.length - 1) {
        e.preventDefault();
        scrollTo(sections[idx + 1].id);
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault();
        scrollTo(sections[idx - 1].id);
      } else if (e.key === 'Home' && sections.length > 0) {
        e.preventDefault();
        scrollTo(sections[0].id);
      } else if (e.key === 'End' && sections.length > 0) {
        e.preventDefault();
        scrollTo(sections[sections.length - 1].id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, router, scrollTo, sections]);

  return (
    <div className={`flex h-full min-h-0 w-full flex-col ${SETTINGS_FLOOR_CLASS}`}>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-6 pt-8 sm:px-10">
        <SettingsSectionHeader
          title="Your setup"
          belowSlot={
            <nav aria-label="Your setup sections" className="min-w-0 overflow-x-auto py-1.5">
              <TabSwitch
                tabs={sections.map((s) => ({ id: s.id, label: s.label }))}
                activeTab={active}
                onTabChange={scrollTo}
                fit="hug"
                scrollable
              />
            </nav>
          }
        />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {sections.map((s) => (
          <section
            key={s.id}
            id={s.id}
            ref={(el) => {
              sectionRefs.current[s.id] = el;
            }}
            className="mx-auto max-w-3xl scroll-mt-24 px-6 py-8"
          >
            <p aria-hidden="true" className="mb-4 text-role-caption font-semibold text-text-soft">
              {s.label}
            </p>
            {ME_BODIES[s.id]()}
          </section>
        ))}
      </div>
    </div>
  );
}
