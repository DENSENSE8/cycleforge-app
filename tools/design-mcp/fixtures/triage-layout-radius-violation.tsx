/**
 * Smoke fixture — a TriageScrollLayout consumer that squares the right pane.
 * ds_critique must flag this so agents cannot invent rounded-none here.
 */
import { TriageScrollLayout } from '@/design-system/components/TriageScrollLayout'

export function BadTriageConsumer() {
  return (
    <TriageScrollLayout
      sections={[
        {
          id: 'order-details',
          label: 'Order Details',
          children: <div className="rounded-none">squared off</div>,
        },
      ]}
    />
  )
}
