'use client';

/**
 * QC — `/m/qc`: every unit waiting for quality control, most urgent first,
 * built like the pick list (owner 2026-09-29). See {@link QcQueueScreen}.
 */

import { QcQueueScreen } from '@/components/mobile/qc/QcQueueScreen';

export default function MobileQcQueuePage() {
  return <QcQueueScreen />;
}
