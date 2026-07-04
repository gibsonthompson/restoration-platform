import { useState } from 'react';
import { X } from 'lucide-react';

// Next non-colliding name: "Bedroom" -> "Bedroom 2" -> "Bedroom 3" (Encircle's
// recommended pattern for repeated rooms), case-insensitive.
function nextName(base: string, existing: string[]): string {
  const taken = new Set(existing.map(s => s.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

// In-app naming sheet: tap a suggestion (auto-numbered) or type a custom name.
// Anchored high so the keyboard never covers it. Matches the app design system.
export function NameSheet({ title, subtitle, placeholder, suggestions, existing, onCancel, onSubmit }: {
  title: string; subtitle?: string; placeholder?: string;
  suggestions: string[]; existing: string[];
  onCancel: () => void; onSubmit: (name: string) => void;
}) {
  const [value, setValue] = useState('');
  const submit = () => { const v = value.trim(); if (v) onSubmit(v); };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-6"
         style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10vh)' }}>
      <div className="absolute inset-0 bg-navy/30" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display font-bold text-lg text-navy">{title}</div>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onCancel} className="p-1 -mr-1 text-gray-400 active:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {suggestions.map(s => (
            <button key={s} onClick={() => setValue(nextName(s, existing))}
                    className="px-3 py-1.5 rounded-full text-[13px] font-semibold bg-sky-soft text-sky-deep active:scale-95 transition">
              {s}
            </button>
          ))}
        </div>

        <input value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder}
               onKeyDown={e => { if (e.key === 'Enter') submit(); }}
               className="w-full border border-gray-200 rounded-xl px-3.5 py-3 mt-3 text-[16px] focus:outline-none focus:border-sky" />

        <div className="flex gap-2 mt-3">
          <button onClick={onCancel} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={!value.trim()} className="btn-primary flex-1 py-3 justify-center disabled:opacity-40">Add</button>
        </div>
      </div>
    </div>
  );
}