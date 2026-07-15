import { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import { formatFeetInches } from '../../lib/feetInches';
import { FeetInchesInput } from '../../components/FeetInchesInput';

// ============================================================================
// TYPE THE ROOM, DO NOT DRAW IT
// ----------------------------------------------------------------------------
// A tech standing in a kitchen with a laser measure has two numbers. They should be
// able to type them and get the room. Dragging a box with a fingertip and then fixing
// each wall afterwards is the long way round to the same rectangle, and it is how a
// room ends up 11 ft 11 in because nobody went back to correct it.
//
// This is what Xactimate does: "Add a room using exact dimensions".
//
// FEET AND INCHES ARE SEPARATE NUMBER FIELDS. Nobody types an apostrophe on a phone
// keyboard in a wet house. Four number boxes, a numeric keypad, and the area updates as
// they type, so a fat-fingered 120 ft wall announces itself as 1,200 sq ft before they
// ever tap Draw it.
//
// PREFILL WITH THE CURRENT SIZE. When this opens on a room that already has a size (the
// "Set size" button on the floor plan hands in its current width and length), the boxes
// must OPEN showing those numbers, not blank. FeetInchesInput only reads its initialFt at
// mount, so a value handed in after the first render, or a second open for a different
// room on a reused sheet, would not appear. The effect below reseeds width and length and
// remounts the inputs (via the bumped key) whenever the caller passes new dimensions. The
// reseed is skipped on the first render so a size the tech is typing is never wiped out.
// ============================================================================
export function RoomSizeSheet({ title = 'Room size', subtitle, initialWidthFt, initialLengthFt, onCancel, onCreate }: {
  title?: string;
  subtitle?: string;
  initialWidthFt?: number | null;
  initialLengthFt?: number | null;
  onCancel: () => void;
  onCreate: (widthFt: number, lengthFt: number) => void;
}) {
  const [w, setW] = useState<number | null>(initialWidthFt ?? null);
  const [l, setL] = useState<number | null>(initialLengthFt ?? null);
  // Bumped to remount the inputs when the caller hands in a new size, so the boxes show
  // the prefilled value (FeetInchesInput only reads initialFt at mount).
  const [seed, setSeed] = useState(0);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    setW(initialWidthFt ?? null);
    setL(initialLengthFt ?? null);
    setSeed(s => s + 1);
  }, [initialWidthFt, initialLengthFt]);

  const tooBig = (v: number | null) => v != null && v > 200;
  const wBad = tooBig(w);
  const lBad = tooBig(l);
  const ok = w != null && l != null && w > 0 && l > 0 && !wBad && !lBad;
  const sqft = ok ? w! * l! : 0;

  const submit = () => { if (ok) onCreate(w!, l!); };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6vh)' }}>
      <div className="absolute inset-0 bg-navy/40" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-lg text-navy">{title}</div>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
              {subtitle || 'Type the two measurements and the room draws itself. You can still drag the corners after.'}
            </p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="mt-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Width, left to right</div>
          <FeetInchesInput key={`w${seed}`} initialFt={w} onChange={setW} autoFocus invalid={wBad} compact />
        </div>

        <div className="mt-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Length, front to back</div>
          <FeetInchesInput key={`l${seed}`} initialFt={l} onChange={setL} invalid={lBad} compact />
        </div>

        {/* Live read-back. A fat-fingered 120 ft wall announces itself as 1,200 sq ft
            before the tech ever taps Draw it. */}
        <div className="h-6 mt-3 text-center">
          {wBad || lBad ? (
            <span className="text-[12px] font-semibold text-red-600">That is over 200 ft. Check the number.</span>
          ) : ok ? (
            <span className="text-[13px] text-gray-500">
              <span className="font-bold text-navy">{formatFeetInches(w!)} &times; {formatFeetInches(l!)}</span>
              {'  =  '}
              <span className="font-bold text-navy tabular-nums">{sqft.toFixed(sqft < 100 ? 1 : 0)}</span> sq ft
            </span>
          ) : (
            <span className="text-[12px] text-gray-400">Feet in the left box, inches in the right.</span>
          )}
        </div>

        <div className="flex items-start gap-2 bg-sky-soft/60 rounded-xl px-3 py-2 mt-1">
          <Info size={13} className="text-sky-deep shrink-0 mt-0.5" />
          <span className="text-[11.5px] text-sky-deep leading-relaxed">
            This is the room's footprint. Ceiling height is measured in the sketch, and wall area is the perimeter times that height.
          </span>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={!ok} className="btn-primary flex-1 py-3 justify-center disabled:opacity-40">Draw it</button>
        </div>
      </div>
    </div>
  );
}