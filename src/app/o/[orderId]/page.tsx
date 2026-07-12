import { OrderFullPageView } from '@/components/shipped/OrderFullPageView';

/**
 * /o/[orderId] — the dedicated order workbench detail pane. Reached from the
 * shipped slide-over's expand launcher, global search, and scanned short-links.
 *
 * `orderId` is either the numeric DB id or a human order number;
 * {@link OrderFullPageView} resolves both. The left rail is
 * `OrderWorkspaceSidebar` (via SidebarContextPanel when route key is `order`).
 */
export default async function OrderFullPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <OrderFullPageView orderId={orderId} layout="workbench" />;
}
