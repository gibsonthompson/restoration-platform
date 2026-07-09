import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Droplet, Flame, Sprout, ShieldCheck, Camera, Ruler, FileText, PenLine,
  Wind, Check, ArrowRight, Zap, WifiOff
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// Landing + signup in one. Marketing scroll page (no app shell / bottom nav).
// Design matches the app: Bricolage Grotesque display, navy/sky gradients, soft cards.
export default function Landing() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signUp() {
    if (!email || !password) { setErr('Enter an email and password.'); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setErr(error.message);
    else nav('/'); // ProtectedRoute -> CreateOrg when there's no workspace yet
  }

  const scrollToSignup = () => document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth' });

  const SignupForm = ({ compact = false }: { compact?: boolean }) => (
    <div className={compact ? '' : 'card !p-5 sm:!p-6'}>
      {err && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">{err}</p>}
      <div className="space-y-2.5">
        <input className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-[16px] focus:outline-none focus:border-sky bg-white"
          placeholder="Work email" type="email" autoComplete="email" inputMode="email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-[16px] focus:outline-none focus:border-sky bg-white"
          placeholder="Create a password" type="password" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') signUp(); }} />
        <button onClick={signUp} disabled={busy}
          className="w-full bg-gradient-to-br from-sky to-sky-deep text-white rounded-xl py-3.5 font-bold shadow-sky active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? 'Creating your workspace…' : <>Start free <ArrowRight size={18} /></>}
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-2.5 text-center">No credit card. No hardware. Works on any device.</p>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-white text-navy">
      {/* nav */}
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky to-sky-deep flex items-center justify-center shadow-soft">
              <Droplet size={17} className="text-white" />
            </div>
            <span className="font-display font-bold text-[16px]">Restoration Docs</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/login" className="font-semibold text-gray-500 hover:text-navy">Sign in</Link>
            <button onClick={scrollToSignup} className="hidden sm:inline-flex bg-navy text-white font-semibold rounded-lg px-4 py-2 hover:bg-navy-soft transition">Start free</button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-soft/40 to-white pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-5 pt-14 pb-16 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[12px] font-bold text-sky-deep bg-sky-soft rounded-full px-3 py-1.5 mb-5">
              <Droplet size={13} /> <Flame size={13} /> <Sprout size={13} /> For water, fire &amp; mold restoration
            </div>
            <h1 className="font-display font-extrabold text-[38px] sm:text-[46px] leading-[1.05] tracking-tight">
              Get paid in full.<br /><span className="text-sky-deep">Without the scrub.</span>
            </h1>
            <p className="text-[16px] text-gray-500 mt-4 leading-relaxed max-w-md">
              The field documentation and insurance‑claim tool for restoration crews. Capture the job on‑site, prove it to the carrier, and stop losing margin to estimate scrubbing.
            </p>
            <div id="signup" className="mt-6 max-w-sm scroll-mt-20">
              <SignupForm />
            </div>
            <p className="text-sm text-gray-400 mt-3">Already have an account? <Link to="/login" className="text-sky-deep font-semibold">Sign in</Link></p>
          </div>

          {/* product preview — the Claim Readiness differentiator, in a phone frame */}
          <div className="relative mx-auto w-[300px]">
            <div className="rounded-[2.2rem] bg-navy p-2.5 shadow-[0_30px_80px_rgba(14,42,77,0.28)]">
              <div className="rounded-[1.8rem] bg-[#EDF1F6] overflow-hidden">
                <div className="bg-gradient-to-br from-navy-soft to-navy text-white px-4 pt-5 pb-4">
                  <div className="text-[11px] opacity-70">John Appleseed · Cat 1 · Class 2</div>
                  <div className="font-display font-bold text-lg mt-0.5">1234 Road St.</div>
                </div>
                <div className="p-3 space-y-2.5">
                  <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
                    <div className="flex items-center gap-3 p-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex flex-col items-center justify-center">
                        <span className="text-[14px] font-bold leading-none">94</span><span className="text-[7px] opacity-80">/100</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-[13px] font-bold flex items-center gap-1"><ShieldCheck size={13} className="text-emerald-500" /> Claim Readiness</div>
                        <div className="text-[10px] text-gray-400">Carrier‑ready · 8/9 checks pass</div>
                      </div>
                    </div>
                    <div className="px-3 pb-3 space-y-1.5">
                      {[['Work authorization signed', true], ['Daily drying monitoring', true], ['3+ monitoring points', false]].map(([l, ok], i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          {ok ? <Check size={12} className="text-emerald-500" /> : <span className="text-amber-500 text-[12px]">⚠</span>}
                          <span className={ok ? 'text-gray-500' : 'text-amber-700 font-semibold'}>{l}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl shadow-soft p-3">
                    <div className="text-[11px] font-bold text-gray-500 mb-2 flex items-center gap-1"><Wind size={12} className="text-sky" /> Drying · Chamber 1</div>
                    <div className="flex items-end gap-1 h-10">
                      {[70, 62, 55, 48, 44, 40, 36].map((h, i) => (
                        <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-sky to-sky-deep" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                    <div className="text-[9px] text-gray-400 mt-1">GPP trending to dry standard</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* problem strip */}
      <section className="bg-navy text-white">
        <div className="max-w-6xl mx-auto px-5 py-14">
          <p className="font-display font-bold text-[24px] sm:text-[30px] leading-tight max-w-3xl">
            Roughly 80% of restoration work is insurance‑funded, and the single biggest margin leak is the <span className="text-aqua">estimate scrub</span>.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 mt-9">
            {[
              ['Missing readings', 'Skipped days and thin drying logs get flagged and cut.'],
              ['Weak photo proof', 'No timestamps, no GPS, no defensible record of the loss.'],
              ['Hours of transcription', 'Paper logs and per‑project software fees eat the crew’s time.']
            ].map(([t, d]) => (
              <div key={t}>
                <div className="font-bold text-[15px]">{t}</div>
                <div className="text-[13px] text-white/60 mt-1 leading-relaxed">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <h2 className="font-display font-extrabold text-[28px] sm:text-[34px] text-center">Capture. Prove. Get paid.</h2>
        <p className="text-gray-500 text-center mt-2 max-w-lg mx-auto">The whole job, from the first photo on‑site to the carrier‑ready package, on one device.</p>
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {[
            [Camera, 'Capture in the field', 'Photos with time + GPS, moisture maps, drying readings, contents, and e‑signatures, offline‑ready.'],
            [ShieldCheck, 'Prove it before you send', 'The Claim Readiness audit predicts what an adjuster will challenge and shows you exactly what to fix.'],
            [FileText, 'Get the carrier‑ready package', 'A branded report and daily drying log, shareable by clean link, that survives the scrub.']
          ].map(([Icon, t, d], i) => (
            <div key={i} className="card !p-5">
              <div className="w-11 h-11 rounded-2xl bg-sky-soft text-sky-deep flex items-center justify-center mb-3"><Icon size={20} /></div>
              <div className="font-bold text-[16px]">{t as string}</div>
              <div className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{d as string}</div>
            </div>
          ))}
        </div>
      </section>

      {/* feature: claim defense spotlight */}
      <section className="bg-gradient-to-b from-sky-soft/40 to-white">
        <div className="max-w-6xl mx-auto px-5 py-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[12px] font-bold text-sky-deep bg-white rounded-full px-3 py-1.5 mb-4 shadow-soft"><ShieldCheck size={13} /> Claim Defense</div>
            <h2 className="font-display font-extrabold text-[28px] sm:text-[32px] leading-tight">The audit the adjuster runs, run on yourself first.</h2>
            <p className="text-gray-500 mt-3 leading-relaxed">
              Before a package goes out, Restoration Docs scores the claim and flags the gaps carriers scrub on, missing daily readings, unsigned authorizations, thin monitoring, equipment that doesn’t match the S500 calc. Fix it before you submit, not after you’re shorted.
            </p>
            <ul className="mt-5 space-y-2.5">
              {['S500‑aligned drying guardrails', 'Timestamped, GPS‑stamped photo proof', 'Equipment‑days that defend the invoice', 'Nothing auto‑submits, you review everything'].map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14px]"><Check size={17} className="text-sky-deep mt-0.5 shrink-0" /> {f}</li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              [Ruler, 'Moisture mapping', 'Paint wet areas, place equipment, mark flood cuts and containment.'],
              [Wind, 'Drying & S500', 'Psychrometrics, chambers, and a daily drying log that auto‑fills GPP.'],
              [Camera, 'Photos & contents', 'Room‑grouped, stamped photos and salvageable‑vs‑loss inventory.'],
              [PenLine, 'E‑signatures', 'Work authorizations and completion certificates signed on‑site.']
            ].map(([Icon, t, d], i) => (
              <div key={i} className="card !p-4">
                <div className="w-9 h-9 rounded-xl bg-navy text-white flex items-center justify-center mb-2.5"><Icon size={17} /></div>
                <div className="font-bold text-[14px]">{t as string}</div>
                <div className="text-[12px] text-gray-500 mt-1 leading-snug">{d as string}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* pricing wedge */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="rounded-3xl bg-navy text-white p-8 sm:p-12 text-center relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-sky/20 blur-2xl" />
          <div className="relative">
            <h2 className="font-display font-extrabold text-[28px] sm:text-[34px]">One flat price. Unlimited jobs.</h2>
            <p className="text-white/70 mt-3 max-w-xl mx-auto">No per‑project fees. No overages. No rush charges. No camera to buy. Unlimited claims and unlimited crew, on any device.</p>
            <div className="flex flex-wrap justify-center gap-3 mt-6 text-[13px]">
              {[[Zap, 'Unlimited claims & users'], [WifiOff, 'No app store, no hardware'], [ShieldCheck, 'Carrier‑ready exports']].map(([Icon, t], i) => (
                <span key={i} className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3.5 py-2 font-semibold"><Icon size={14} /> {t as string}</span>
              ))}
            </div>
            <button onClick={scrollToSignup} className="mt-8 bg-white text-navy font-bold rounded-xl px-7 py-3.5 active:scale-[0.99] inline-flex items-center gap-2">
              Start free <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky to-sky-deep flex items-center justify-center"><Droplet size={13} className="text-white" /></div>
            <span className="font-display font-bold text-navy">Restoration Docs</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/login" className="hover:text-navy">Sign in</Link>
            <button onClick={scrollToSignup} className="hover:text-navy">Start free</button>
          </div>
          <span>&copy; {new Date().getFullYear()} Reliable Solutions</span>
        </div>
      </footer>
    </div>
  );
}