'use client';

import { useMemo } from 'react';
import { ExternalLink, Printer } from '@/components/Icons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { DocumentPreviewFrame } from '@/design-system/components/DocumentPreviewFrame';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button } from '@/design-system/primitives';
import {
  outboundDocumentContentSrc,
  outboundDocumentMimeHint,
} from '@/lib/documents/outbound-document-display';
import type { OutboundDocument, OutboundDocumentType } from '@/lib/documents/types';
import { sourcePlatformMeta } from '@/lib/source-platform';

const DOCUMENT_TABS = [
  { id: 'shipping_label', label: 'Shipping label' },
  { id: 'packing_slip', label: 'Packing slip' },
] as const;

function sourceLabel(document: OutboundDocument | undefined): string {
  if (!document) return 'Not attached';
  const platform = document.data.platform?.trim();
  if (platform) {
    const meta = sourcePlatformMeta(platform);
    return `${meta.value ? meta.label : platform} import`;
  }
  return document.data.source === 'manual_upload' ? 'Manual upload' : 'Attached document';
}

export function MobileOrderDocumentsSheet({
  open,
  onClose,
  documents,
  activeType,
  onActiveTypeChange,
}: {
  open: boolean;
  onClose: () => void;
  documents: OutboundDocument[];
  activeType: OutboundDocumentType;
  onActiveTypeChange: (type: OutboundDocumentType) => void;
}) {
  const activeDocument = documents.find((document) => document.documentType === activeType);
  const src = outboundDocumentContentSrc(activeDocument);
  const tabs = useMemo(
    () =>
      DOCUMENT_TABS.map((tab) => ({
        ...tab,
        count: documents.filter((document) => document.documentType === tab.id).length || undefined,
      })),
    [documents],
  );

  const openDocument = () => {
    if (src) window.open(src, '_blank', 'noopener,noreferrer');
  };

  const printDocument = () => {
    if (!src) return;
    const printWindow = window.open(src, '_blank', 'noopener,noreferrer');
    printWindow?.addEventListener('load', () => {
      try {
        printWindow.print();
      } catch {
        // Cross-origin browser viewers retain their own print control.
      }
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      forceVariant="sheet"
      level={1}
      title="Order documents"
      scrollBody
      scrollBodyMaxHeightClass="max-h-[calc(100dvh-1rem)]"
      maxWidth="48rem"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="mobile-order-documents-sheet">
        <TabSwitch
          tabs={tabs}
          activeTab={activeType}
          onTabChange={(id) => onActiveTypeChange(id as OutboundDocumentType)}
          size="sm"
          countStyle="plain"
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border-soft bg-surface-card">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-hairline px-3 py-2">
            <p className="min-w-0 truncate text-role-caption font-semibold text-text-muted">
              {sourceLabel(activeDocument)}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                radius="flush"
                icon={<Printer className="h-4 w-4" />}
                disabled={!src}
                onClick={printDocument}
              >
                Print
              </Button>
              <Button
                variant="ghost"
                size="sm"
                radius="flush"
                icon={<ExternalLink className="h-4 w-4" />}
                disabled={!src}
                onClick={openDocument}
              >
                Open
              </Button>
            </div>
          </div>
          <DocumentPreviewFrame
            title={activeType === 'shipping_label' ? 'Shipping label' : 'Packing slip'}
            src={src}
            mimeHint={outboundDocumentMimeHint(activeDocument)}
            emptyHint={
              activeType === 'shipping_label'
                ? 'Upload the label from the order sheet.'
                : 'Fetch the packing slip from the order sheet.'
            }
            className="min-h-[60dvh]"
          />
        </div>
      </div>
    </BottomSheet>
  );
}
