import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, ShieldX, ChevronDown, ChevronRight, Check, AlertTriangle, X } from 'lucide-react';
import { type ReadinessResult, type CheckStatus } from '../lib/claimReadiness';

// Pre-submission "scrub-proof" readiness card. Presentational: the claim page
// computes the result as part of its single load and passes it in, so this card
// appears with the rest of the page instead of fetching on its own and popping
// in a beat later.
export function ClaimReadiness({ result }: { result: ReadinessResult }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  if (!result) return null;

  const theme = {
    ready: { bg: 'from-emerald-500 to-emerald-600', ring: 'text-emerald-500', Icon: ShieldCheck, label: 'Carrier-ready' },
    gaps: { bg: 'from-amber-500 to-amber-600', ring: 'text-amber-500', Icon: ShieldAlert, label: 'Minor gaps' },
    not_ready: { bg: 'from-red-500 to-red-600', ring: 'text-red-500', Icon: ShieldX, label: 'Not ready' }
  }[result.level];

  const StatusIcon = ({ s }: { s: CheckStatus }) =>
    s === 'pass' ? <Check size={15} className="text-emerald-500" /> :
    s === 'warn' ? <AlertTriangle size={15} className="text-amber-500" /> :
    <X size={15} className="text-red-500" />;

  const issues = result.checks.filter((c) => c.status !== 'pass');

  return (
    <div className="card !p-0 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 p-3.5 text-left active:bg-gray-50 transition">
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${theme.bg} text-white flex flex-col items-center justify-center shrink-0`}>
          <span className="text-[15px] font-bold leading-none">{result.score}</span>
          <span className="text-[8px] opacity-80 leading-none mt-0.5">/100</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm flex items-center gap-1.5"><theme.Icon size={15} className={theme.ring} /> Claim Readiness</div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {theme.label} · {result.passCount}/{result.total} checks pass{issues.length ? ` · ${issues.length} to fix` : ''}
          </div>
        </div>
        {open ? <ChevronDown size={18} className="text-gray-300 shrink-0" /> : <ChevronRight size={18} className="text-gray-300 shrink-0" />}
      </button>

      {open && (
        <div className="px-3.5 pb-3 border-t border-gray-100">
          {result.checks.map((c) => (
            <button key={c.id} onClick={() => c.to && nav(c.to)}
              className="w-full flex items-start gap-2.5 py-2.5 border-b border-gray-50 last:border-0 text-left active:bg-gray-50 transition">
              <span className="mt-0.5 shrink-0"><StatusIcon s={c.status} /></span>
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] font-semibold ${c.status === 'fail' ? 'text-red-600' : c.status === 'warn' ? 'text-amber-700' : 'text-gray-700'}`}>{c.label}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{c.detail}</div>
              </div>
              {c.to && c.status !== 'pass' && <ChevronRight size={15} className="text-gray-300 shrink-0 mt-0.5" />}
            </button>
          ))}
          <p className="text-[10px] text-gray-400 pt-2 leading-snug">
            Predicts what an adjuster is likely to challenge. Fix the flagged items before you send the report.
          </p>
        </div>
      )}
    </div>
  );
}