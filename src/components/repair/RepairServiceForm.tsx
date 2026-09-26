'use client'

import React from 'react'
import { formatRepairPaperTicketNumber } from '@/lib/repair/repair-paper-ticket'
import { RepairPaperTicketHeading } from './RepairPaperTicketHeading'
import type { RepairReceiptProps } from '@/lib/repair/repair-intake-receipt'
import { REPAIR_PICKUP_DATE_PLACEHOLDER } from '@/lib/repair/repair-paper-html'
import { REPAIR_PRINT_SIGNATURE_BAND } from '@/lib/repair/signature-geometry'
import { useOrgLetterhead } from '@/hooks/useOrgLetterhead'

type RepairServiceFormProps = RepairReceiptProps & {
  /** `compact` — review-step SCALE: column width, smaller type. */
  density?: 'full' | 'compact';
  /** Which parts of the document render. */
  sections?: 'dropoff' | 'full';
  /** `screen` — A4 on-screen sheet; `print` — A4 min-height for print layout. */
  surface?: 'screen' | 'print';
  /**
   * Captured ink, drawn INTO the signature band instead of leaving it ruled
   * and empty. The kiosk passes the live pad output so the customer watches
   * their signature land on the document they are signing.
   */
  dropoffSignatureUrl?: string | null;
  pickupSignatureUrl?: string | null;
};

/** ISO 216 A4 — on-screen / print sheet size (210mm × 297mm). */
const A4_SHEET_CLASS =
  'mx-auto w-[210mm] max-w-full min-h-[297mm] bg-surface-card font-sans text-text-default';

/** One ruled signature row, with the ink on it when there is ink. */
function RepairSignatureLine({
  label,
  dateText,
  signatureUrl,
}: {
  label: string;
  dateText: string;
  signatureUrl?: string | null;
}) {
  const signed = Boolean(signatureUrl);
  return (
    <div className="mb-2 grid grid-cols-[5.75rem_minmax(0,1fr)_11rem] items-end gap-x-4">
      <span className="whitespace-nowrap font-semibold">{label}</span>
      {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
      <div
        className="relative overflow-hidden border-b border-border-strong"
        style={{ height: signed ? REPAIR_PRINT_SIGNATURE_BAND.inkHeightPx : 24 }}
      >
        {signatureUrl ? (
          <img
            src={signatureUrl}
            alt={`${label} signature`}
            className="pointer-events-none absolute bottom-0.5 left-0 h-full w-auto max-w-full object-contain"
          />
        ) : null}
      </div>
      <span className="whitespace-nowrap text-right font-semibold tabular-nums">{dateText}</span>
    </div>
  );
}

const RepairServiceForm: React.FC<RepairServiceFormProps> = ({
  ticketNumber,
  productTitle,
  issue,
  serialNumber,
  name,
  contact,
  price,
  startDateTime,
  density = 'full',
  sections,
  surface = 'screen',
  dropoffSignatureUrl = null,
  pickupSignatureUrl = null,
}) => {
  const displayTicket = formatRepairPaperTicketNumber(ticketNumber)
  const isCompact = density === 'compact'
  // Completeness defaults to the old `density`-coupled behaviour (see the prop).
  const showFullDocument = (sections ?? (density === 'compact' ? 'dropoff' : 'full')) === 'full'
  const isScreen = surface === 'screen'
  // On-screen preview — matches printed form letterhead from org settings.
  const letterhead = useOrgLetterhead()
  const showLetterhead =
    Boolean(letterhead.name) ||
    Boolean(letterhead.addressLine1) ||
    Boolean(letterhead.addressLine2) ||
    Boolean(letterhead.phone)

  // Format contact display as "Name, Phone, Email"
  const contactDisplay = [name, contact].filter(Boolean).join(', ')

  const headerGap = isCompact ? 'mb-3' : isScreen ? 'mb-5' : 'mb-8'
  const sectionGap = isCompact ? 'mb-3' : isScreen ? 'mb-4' : 'mb-6'
  const termsGap = isCompact ? 'mb-3' : isScreen ? 'mb-3' : 'mb-4 print:mb-2'
  const dropOffGap = isCompact ? 'mb-0 mt-3' : isScreen ? 'mb-2 mt-3' : 'mb-4 mt-4 print:mb-3 print:mt-2'
  const pickupGap = isScreen ? 'mt-4' : 'mt-6 print:mt-6'
  const pickupClosingGap = isScreen ? 'mt-3' : 'mt-6'

  return (
    <div
      className={
        isCompact
          ? 'w-full bg-surface-card px-4 py-3 font-sans text-text-default'
          : isScreen
            ? `${A4_SHEET_CLASS} p-6`
            : `${A4_SHEET_CLASS} p-8 print:p-6`
      }
    >

      {/* Header Section — omit when letterhead is empty (e.g. kiosk / no org yet) */}
      {showLetterhead ? (
        <div className={`${headerGap} text-right`}>
          {letterhead.name ? (
            <h2 className={isCompact ? 'text-sm font-semibold' : 'text-lg font-semibold'}>{letterhead.name}</h2>
          ) : null}
          {letterhead.addressLine1 ? (
            <p className="text-xs sm:text-sm">{letterhead.addressLine1}</p>
          ) : null}
          {letterhead.addressLine2 ? (
            <p className="text-xs sm:text-sm">{letterhead.addressLine2}</p>
          ) : null}
          {letterhead.phone ? (
            <p className="text-xs sm:text-sm">Tel: {letterhead.phone}</p>
          ) : null}
        </div>
      ) : null}

      <RepairPaperTicketHeading displayTicket={displayTicket} compact={isCompact} />

      {/* Information Table */}
      {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
      <div className={`border-l border-t border-black ${sectionGap} ${isCompact ? 'text-xs' : ''}`}>
        {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
        <div className="flex border-b border-r border-black">
          {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
          <div className={`shrink-0 border-r border-black bg-surface-canvas p-2 font-semibold ${isCompact ? 'w-28' : 'w-40'}`}>Product Title:</div>
          {/* A drop-off can carry several devices, so this cell is either ONE product or a summary of many. */}
          <div className={`min-w-0 flex-1 break-words p-2${isScreen ? ' line-clamp-3 text-pretty' : ''}`}>{productTitle}</div>
        </div>
        {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
        <div className="flex border-b border-r border-black">
          {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
          <div className={`shrink-0 border-r border-black bg-surface-canvas p-2 font-semibold ${isCompact ? 'w-28' : 'w-40'}`}>SN & Issues:</div>
          <div className="min-w-0 flex-1 break-words p-2">{serialNumber}, {issue}</div>
        </div>
        {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
        <div className="flex border-b border-r border-black">
          {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
          <div className={`shrink-0 border-r border-black bg-surface-canvas p-2 font-semibold ${isCompact ? 'w-28' : 'w-40'}`}>Contact Info:</div>
          <div className="min-w-0 flex-1 break-words p-2">{contactDisplay}</div>
        </div>
      </div>

      {/* Price Section */}
      <div className={sectionGap}>
        <p className={`mb-2 font-medium ${isCompact ? 'text-sm' : 'text-lg'}`}>
          <span className="font-semibold text-emerald-600">${price}</span> - Price Paid at Pick-up
        </p>
        <p className={isCompact ? 'text-xs font-medium' : 'text-base font-medium'}>
          Card / Cash - Payment Method
        </p>
      </div>

      {/* Terms & Warranty */}
      <div className={`text-sm leading-relaxed ${termsGap} ${isCompact ? 'text-xs' : ''}`}>
        <p className={isCompact ? 'mb-2' : isScreen ? 'mb-2' : 'mb-3 print:mb-2'}>
          Your Bose product has been received into our repair center. Under normal circumstances it will
          be repaired within the next 3-10 working days and returned to you at the address above.
        </p>
        {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
        <p className="inline-block border-b border-black font-semibold">
          There is a 30 day Warranty on all our repair services.
        </p>
      </div>

      {/* Drop Off Section */}
      <div className={dropOffGap}>
        <RepairSignatureLine
          label="Drop Off X"
          dateText={`Date: ${startDateTime}`}
          signatureUrl={dropoffSignatureUrl}
        />
        <p className="text-xs italic">
          By signing above you agree to the listed price and any unexpected delays in the repair process.
        </p>
      </div>

      {showFullDocument && (
        <>
          {/* Internal Use Table */}
          {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
          <div className={`flex border-l border-t border-black ${isCompact ? 'text-xs' : ''} ${isScreen ? 'mb-2' : 'mb-4 print:mb-3'}`}>
            {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
            <div className="flex-1 border-b border-r border-black p-2 font-semibold">Part Repaired:</div>
            {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
            <div className="flex-1 border-b border-r border-black p-2" />
            {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
            <div className="flex-1 border-b border-r border-black p-2 font-semibold">Who:</div>
            {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
            <div className="flex-1 border-b border-r border-black p-2 font-semibold">Date:</div>
          </div>

          {/* Pick Up Section */}
          <div className={pickupGap}>
            <RepairSignatureLine
              label="Pick Up X"
              dateText={REPAIR_PICKUP_DATE_PLACEHOLDER}
              signatureUrl={pickupSignatureUrl}
            />
            <p
              className={`text-center font-semibold ${isCompact ? 'text-base' : 'text-xl'} ${pickupClosingGap}`}
            >
              Enjoy your repaired unit!
            </p>
          </div>
        </>
      )}

    </div>
  )
}

export default RepairServiceForm
