import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Droplet, Flame, Sprout, ShieldCheck, Camera, Ruler, FileText, PenLine,
  Wind, Check, X, ArrowRight, Zap, WifiOff, MailCheck, Smartphone,
  PencilRuler, ClipboardList, Boxes, FileCheck2, MapPin, ChevronDown
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// Landing + signup in one. Marketing scroll page (no app shell / bottom nav).
// The document itself is locked from scrolling (index.css: html,body overflow
// hidden for the PWA shell), so this page owns its own vertical scroll via the
// root container, exactly like the app's <main>.
// Design matches the app: Bricolage Grotesque display, navy/sky gradients, soft
// cards. Signature element is the Claim Readiness audit score, the one thing that
// separates RestoMate from every documentation tool: you run the adjuster's scrub
// on yourself before you submit.
export default function Landing() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null); // set when the project requires email confirmation

  async function signUp() {
    const mail = email.trim();
    if (!mail || !password) { setErr('Enter an email and password.'); return; }
    if (password.length < 6) { setErr('Use at least 6 characters for your password.'); return; }
    setBusy(true); setErr(null);
    const { data, error } = await supabase.auth.signUp({
      email: mail, password,
      options: { emailRedirectTo: `${window.location.origin}/login` }
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    // If the project requires email confirmation, signUp returns no session.
    // Navigating to '/' here would bounce the user to /login and read as a
    // broken signup, so show a confirm-your-email state instead. When
    // confirmation is off, data.session is present and we go straight in.
    if (!data.session) { setSentTo(mail); return; }
    nav('/'); // has a session -> ProtectedRoute sends them to CreateOrg
  }

  const scrollToSignup = () => document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth' });
  const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  // NOTE: the signup form is inlined (not a nested <SignupForm/> component). A
  // nested component gets a new function identity on every keystroke-driven
  // re-render, which remounts the inputs and drops focus. Inlining keeps focus.
  const signupCard = (
    <div className="card !p-5 sm:!p-6">
      {sentTo ? (
        <div className="text-center py-2">
          <div className="w-11 h-11 rounded-2xl bg-sky-soft text-sky-deep flex items-center justify-center mx-auto mb-3"><MailCheck size={22} /></div>
          <div className="font-bold text-[15px]">Confirm your email</div>
          <p className="text-[13px] text-gray-500 mt-1">We sent a link to <span className="font-semibold text-navy">{sentTo}</span>. Click it to finish setting up your workspace.</p>
          <Link to="/login" className="inline-block text-sky-deep font-semibold text-sm mt-3">Go to sign in</Link>
        </div>
      ) : (
        <>
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
              {busy ? 'Creating your workspace...' : <>Start free <ArrowRight size={18} /></>}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2.5 text-center">No credit card. No hardware. Works on any device.</p>
        </>
      )}
    </div>
  );

  const navLinks: [string, string][] = [
    ['How it works', 'how'],
    ['Features', 'features'],
    ['Xactimate', 'xactimate'],
    ['Compare', 'compare'],
    ['FAQ', 'faq']
  ];

  return (
    <div className="h-[100dvh] overflow-y-auto bg-white text-navy">
      {/* nav */}
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/welcome" className="flex items-center">
            <img src="/restomate-logo.svg" alt="RestoMate" className="h-7 w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-[13px] font-semibold text-gray-500">
            {navLinks.map(([label, id]) => (
              <button key={id} onClick={() => scrollToId(id)} className="hover:text-navy transition">{label}</button>
            ))}
          </nav>
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
              RestoMate turns your on-site documentation into a carrier-ready claim package built to survive the adjuster's scrub. Capture the job once, prove every line, and keep the margin you earned.
            </p>
            <div id="signup" className="mt-6 max-w-sm scroll-mt-20">
              {signupCard}
            </div>
            <p className="text-sm text-gray-400 mt-3">Already have an account? <Link to="/login" className="text-sky-deep font-semibold">Sign in</Link></p>
          </div>

          {/* product preview: the Claim Readiness differentiator, in a phone frame */}
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
                        <div className="text-[10px] text-gray-400">Carrier-ready · 8/9 checks pass</div>
                      </div>
                    </div>
                    <div className="px-3 pb-3 space-y-1.5">
                      {[['Work authorization signed', true], ['Daily drying monitoring', true], ['3+ monitoring points', false]].map(([l, ok], i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          {ok ? <Check size={12} className="text-emerald-500" /> : <span className="text-amber-500 text-[12px]">!</span>}
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

      {/* trust strip */}
      <section className="border-y border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-5 py-4 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[13px] font-semibold text-gray-500">
          {[[WifiOff, 'Works offline in the field'], [Smartphone, 'No hardware to buy'], [ShieldCheck, 'Carrier-ready exports'], [Zap, 'Unlimited jobs & crew']].map(([Icon, t], i) => (
            <span key={i} className="inline-flex items-center gap-2"><Icon size={15} className="text-sky-deep" /> {t as string}</span>
          ))}
        </div>
      </section>

      {/* problem strip */}
      <section className="bg-navy text-white">
        <div className="max-w-6xl mx-auto px-5 py-14">
          <p className="font-display font-bold text-[24px] sm:text-[30px] leading-tight max-w-3xl">
            Restoration runs on insurance money. The fastest way to lose it is handing the adjuster a claim they can <span className="text-aqua">scrub</span>.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 mt-9">
            {[
              ['Thin drying logs', 'Skipped monitoring days and missing readings get flagged and cut from the invoice.'],
              ['Weak photo proof', 'No timestamps, no GPS, nothing that pins the loss to a time and a place.'],
              ['Hours lost to paperwork', 'Paper logs and per-project software fees bleed the crew\u2019s time and your margin.']
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
      <section id="how" className="max-w-6xl mx-auto px-5 py-16 scroll-mt-16">
        <h2 className="font-display font-extrabold text-[28px] sm:text-[34px] text-center">Capture. Prove. Get paid.</h2>
        <p className="text-gray-500 text-center mt-2 max-w-lg mx-auto">The whole job, from the first photo on-site to the carrier-ready package, on one device.</p>
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {[
            [Camera, 'Capture in the field', 'Photos stamped with time and GPS, moisture maps, drying readings, contents, and e-signatures. Offline-ready.'],
            [ShieldCheck, 'Prove it before you send', 'The Claim Readiness audit predicts what the adjuster will challenge and shows you exactly what to fix first.'],
            [FileText, 'Hand over the package', 'A branded report and daily drying log, shareable by clean link, that holds up line by line under the scrub.']
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
      <section id="features" className="bg-gradient-to-b from-sky-soft/40 to-white scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5 py-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[12px] font-bold text-sky-deep bg-white rounded-full px-3 py-1.5 mb-4 shadow-soft"><ShieldCheck size={13} /> Claim Defense</div>
            <h2 className="font-display font-extrabold text-[28px] sm:text-[32px] leading-tight">The audit the adjuster runs, run on yourself first.</h2>
            <p className="text-gray-500 mt-3 leading-relaxed">
              Before a package goes out, RestoMate scores the claim and flags the gaps carriers scrub on: missing daily readings, unsigned authorizations, thin monitoring, equipment that doesn\u2019t match the S500 calc. You fix it before you submit, not after you\u2019re shorted.
            </p>
            <ul className="mt-5 space-y-2.5">
              {['S500-aligned drying guardrails', 'Timestamped, GPS-stamped photo proof', 'Equipment-days that defend the invoice', 'Nothing auto-submits, you review everything'].map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14px]"><Check size={17} className="text-sky-deep mt-0.5 shrink-0" /> {f}</li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              [Ruler, 'Moisture mapping', 'Paint wet areas, place equipment, mark flood cuts and containment.'],
              [Wind, 'Drying & S500', 'Psychrometrics, chambers, and a daily drying log that auto-fills GPP.'],
              [Camera, 'Photos & contents', 'Room-grouped, stamped photos and a salvageable-vs-loss inventory.'],
              [PenLine, 'E-signatures', 'Work authorizations and completion certificates signed on-site.']
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

      {/* xactimate handoff */}
      <section id="xactimate" className="max-w-6xl mx-auto px-5 py-16 scroll-mt-16">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="order-2 lg:order-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              [PencilRuler, 'Scaled sketch underlay', 'Export each level as a to-scale image with a calibration line. Import it into Xactimate and trace the rooms right over it, no re-measuring.'],
              [ClipboardList, 'Entry sheet', 'A clean, room-by-room list of the scope and quantities to key into Xactimate, so nothing on-site gets left off the estimate.']
            ].map(([Icon, t, d], i) => (
              <div key={i} className="card !p-5">
                <div className="w-11 h-11 rounded-2xl bg-sky-soft text-sky-deep flex items-center justify-center mb-3"><Icon size={20} /></div>
                <div className="font-bold text-[15px]">{t as string}</div>
                <div className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{d as string}</div>
              </div>
            ))}
          </div>
          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-1.5 text-[12px] font-bold text-sky-deep bg-sky-soft rounded-full px-3 py-1.5 mb-4">Xactimate handoff</div>
            <h2 className="font-display font-extrabold text-[28px] sm:text-[32px] leading-tight">Feed Xactimate without re-drawing the job.</h2>
            <p className="text-gray-500 mt-3 leading-relaxed">
              What you sketch in the field comes back out as a scaled underlay to trace and a room-by-room entry sheet to key. Your estimator builds the Xactimate estimate from real measurements instead of starting over from a blank grid.
            </p>
          </div>
        </div>
      </section>

      {/* full feature grid */}
      <section className="bg-gradient-to-b from-white to-sky-soft/40">
        <div className="max-w-6xl mx-auto px-5 py-16">
          <h2 className="font-display font-extrabold text-[28px] sm:text-[34px] text-center">Everything the crew needs on-site.</h2>
          <p className="text-gray-500 text-center mt-2 max-w-lg mx-auto">One app for the whole loss, so the office is never chasing the field for what is missing.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-10">
            {[
              [Ruler, 'Moisture mapping', 'Wet areas, equipment, flood cuts, and containment on a room sketch.'],
              [PencilRuler, 'Floor plan sketch', 'Draw each room to scale and snap the level together.'],
              [Wind, 'Drying & S500', 'Chambers, psychrometrics, and a daily log that fills GPP for you.'],
              [Boxes, 'Contents inventory', 'Salvageable-vs-loss lists with photos, grouped by room.'],
              [MapPin, 'GPS photo proof', 'Every photo stamped with time and location, grouped by room.'],
              [PenLine, 'E-signatures', 'Authorizations and completion certificates signed on the spot.'],
              [FileCheck2, 'Carrier-ready reports', 'A branded report and drying log, shared by clean link or PDF.'],
              [WifiOff, 'Offline capture', 'Keep documenting in a dead basement; it syncs when you are back.']
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

      {/* comparison */}
      <section id="compare" className="max-w-6xl mx-auto px-5 py-16 scroll-mt-16">
        <h2 className="font-display font-extrabold text-[28px] sm:text-[34px] text-center">Why crews switch to RestoMate.</h2>
        <p className="text-gray-500 text-center mt-2 max-w-xl mx-auto">Most tools do one slice of the job and bill you by the project, the sketch, or the camera. RestoMate does the whole loss on a flat plan.</p>
        <div className="mt-10 card !p-0 overflow-hidden">
          <div className="grid grid-cols-3 text-[13px]">
            <div className="p-4 font-bold text-gray-400 uppercase tracking-wide text-[11px]">What you get</div>
            <div className="p-4 font-bold text-center bg-sky-soft text-sky-deep">RestoMate</div>
            <div className="p-4 font-bold text-center text-gray-400">The usual setup</div>
            {[
              ['Field capture, drying, contents, and reports in one app', true, false],
              ['Pre-submission Claim Readiness audit', true, false],
              ['Flat price, unlimited jobs and crew', true, false],
              ['No 360 camera or hardware to buy', true, false],
              ['No per-project or per-sketch fees', true, false],
              ['Works offline on any phone or tablet', true, false],
              ['Xactimate underlay and entry sheet', true, false]
            ].map(([label, a, b], i) => (
              <div key={i} className="contents">
                <div className="p-4 border-t border-gray-100 text-gray-600">{label as string}</div>
                <div className="p-4 border-t border-gray-100 flex justify-center bg-sky-soft/40">
                  {a ? <Check size={18} className="text-emerald-500" /> : <X size={18} className="text-gray-300" />}
                </div>
                <div className="p-4 border-t border-gray-100 flex justify-center">
                  {b ? <Check size={18} className="text-emerald-500" /> : <X size={18} className="text-gray-300" />}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[12px] text-gray-400 mt-3 max-w-2xl mx-auto text-center">
          The usual setup means stitching together tools like Encircle for documentation, DocuSketch for sketches (with a camera to buy and per-sketch fees), and magicplan billed per project, then reconciling drying and audit by hand.
        </p>
      </section>

      {/* pricing wedge */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="rounded-3xl bg-navy text-white p-8 sm:p-12 text-center relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-sky/20 blur-2xl" />
          <div className="relative">
            <h2 className="font-display font-extrabold text-[28px] sm:text-[34px]">One flat price. Unlimited jobs.</h2>
            <p className="text-white/70 mt-3 max-w-xl mx-auto">No per-project fees. No overages. No rush charges. No camera to buy. Unlimited claims and unlimited crew, on any device.</p>
            <div className="flex flex-wrap justify-center gap-3 mt-6 text-[13px]">
              {[[Zap, 'Unlimited claims & users'], [WifiOff, 'No app store, no hardware'], [ShieldCheck, 'Carrier-ready exports']].map(([Icon, t], i) => (
                <span key={i} className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3.5 py-2 font-semibold"><Icon size={14} /> {t as string}</span>
              ))}
            </div>
            <button onClick={scrollToSignup} className="mt-8 bg-white text-navy font-bold rounded-xl px-7 py-3.5 active:scale-[0.99] inline-flex items-center gap-2">
              Start free <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-5 py-16 scroll-mt-16">
        <h2 className="font-display font-extrabold text-[28px] sm:text-[34px] text-center">Questions crews ask.</h2>
        <div className="mt-8 space-y-3">
          {[
            ['Do I need a 360 camera or any hardware?', 'No. RestoMate runs on the phone or tablet the crew already carries. There is nothing to buy and nothing to charge overnight.'],
            ['Does it work offline in the field?', 'Yes. You can document a job in a dead basement or a house with no service, and it syncs automatically once you are back online.'],
            ['Does it work with Xactimate?', 'Yes. Export each level as a to-scale underlay to trace over in Xactimate, plus a room-by-room entry sheet of the scope and quantities to key in.'],
            ['Are there per-project or per-sketch fees?', 'No. It is one flat price with unlimited claims and unlimited crew. No overages, no rush charges, no per-sketch billing.'],
            ['Is the report actually carrier-ready?', 'Yes. You hand over a branded report and a daily drying log, shareable by clean link or PDF, built to hold up line by line under the adjuster scrub.'],
            ['What losses is it built for?', 'Water, fire, and mold restoration, from the first photo on-site through the carrier-ready package.']
          ].map(([q, a], i) => (
            <details key={i} className="group card !p-0 overflow-hidden">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none p-4 font-bold text-[15px]">
                {q}
                <ChevronDown size={18} className="text-gray-400 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-4 -mt-1 text-[13px] text-gray-500 leading-relaxed">{a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="max-w-6xl mx-auto px-5 pb-16">
        <div className="rounded-3xl bg-gradient-to-br from-navy-soft to-navy text-white p-8 sm:p-12 text-center">
          <img src="/restomate-logo-white.svg" alt="RestoMate" className="h-8 w-auto mx-auto mb-5" />
          <h2 className="font-display font-extrabold text-[28px] sm:text-[34px]">Stop getting shorted. Document the next job right.</h2>
          <p className="text-white/70 mt-3 max-w-lg mx-auto">Start your first claim free. No credit card, no hardware, no per-project fees.</p>
          <button onClick={scrollToSignup} className="mt-7 bg-white text-navy font-bold rounded-xl px-7 py-3.5 active:scale-[0.99] inline-flex items-center gap-2">
            Start free <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-5 py-9 grid sm:grid-cols-2 gap-6 items-center">
          <div>
            <img src="/restomate-logo.svg" alt="RestoMate" className="h-6 w-auto" />
            <p className="text-[13px] text-gray-400 mt-3 max-w-xs leading-relaxed">Field documentation and claim defense for water, fire, and mold restoration.</p>
          </div>
          <div className="flex flex-wrap sm:justify-end gap-x-6 gap-y-2 text-sm text-gray-500">
            <button onClick={() => scrollToId('how')} className="hover:text-navy">How it works</button>
            <button onClick={() => scrollToId('features')} className="hover:text-navy">Features</button>
            <button onClick={() => scrollToId('compare')} className="hover:text-navy">Compare</button>
            <button onClick={() => scrollToId('faq')} className="hover:text-navy">FAQ</button>
            <Link to="/login" className="hover:text-navy">Sign in</Link>
            <button onClick={scrollToSignup} className="hover:text-navy">Start free</button>
          </div>
        </div>
        <div className="border-t border-gray-100">
          <div className="max-w-6xl mx-auto px-5 py-4 text-[12px] text-gray-400 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>&copy; {new Date().getFullYear()} RestoMate</span>
            <span>Built with restoration crews in the field.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}