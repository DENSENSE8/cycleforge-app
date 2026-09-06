'use client';

import { useMemo } from 'react';
import { sidebarHeaderBandClass, SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { ChevronDown, ShieldCheck } from '@/components/Icons';
import { SidebarSectionList, type SidebarSection } from '@/components/sidebar/SidebarSectionList';
import { useAuth } from '@/contexts/AuthContext';
import { ADMIN_SECTION_OPTIONS, type AdminSection } from './admin-sections';

import { ConnectionsSidebarPanel } from '@/components/sidebar/ConnectionsSidebarPanel';

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
}

const ICON_CLS = 'h-4 w-4 shrink-0';

function panelFor(section: AdminSection): JSX.Element | null {
  switch (section) {
    // W2+W3 (2026-09-06): sourcing panels moved with their tabs to Sourcing;
    // the NAS photos panel moved to Settings › Photos & NAS.
    case 'connections':     return <ConnectionsSidebarPanel />;
    default:                return null;
  }
}

export function AdminSidebar({ activeSection, onSectionChange }: AdminSidebarProps) {
  const { has, isLoaded } = useAuth();

  const visibleSections = useMemo<Array<SidebarSection<AdminSection>>>(() => {
    return ADMIN_SECTION_OPTIONS
      .filter((s) => {
        if (!s.requires) return true;
        if (!isLoaded) return false;
        return has(s.requires);
      })
      .map((s) => {
        const Icon = s.icon;
        return {
          id: s.value,
          label: s.label,
          description: s.description,
          group: s.group,
          requires: s.requires,
          icon: <Icon className={ICON_CLS} />,
        };
      });
  }, [has, isLoaded]);

  const isOverview = activeSection === 'overview';
  const sectionPanel = isOverview ? null : panelFor(activeSection);
  const sectionLabel = ADMIN_SECTION_OPTIONS.find((s) => s.value === activeSection)?.label ?? '';

  return (
    <div className="h-full flex flex-col overflow-hidden bg-surface-card">
      {isOverview ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <SidebarSectionList
            sections={visibleSections}
            active={activeSection}
            onSelect={(next) => onSectionChange(next)}
            ariaLabel="Admin sections"
            gutterClassName="px-3"
          />
        </div>
      ) : (
        <>
          <div className={`${sidebarHeaderBandClass} ${SIDEBAR_GUTTER} py-2`}>
            <button
              type="button"
              onClick={() => onSectionChange('overview')}
              className="ds-raw-button group flex w-full items-center gap-3 rounded-md inset-field text-left text-sm font-medium text-text-muted hover:bg-surface-sunken transition-colors"
              aria-label="Back to admin overview"
            >
              <ShieldCheck className="h-5 w-5 text-text-info" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold tracking-tight text-text-default uppercase tracking-wider">
                  Admin{sectionLabel ? ` · ${sectionLabel}` : ''}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-text-faint" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{sectionPanel}</div>
        </>
      )}
    </div>
  );
}
