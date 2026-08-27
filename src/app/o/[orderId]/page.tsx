import { permanentRedirect } from 'next/navigation';
import { searchOrderFeedbackHref } from '@/lib/search/search-hit';

/**
 * `/o/[orderId]` — retired full order Workbench. Bookmarks and deep links
 * permanently redirect to search order feedback.
 */
export default async function OrderFullPageRedirect({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  permanentRedirect(searchOrderFeedbackHref(orderId));
}
