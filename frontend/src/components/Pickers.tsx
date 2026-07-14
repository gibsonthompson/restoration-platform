import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';

// ============================================================================
// CUSTOM PICKERS
// ----------------------------------------------------------------------------
// The native <select> and <input type="date"> hand the screen to iOS. On a phone
// that means a grey system wheel that ignores the app entirely, cannot show a
// description next to an option, cannot warn, and cannot explain what "Class 3"
// means to a tech who has never been told. Every choice in this app is a field
// decision that ends up on an insurance document, so the picker has to be able to
// teach as well as collect.
//
// These are plain React. No portals, no browser storage, no native controls.
// ============================================================================

export interface Option {
  value: string;
  label: string;
  desc?: string;    // one plain-English line under the label
  code?: string;    // e.g. the Xactimate code, shown as a mono chip
}

const sheetWrap = 'fixed inset-0 z-[80] flex items-end sm:items-center justify-center';
const sheetCard = 'relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col';

function SheetHead({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-start gap-2 shrink-0">
      <div className="min-w-0 flex-1">
        <div className="font-display font-bold text-lg text-navy leading-tight">{title}</div>
        {subtitle && <p className="text-[11.5px] text-gray-400 mt-0.5 leading-snug">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose}
              className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
        <X size={18} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SelectField: a field that looks like the text inputs and opens our own sheet.
// ---------------------------------------------------------------------------
export function SelectField({ label, value, options, onChange, placeholder = 'Select', hint, sheetTitle, sheetNote, clearable = true }: {
  label: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  sheetTitle?: string;
  sheetNote?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value) || null;

  return (
    <div className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <button type="button" onClick={() => setOpen(true)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-left flex items-center gap-2 active:bg-gray-50 focus:outline-none focus:border-sky">
        <span className={`flex-1 min-w-0 text-[16px] truncate ${current ? 'text-navy font-medium' : 'text-gray-400'}`}>
          {current ? current.label : placeholder}
        </span>
        {current?.code && (
          <span className="text-[10px] font-bold tracking-wide bg-gray-100 text-gray-500 rounded-md px-1.5 py-0.5 shrink-0">
            {current.code}
          </span>
        )}
        <ChevronDown size={16} className="text-gray-400 shrink-0" />
      </button>
      {hint && <span className="block text-[11px] text-gray-400 mt-1 leading-snug">{hint}</span>}

      {open && (
        <div className={sheetWrap}>
          <div className="absolute inset-0 bg-navy/40" onClick={() => setOpen(false)} />
          <div className={sheetCard}>
            <SheetHead title={sheetTitle || label} subtitle={sheetNote} onClose={() => setOpen(false)} />

            <div className="overflow-y-auto px-2 py-2 safe-bottom">
              {clearable && value !== '' && (
                <button type="button" onClick={() => { onChange(''); setOpen(false); }}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-500 active:bg-gray-50">
                  Clear
                </button>
              )}
              {options.map(o => {
                const on = o.value === value;
                return (
                  <button key={o.value} type="button"
                          onClick={() => { onChange(o.value); setOpen(false); }}
                          className={`w-full text-left px-3 py-3 rounded-xl flex items-start gap-2.5 ${on ? 'bg-sky-soft' : 'active:bg-gray-50'}`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${on ? 'border-sky bg-sky' : 'border-gray-300'}`}>
                      {on && <Check size={12} className="text-white" strokeWidth={3.5} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[15px] leading-snug ${on ? 'font-bold text-sky-deep' : 'font-semibold text-navy'}`}>{o.label}</span>
                        {o.code && (
                          <span className="text-[10px] font-bold tracking-wide bg-gray-100 text-gray-500 rounded-md px-1.5 py-0.5 shrink-0">{o.code}</span>
                        )}
                      </div>
                      {o.desc && <div className="text-[11.5px] text-gray-500 leading-snug mt-0.5">{o.desc}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChoiceCards: for a short list where the DEFINITION matters as much as the value.
// Category and Class are the obvious case. A tech who picks Class 3 because it
// sounds bad is setting the equipment count and the drying budget for the job.
// ---------------------------------------------------------------------------
export function ChoiceCards({ label, value, options, onChange, hint, columns = 2 }: {
  label: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  hint?: string;
  columns?: 1 | 2;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <div className={`grid gap-2 mt-1 ${columns === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {options.map(o => {
          const on = o.value === value;
          return (
            <button key={o.value} type="button"
                    onClick={() => onChange(on ? '' : o.value)}
                    className={`text-left rounded-xl border px-3 py-2.5 transition ${on ? 'border-sky bg-sky-soft' : 'border-gray-200 bg-white active:bg-gray-50'}`}>
              <div className={`text-[14px] font-bold leading-tight ${on ? 'text-sky-deep' : 'text-navy'}`}>{o.label}</div>
              {o.desc && <div className="text-[11px] text-gray-500 leading-snug mt-1">{o.desc}</div>}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DateField: our own calendar.
// ----------------------------------------------------------------------------
// Dates are stored and returned as LOCAL YYYY-MM-DD. Never toISOString(), which is
// UTC and will hand back yesterday for anyone west of Greenwich after 5pm. A date
// of loss that is off by one day is a coverage argument.
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s?: string | null): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
};
export const todayISO = () => toISO(new Date());

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const prettyDate = (iso: string) => {
  const d = parseISO(iso);
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};

export function DateField({ label, value, onChange, hint, min, max, sheetNote }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  min?: string;
  max?: string;
  sheetNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseISO(value);
  const [cursor, setCursor] = useState<Date>(() => selected || new Date());

  // Reopening on a different value should land on that month, not the last one viewed.
  useEffect(() => { if (open) setCursor(parseISO(value) || new Date()); }, [open, value]);

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startPad = first.getDay();
    const daysIn = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysIn; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const today = toISO(new Date());
  const blocked = (iso: string) => (min != null && iso < min) || (max != null && iso > max);

  const pick = (d: Date) => {
    const iso = toISO(d);
    if (blocked(iso)) return;
    onChange(iso);
    setOpen(false);
  };
  const shiftMonth = (n: number) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <div className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <button type="button" onClick={() => setOpen(true)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 mt-1 text-left flex items-center gap-2 active:bg-gray-50 focus:outline-none focus:border-sky">
        <Calendar size={15} className="text-gray-400 shrink-0" />
        <span className={`flex-1 min-w-0 text-[16px] truncate ${value ? 'text-navy font-medium' : 'text-gray-400'}`}>
          {value ? prettyDate(value) : 'Select date'}
        </span>
      </button>
      {hint && <span className="block text-[11px] text-gray-400 mt-1 leading-snug">{hint}</span>}

      {open && (
        <div className={sheetWrap}>
          <div className="absolute inset-0 bg-navy/40" onClick={() => setOpen(false)} />
          <div className={sheetCard}>
            <SheetHead title={label} subtitle={sheetNote} onClose={() => setOpen(false)} />

            <div className="px-4 py-3 overflow-y-auto safe-bottom">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => shiftMonth(-1)}
                        className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95">
                  <ChevronLeft size={18} />
                </button>
                <div className="font-bold text-navy text-[15px]">
                  {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
                </div>
                <button type="button" onClick={() => shiftMonth(1)}
                        className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95">
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mt-3">
                {DOW.map((d, i) => (
                  <div key={i} className="text-center text-[10px] font-bold text-gray-400 py-1">{d}</div>
                ))}
                {grid.map((d, i) => {
                  if (!d) return <div key={i} />;
                  const iso = toISO(d);
                  const on = iso === value;
                  const isToday = iso === today;
                  const off = blocked(iso);
                  return (
                    <button key={i} type="button" onClick={() => pick(d)} disabled={off}
                            className={`h-10 rounded-xl text-[14px] font-semibold transition
                              ${on ? 'bg-gradient-to-br from-sky to-sky-deep text-white shadow-sky'
                                   : off ? 'text-gray-300'
                                   : isToday ? 'bg-sky-soft text-sky-deep'
                                   : 'text-navy active:bg-gray-100'}`}>
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => { if (!blocked(today)) { onChange(today); setOpen(false); } }}
                        className="flex-1 py-2.5 rounded-xl bg-gray-100 text-sm font-bold text-gray-600 active:scale-95">
                  Today
                </button>
                {value && (
                  <button type="button" onClick={() => { onChange(''); setOpen(false); }}
                          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 active:bg-gray-50">
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}