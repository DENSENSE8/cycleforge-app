/** /receiving/unfound/[kind]/[id] — relocated. */

import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';

interface PageProps {
  params: Promise<{ kind: string; id: string }>;
}

export default async function UnfoundDetailPage({ params }: PageProps) {
  await requirePermission('receiving.view', { enforce: true });
  const { kind, id } = await params;

  if (kind === 'unmatched_receiving' && id) {
    redirect(`/receiving?id=${encodeURIComponent(id)}`);
  }

  redirect('/incoming');
}
