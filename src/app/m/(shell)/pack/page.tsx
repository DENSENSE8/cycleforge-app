import { redirect } from 'next/navigation';
import { MobilePackingList } from '@/components/mobile/packer/MobilePackingList';
import { getCurrentUser } from '@/lib/auth/current-user';

/**
 * Canonical mobile Packing door.
 *
 * This intentionally exposes the existing packing history and required photo
 * evidence, not a second pack-confirmation flow. The workflow contract keeps
 * Pack marked `partial` until the confirmation verb itself lands on the phone.
 */
export default async function MobilePackPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/m/signin?next=%2Fm%2Fpack');

  return <MobilePackingList packerId={String(user.staffId)} />;
}
