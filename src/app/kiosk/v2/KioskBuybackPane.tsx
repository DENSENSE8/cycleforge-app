'use client';

/**
 * Buyback evaluate — center work for the Buyback command.
 * Captures IMEI + offer; appends a negative BUYBACK line to the session cart.
 */

import { useEffect, useState } from 'react';
import { Button, TextField } from '@/design-system/primitives';
import { KioskCustomerIntake } from '@/components/kiosk/KioskCustomerIntake';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { looksLikeImei } from '@/lib/kiosk/scan-classify';
import {
  useKioskSession,
  useKioskSessionActions,
} from '@/lib/kiosk/kiosk-session-store';
import {
  KIOSK_PANE_FOOTER_BAND,
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
  KIOSK_SECTION_LABEL_ROW,
} from '@/app/kiosk/kiosk-chrome';

export function KioskBuybackPane() {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [imei, setImei] = useState('');
  const [offerDollars, setOfferDollars] = useState('');
  const [grade, setGrade] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.buybackImeiPrefill) {
      setImei(session.buybackImeiPrefill);
      actions.setBuybackImeiPrefill(null);
    }
  }, [session.buybackImeiPrefill, actions]);

  const addToCart = () => {
    setError(null);
    if (!looksLikeImei(imei)) {
      setError('Enter a valid 15-digit IMEI.');
      return;
    }
    const dollars = Number.parseFloat(offerDollars.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError('Enter an offer amount greater than zero.');
      return;
    }
    const offerCents = Math.round(dollars * 100);
    actions.addBuyback({
      title: `Buyback · ${imei.slice(-4)}`,
      offerCents,
      payload: {
        imei: imei.replace(/\D/g, ''),
        grade: grade.trim() || null,
        notes: notes.trim() || null,
      },
    });
    setImei('');
    setOfferDollars('');
    setGrade('');
    setNotes('');
  };

  return (
    <div className="flex h-full flex-col" data-testid="kiosk-buyback-pane">
      <div className={KIOSK_PANE_HEADER_BAND}>
        <h2 className={KIOSK_PANE_HEADER_TITLE}>Buyback</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col divide-y divide-border-hairline">
          <section>
            <h3 className={KIOSK_SECTION_LABEL_ROW}>
              Device
            </h3>
            <div className="space-y-3 px-4 py-4">
              <TextField
                label="IMEI"
                value={imei}
                onChange={setImei}
                inputClassName="rounded-none"
                data-testid="kiosk-buyback-imei"
              />
              <TextField
                label="Offer ($)"
                value={offerDollars}
                onChange={setOfferDollars}
                inputClassName="rounded-none"
              />
              <TextField
                label="Grade"
                value={grade}
                onChange={setGrade}
                inputClassName="rounded-none"
              />
              <TextField
                label="Notes"
                value={notes}
                onChange={setNotes}
                inputClassName="rounded-none"
              />
              {error && (
                <p className="text-center text-sm font-semibold text-text-danger">{error}</p>
              )}
            </div>
          </section>

          {/* Same identity block as Repair / Retail / Pickup — one intake face. */}
          <KioskCustomerIntake />
        </div>
      </div>
      <div className={KIOSK_PANE_FOOTER_BAND}>
        <Button
          size="lg"
          className={cn('h-full min-h-0 w-full flex-1 rounded-none', cornerClass('flush'))}
          onClick={addToCart}
        >
          Add buyback credit
        </Button>
      </div>
    </div>
  );
}
