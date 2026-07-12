import { redirect } from 'next/navigation';
import { MyDayWorkspace } from '@/features/my-day/MyDayWorkspace';
import { isParkedSurfaceLive } from '@/lib/dogfood/parked-surfaces';

/**
 * Home (`/`) — My Day workbench (ranked personal work + onboarding right pane).
 * Parked off dogfood nav by default; unlock with `DOGFOOD_FULL_SURFACE`.
 * Post-signup `?welcome=1` always mounts My Day so activation onboarding shows.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const params = await searchParams;
  const welcome = params.welcome === '1';
  if (!isParkedSurfaceLive() && !welcome) {
    redirect('/dashboard');
  }
  return <MyDayWorkspace />;
}
