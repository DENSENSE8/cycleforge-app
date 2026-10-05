import { Suspense } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { PastedListPage } from '@/components/search/pasted-list/PastedListPage';
import { PastedListBack } from '@/components/search/pasted-list/PastedListBack';

/** `/search/list` — the search bar's held pasted list, full screen (route tree node `pasted-list`). */
export default function PastedListRoute() {
  return (
    <DeskPageLayout
      title="Pasted list"
      measure="full"
      titleLead={
        <Suspense fallback={null}>
          <PastedListBack />
        </Suspense>
      }
    >
      <Suspense fallback={<UniversalLoader isLoading label="Loading the pasted list" className="h-full" />}>
        <PastedListPage />
      </Suspense>
    </DeskPageLayout>
  );
}
