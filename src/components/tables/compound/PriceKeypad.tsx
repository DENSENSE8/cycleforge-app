'use client';

/**
 * Square price keypad — the selected state of an under-title money figure.
 * `$` is InputGroupText (no ring). Keys are shadcn ui/button squares, not
 * PinPadKey and not KeyboardKey.
 */

import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
} from '@/components/ui/input-group';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { PRICE_KEYPAD_KEYS, type PriceKeypadKey } from './price-keypad';

export function PriceKeypad({
  draft,
  onKey,
}: {
  draft: string;
  onKey: (key: PriceKeypadKey) => void;
}) {
  return (
    <div
      data-price-keypad=""
      className="w-[7.75rem]"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <InputGroup className="h-9 min-w-0 border-0 bg-transparent shadow-none">
        <InputGroupAddon align="inline-start" className="pl-2 pr-0.5">
          <InputGroupText
            aria-hidden
            data-money-prefix=""
            className="p-0 font-semibold text-text-success"
          >
            $
          </InputGroupText>
        </InputGroupAddon>
        <span className="flex min-w-0 flex-1 items-center pr-2 font-semibold tabular-nums text-text-success">
          {draft.length > 0 ? draft : '0'}
        </span>
      </InputGroup>
      <div className="grid grid-cols-3 gap-1 p-1" role="group" aria-label="Price keypad">
        {PRICE_KEYPAD_KEYS.map((key) => (
          <Button
            key={key}
            type="button"
            variant="outline"
            size="icon"
            aria-label={key === 'back' ? 'Backspace' : key === '.' ? 'Decimal point' : key}
            data-price-key={key}
            className={cn(
              'size-9 p-0 text-role-caption font-semibold tabular-nums',
              cornerClass('control'),
            )}
            onClick={() => onKey(key)}
          >
            {key === 'back' ? '⌫' : key}
          </Button>
        ))}
      </div>
    </div>
  );
}
