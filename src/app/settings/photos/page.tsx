import { StationNasFoldersTab } from '@/components/admin/StationNasFoldersTab';
import { requirePermission } from '@/lib/auth/page-guard';

/**
 * `/settings/photos` — Photos & NAS (ex-Admin › Receiving Photos; admin
 * dissolution W3, 2026-09-06). Per-device/org config: NAS endpoint, workflow
 * storage folders, station picker defaults, photos platform. The `?mode=`
 * panel param rides unchanged from the admin deep links via the redirect.
 */
export default async function PhotosSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  await requirePermission('admin.view', { enforce: true });
  const mode = (await searchParams).mode;
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8 sm:px-10">
          <StationNasFoldersTab mode={mode} />
        </div>
      </main>
    </div>
  );
}
