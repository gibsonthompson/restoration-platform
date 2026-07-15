import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Info } from 'lucide-react';
import { formatFeetInches } from '../../lib/feetInches';
import { FeetInchesInput } from '../../components/FeetInchesInput';

// Type an exact measurement.
//
// THIS IS THE THING THAT WAS MISSING. Every dimension in the app could only be set by
// dragging, and you cannot drag 12 ft 7 in with a fingertip. Draw for shape, TYPE for
// truth.
//
// FEET AND INCHES ARE TWO NUMBER FIELDS. The first version of this took a text string
// and asked a tech to type 12' 7". Those characters live behind the symbol key on an
// iOS keyboard, and a person in a wet house wearing gloves is not going to hunt for
// them: they will type 12.58, or give up and drag the wall. Two number boxes and a
// numeric keypad. The app does the arithmetic.
//
// A value out of range is REJECTED rather than silently read as zero, because a zero
// dimension is a zero-dollar line item.
//
// STEP TO STEP RESET. FeetInchesInput only reads initialFt when it mounts (that is why a
// quick chip bumps `seed` to remount it). A multi-step flow reuses this ONE sheet: the
// door width step and the door height step are the same MeasureSheet with a new initialFt.
// Without the effect below, the height step opened showing the width just typed (enter a
// 2 ft width and the height box started at 2 ft), because neither `ft` nor the input was
// reset. Now, whenever the caller hands down a new initialFt (the next step, or a new
// opening being measured), the value resets to it and the input remounts to show it. The
// height default is whatever the caller passes (6 ft 8 in for a door, 4 ft for a window,
// full ceiling for a missing wall), so this stays per-kind and never a flat guess. The
// reset is skipped on the first render so typing is never clobbered mid-entry.
export function MeasureSheet({ title, subtitle, note, initialFt, min, max, onCancel, onSave, onBack, quick, step }: {
  title: string;
  subtitle?: string;
  note?: string;                          // plain-English explanation of the thing being measured
  initialFt?: number | null;
  min?: number;
  max?: number;
  quick?: { label: string; ft: number }[];
  step?: { current: number; total: number };
  onCancel: () => void;
  onSave: (ft: number) => void;
  onBack?: () => void;                    // a multi-step flow must be reversible
}) {
  const [ft, setFt] = useState<number | null>(initialFt != null && initialFt > 0 ? initialFt : null);
  // Remounts the inputs when a quick chip is tapped, so the boxes show the chosen value.
  const [seed, setSeed] = useState(0);

  // Follow the caller's initialFt when it changes (next step, or a different opening).
  // FeetInchesInput only reads initialFt at mount, so we reset the value AND bump seed to
  // remount it. Skipped on the first render (mount already seeded correctly), so a value
  // the tech is typing is never wiped out from under them.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    setFt(initialFt != null && initialFt > 0 ? initialFt : null);
    setSeed(s => s + 1);
  }, [initialFt]);

  const tooSmall = ft != null && min != null && ft < min;
  const tooBig = ft != null && max != null && ft > max;
  const ok = ft != null && ft > 0 && !tooSmall && !tooBig;

  const err = tooSmall ? `Too small. Minimum ${formatFeetInches(min!)}.`
    : tooBig ? `Too large. Maximum ${formatFeetInches(max!)}.`
    : null;

  const submit = () => { if (ok) onSave(ft!); };
  const takeQuick = (v: number) => { setFt(v); setSeed(s => s + 1); };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6vh)' }}>
      <div className="absolute inset-0 bg-navy/40" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
        <div className="flex items-start gap-2">
          {onBack && (
            <button onClick={onBack} className="w-8 h-8 -ml-1 rounded-xl flex items-center justify-center text-gray-500 active:bg-gray-100 shrink-0">
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-lg text-navy">{title}</div>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{subtitle}</p>}
          </div>
          {step && (
            <span className="text-[11px] font-bold text-gray-400 shrink-0 mt-1">{step.current} of {step.total}</span>
          )}
        </div>

        {note && (
          <div className="flex items-start gap-2 bg-sky-soft/60 rounded-xl px-3 py-2 mt-2.5">
            <Info size={13} className="text-sky-deep shrink-0 mt-0.5" />
            <span className="text-[11.5px] text-sky-deep leading-relaxed">{note}</span>
          </div>
        )}

        <div className="mt-3">
          <FeetInchesInput key={seed} initialFt={ft} onChange={setFt} autoFocus invalid={!!err} />
        </div>

        {/* live read-back: the tech sees exactly what the app understood */}
        <div className="h-5 mt-2 text-center">
          {err
            ? <span className="text-[12px] font-semibold text-red-600">{err}</span>
            : ok
              ? <span className="text-[12px] text-gray-400">= <span className="font-bold text-navy">{formatFeetInches(ft!)}</span> ({ft!.toFixed(3)} ft)</span>
              : <span className="text-[12px] text-gray-400">Feet in the left box, inches in the right.</span>}
        </div>

        {quick && quick.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {quick.map(q => (
              <button key={q.label} onClick={() => takeQuick(q.ft)}
                className={`px-3 py-1.5 rounded-full text-[13px] font-semibold active:scale-95 ${
                  ft != null && Math.abs(ft - q.ft) < 1e-6 ? 'bg-sky text-white' : 'bg-sky-soft text-sky-deep'
                }`}>
                {q.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={!ok} className="btn-primary flex-1 py-3 justify-center disabled:opacity-40">Set</button>
        </div>
      </div>
    </div>
  );
}