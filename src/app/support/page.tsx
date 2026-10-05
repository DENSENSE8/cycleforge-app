import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RouteShell } from '@/design-system/components/RouteShell';
import { SupportDesk } from '@/features/support/SupportDesk';

export const metadata: Metadata = {
  title: 'Support items',
};

/**
 * `/support` — the Support workspace (owner 2026-10-04): every Support item on
 * the local model. The left contextual sidebar carries the views, Sort, Group
 * by, the Platform / Account / Assignee facets and Find; the body is the
 * Support items list with its local status chips, and `?item=` opens one.
 * Phone twin: `/m/support`.
 */
export default function SupportPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <div className="hidden h-full w-full overflow-hidden bg-surface-card md:flex">
        <RouteShell
          actions={null}
          history={(
            <DeskPageLayout bare className="h-full">
              <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><LoadingSpinner size="lg" /></div>}>
                <SupportDesk />
              </Suspense>
            </DeskPageLayout>
          )}
        />
      </div>
    </>
  );
}
