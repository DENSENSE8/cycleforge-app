'use client';

import { useState } from 'react';
import { Smartphone } from '@/components/Icons';
import { Button, TextField } from '@/design-system/primitives';
import type { PrepackSerialEntryProps } from '@/features/prepack/serial-entry';

/**
 * Desk serial entry: type the serial (or let a wedge scanner type it); the
 * phone icon inside the field hands this entry's scan to the staffer's phone.
 * No camera here.
 */
export function PrepackSerialField({ onSerial, busy, phone, label = 'Serial number', autoFocus = true }: PrepackSerialEntryProps) {
  const [serial, setSerial] = useState('');
  return (
    <div className="space-y-1.5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = serial.trim();
          if (!value || busy) return;
          onSerial(value);
          setSerial('');
        }}
      >
        <TextField
          label={label}
          value={serial}
          onChange={setSerial}
          mono
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="enter"
          data-testid="prepack-serial-input"
          trailing={
            <Button
              variant={phone.waiting ? 'primarySoft' : 'ghost'}
              size="sm"
              icon={<Smartphone />}
              ariaLabel={phone.waiting ? 'The phone is scanning' : 'Scan with phone'}
              title={phone.waiting ? 'The phone is scanning' : 'Scan with phone'}
              onClick={phone.send}
              disabled={!phone.available || phone.waiting}
              loading={phone.sending}
              data-testid="prepack-serial-phone"
            />
          }
        />
      </form>
      {phone.waiting ? (
        <p className="flex items-center gap-2 text-role-caption text-text-muted">
          <span className="min-w-0 flex-1">The phone is scanning — each serial it sends lands here.</span>
          <Button variant="ghost" size="sm" onClick={phone.stop} data-testid="prepack-serial-phone-done">
            Done
          </Button>
        </p>
      ) : null}
    </div>
  );
}
