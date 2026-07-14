import { useEffect, useRef, useState } from 'react';

// ============================================================================
// FEET AND INCHES, AS TWO NUMBERS
// ----------------------------------------------------------------------------
// Nobody should have to type an apostrophe and a double-quote on a phone keyboard,
// in a wet house, wearing gloves. Those characters live behind the symbol key on
// iOS, and a tech who cannot find them types 12.58 or gives up and drags the wall.
//
// So: two plain number fields, a numeric keypad, and the app does the arithmetic.
// Feet on the left, inches on the right. Type 14 in the inches box and it rolls into
// the feet box, because that is what a person means.
//
// The value handed out is DECIMAL FEET, which is what everything downstream stores.
// 12 ft 7 in is 12.5833, and it stays that way through the geometry and into the
// Xactimate dimension variables.
// ============================================================================

export const ftToParts = (ft: number | null | undefined): { feet: number; inches: number } => {
  if (ft == null || !isFinite(ft) || ft < 0) return { feet: 0, inches: 0 };
  const totalIn = Math.round(ft * 12);
  return { feet: Math.floor(totalIn / 12), inches: totalIn % 12 };
};
export const partsToFt = (feet: number, inches: number) => feet + inches / 12;

export function FeetInchesInput({ initialFt, onChange, autoFocus, invalid, compact }: {
  initialFt?: number | null;
  onChange: (ft: number | null) => void;
  autoFocus?: boolean;
  invalid?: boolean;
  compact?: boolean;
}) {
  const start = initialFt != null && initialFt > 0 ? ftToParts(initialFt) : null;
  const [feet, setFeet] = useState(start ? String(start.feet) : '');
  const [inches, setInches] = useState(start && start.inches ? String(start.inches) : '');
  const feetRef = useRef<HTMLInputElement>(null);
  const inchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => feetRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [autoFocus]);

  // Emit decimal feet, or null when the tech has not typed anything usable yet.
  const emit = (f: string, i: string) => {
    const fv = f.trim() === '' ? 0 : Number(f);
    const iv = i.trim() === '' ? 0 : Number(i);
    if (!isFinite(fv) || !isFinite(iv) || fv < 0 || iv < 0) { onChange(null); return; }
    if (f.trim() === '' && i.trim() === '') { onChange(null); return; }
    onChange(partsToFt(fv, iv));
  };

  const onFeet = (v: string) => {
    const clean = v.replace(/[^\d.]/g, '');
    setFeet(clean);
    emit(clean, inches);
  };

  // 14 inches means 1 ft 2 in. Roll it, do not reject it: a tech measuring a 38 in
  // vanity should be able to type 38 into the inches box and get 3 ft 2 in.
  const onInches = (v: string) => {
    const clean = v.replace(/[^\d.]/g, '');
    const n = clean === '' ? 0 : Number(clean);
    if (isFinite(n) && n >= 12) {
      const carry = Math.floor(n / 12);
      const rest = Number((n % 12).toFixed(2));
      const nf = String((feet.trim() === '' ? 0 : Number(feet)) + carry);
      const ni = rest ? String(rest) : '';
      setFeet(nf);
      setInches(ni);
      emit(nf, ni);
      return;
    }
    setInches(clean);
    emit(feet, clean);
  };

  const cell = `w-full border rounded-xl text-center tabular-nums font-bold focus:outline-none ${
    compact ? 'px-2 py-2.5 text-[18px]' : 'px-3 py-3 text-[22px]'
  } ${invalid ? 'border-red-300 text-red-600' : (feet || inches) ? 'border-sky text-navy' : 'border-gray-200 text-navy'}`;

  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 min-w-0 relative">
        <input
          ref={feetRef}
          value={feet}
          onChange={e => onFeet(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === "'") { e.preventDefault(); inchRef.current?.focus(); } }}
          placeholder="0"
          inputMode="decimal"
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
          className={cell + ' pr-8'}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-gray-400 pointer-events-none">ft</span>
      </div>
      <div className="flex-1 min-w-0 relative">
        <input
          ref={inchRef}
          value={inches}
          onChange={e => onInches(e.target.value)}
          placeholder="0"
          inputMode="decimal"
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
          className={cell + ' pr-9'}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-gray-400 pointer-events-none">in</span>
      </div>
    </div>
  );
}