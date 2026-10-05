import { PrepackSerialHandoff } from '@/features/prepack/PrepackHandoff';
import { parsePrepackRouteState } from '@/lib/prepack/url';
import { MobilePrepackFlow } from './MobilePrepackFlow';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * `/m/prepack` — the mobile-first prepack form (query contract: `prepackHref`).
 * A desk serial handoff (`serialRequestId`) opens the phone's reply screen
 * instead; the desk validates each serial it sends.
 */
export default async function MobilePrepackPage({ searchParams }: { searchParams: SearchParams }) {
  const state = parsePrepackRouteState(await searchParams);
  if (state.serialRequestId) return <PrepackSerialHandoff requestId={state.serialRequestId} />;
  return <MobilePrepackFlow initial={state} />;
}
