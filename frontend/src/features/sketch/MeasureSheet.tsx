import { useEffect, useRef, useState } from 'react';
import { parseFeetInches, formatFeetInches } from '../../lib/feetInches';

// Type an exact measurement.
//
// THIS IS THE THING THAT WAS MISSING. Every dimension in the app could only be set by
// dragging, and you cannot drag 12 ft 7 in with a fingertip. Draw for shape, TYPE for
// truth. Accepts what a tech actually types: 12' 7", 12'7, 12-7, 12 7, 12ft 7in, 151",
// 12' 7 1/2", or a bare 12.583. Rejects garbage rather than silently reading it as zero,
// because a zero dimension is a zero-dollar line item.
export function MeasureSheet({ title, subtitle, initialFt, min, max, onCancel, onSave, quick }: {
  title: string;
  subtitle?: string;
  initialFt?: number | null;
  min?: number;
  max?: number;
  quick?: { label: string; ft: number }[];
  onCancel: () => void;
  onSave: (ft: number) => void;
}) {
  const [text, setText] = useState(initialFt != null && initialFt > 0 ? formatFeetInches(initialFt) : '');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 60); return () => clearTimeout(t); }, []);

  const parsed = parseFeetInches(text);
  const tooSmall = parsed != null && min != null && parsed < min;
  const tooBig = parsed != null && max != null && parsed > max;
  const invalid = text.trim() !== '' && parsed == null;
  const ok = parsed != null && parsed > 0 && !tooSmall && !tooBig;

  const err = invalid
    ? 'That is not a measurement. Try 12\u2032 7\u2033, 12-7, or 12.58.'
    : tooSmall ? `Too small. Minimum ${formatFeetInches(min!)}.`
    : tooBig ? `Too large. Maximum ${formatFeetInches(max!)}.`
    : null;

  const submit = () => { if (ok) onSave(parsed!); };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6vh)' }}>
      <div className="absolute inset-0 bg-navy/40" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
        <div className="font-display font-bold text-lg text-navy">{title}</div>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{subtitle}</p>}

        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder={"12' 7\""}
          inputMode="text"
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
          className={`w-full border rounded-xl px-3.5 py-3.5 mt-3 text-[22px] font-bold tabular-nums text-center focus:outline-none ${
            err ? 'border-red-300 focus:border-red-400 text-red-600' : ok ? 'border-sky focus:border-sky text-navy' : 'border-gray-200 focus:border-sky'
          }`}
        />

        {/* live read-back: the tech sees exactly what the app understood */}
        <div className="h-5 mt-1.5 text-center">
          {err
            ? <span className="text-[12px] font-semibold text-red-600">{err}</span>
            : ok
              ? <span className="text-[12px] text-gray-400">= <span className="font-bold text-navy">{formatFeetInches(parsed!)}</span> ({parsed!.toFixed(3)} ft)</span>
              : <span className="text-[12px] text-gray-400">Feet and inches, or a decimal.</span>}
        </div>

        {quick && quick.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {quick.map(q => (
              <button key={q.label} onClick={() => setText(formatFeetInches(q.ft))}
                className="px-3 py-1.5 rounded-full text-[13px] font-semibold bg-sky-soft text-sky-deep active:scale-95">
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