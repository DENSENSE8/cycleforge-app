import { redirect } from 'next/navigation';
import { MobilePackingList } from '@/components/mobile/packer/MobilePackingList';
import { getCurrentUser } from '@/lib/auth/current-user';

/** Canonical mobile Packing door. */
export default async function MobilePackPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/m/signin?next=%2Fm%2Fpack');

  return <MobilePackingList packerId={String(user.staffId)} />;
}
