import { Printer } from '@/components/Icons';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { LocationLabelBuilder } from '@/features/location-labels/LocationLabelBuilder';
import { requirePermission } from '@/lib/auth/page-guard';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';
import { WAREHOUSE_PATHS } from '@/lib/nav/route-tree';

export const dynamic = 'force-dynamic';

/**
 * `/m/labels` — print location labels (one sticker or a run) to the
 * remembered label station: the shared `LocationLabelBuilder` under the record
 * bar. `?code=` prefills the address (the location record's door), `?back=` is
 * where the X returns. With nothing prefilled the camera starts up — scan the
 * sticker first; it is the screen's one scan door.
 */
export default async function MobileLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; back?: string }>;
}) {
  await requirePermission('print.label');
  const { code, back } = await searchParams;
  const initialCode = code?.trim() || null;
  return (
    <div className="flex min-h-full flex-col" data-testid="m-labels">
      <MobileV2DetailTopBar
        title="Location labels"
        subtitle="Scan a sticker or pick the address"
        backHref={mobileJobReturn(back) ?? WAREHOUSE_PATHS.stock}
        close
        lead={<Printer className="h-5 w-5 text-mode-muted" />}
        scanSeat={false}
      />
      <LocationLabelBuilder initialCode={initialCode} armScan={!initialCode} dock="dock" />
    </div>
  );
}
