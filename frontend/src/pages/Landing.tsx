import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, MailCheck, Image as ImageIcon, Smartphone, Monitor } from 'lucide-react';
import { supabase } from '../lib/supabase';

/*
  ScopeBook marketing / landing page.

  Voice: written the way a restoration owner talks about the money fight, not
  insurance-speak. The pain is the GAP, the estimate comes back light and
  justified line items get cut, so supplements drag and you eat 10-20%. The
  promise is getting paid the full scope. Real terms: line items, cut / reduced /
  denied, supplement, F9 rationale, equipment-days, moisture readings, drying log.

  Design intent (deliberately NOT the templated SaaS look): image-forward and
  editorial, real photos and UI screenshots carry it, icons nearly absent.
  Headings/labels/nav/buttons are Title Case; body stays sentence case.

  Every image is a <Shot/>: labeled placeholder now, real image the moment you
  pass `src` (drop files in public/site/). The logo is a text <Wordmark/> until a
  real ScopeBook SVG exists (the old file is a RestoMate wordmark and cannot be
  reused). Design tokens match the app. Signup logic is untouched.

  MOBILE: sections use tighter vertical rhythm on phones (py-14) that opens up on
  sm+ (py-20). The comparison table becomes stacked per-dimension cards under md,
  so nothing scrolls sideways. The header CTA stays visible at every width.
*/

function Wordmark({ light = false, className = '' }: { light?: boolean; className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-tight leading-none ${className}`}>
      <span className={light ? 'text-white' : 'text-navy'}>Scope</span><span className={light ? 'text-aqua' : 'text-sky-deep'}>Book</span>
    </span>
  );
}

type ShotKind = 'photo' | 'phone' | 'tablet' | 'browser';
function Shot({ kind, label, file, src, className = '' }: { kind: ShotKind; label: string; file: string; src?: string; className?: string }) {
  const placeholder = (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-2 bg-sky-soft/60 border border-dashed border-sky/50 text-sky-deep p-4">
      {kind === 'photo' ? <ImageIcon size={22} /> : kind === 'browser' ? <Monitor size={22} /> : <Smartphone size={22} />}
      <div className="text-[12px] font-bold leading-tight">{label}</div>
      <div className="text-[10px] text-sky-deep/60 font-mono">{file}</div>
    </div>
  );
  const inner = src ? <img src={src} alt={label} loading="lazy" className="w-full h-full object-cover" /> : placeholder;

  if (kind === 'phone') {
    return (
      <div className={`rounded-[2rem] bg-navy p-2 shadow-[0_24px_60px_rgba(14,42,77,0.22)] ${className}`}>
        <div className="rounded-[1.6rem] overflow-hidden bg-white aspect-[9/19] relative">
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-1.5 rounded-full bg-black/15 z-10" />
          {inner}
        </div>
      </div>
    );
  }
  if (kind === 'tablet') {
    return (
      <div className={`rounded-[1.4rem] bg-navy p-2.5 shadow-[0_24px_60px_rgba(14,42,77,0.22)] ${className}`}>
        <div className="rounded-2xl overflow-hidden bg-white aspect-[4/3]">{inner}</div>
      </div>
    );
  }
  if (kind === 'browser') {
    return (
      <div className={`rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-soft ${className}`}>
        <div className="h-8 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5 px-3">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-200" /><span className="w-2.5 h-2.5 rounded-full bg-gray-200" /><span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
          <span className="ml-2 h-4 flex-1 max-w-[220px] rounded bg-gray-100" />
        </div>
        <div className="aspect-[16/10]">{inner}</div>
      </div>
    );
  }
  return (
    <div className={`rounded-2xl overflow-hidden bg-sky-soft/40 ${className}`}>
      <div className="w-full h-full">{inner}</div>
    </div>
  );
}

function Eyebrow({ n, children }: { n?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      {n && <span className="font-display font-extrabold text-sky-deep text-[15px] tabular-nums">{n}</span>}
      {n && <span className="h-px w-8 bg-sky/50" />}
      <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-gray-400">{children}</span>
    </div>
  );
}

export default function Landing() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [billing, setBilling] = useState<'annual' | 'monthly'>('annual');

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
    if (!data.session) { setSentTo(mail); return; }
    nav('/');
  }

  const scrollToSignup = () => document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth' });
  const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  // Inlined (not a nested component) so keystroke re-renders don't remount and drop input focus.
  const signupCard = (
    <div className="card !p-5">
      {sentTo ? (
        <div className="text-center py-1.5">
          <div className="w-11 h-11 rounded-2xl bg-sky-soft text-sky-deep flex items-center justify-center mx-auto mb-3"><MailCheck size={22} /></div>
          <div className="font-bold text-[15px]">Confirm Your Email</div>
          <p className="text-[13px] text-gray-500 mt-1">We sent a link to <span className="font-semibold text-navy">{sentTo}</span>. Click it to finish setting up your workspace.</p>
          <Link to="/login" className="inline-block text-sky-deep font-semibold text-sm mt-3">Go to Sign In</Link>
        </div>
      ) : (
        <>
          {err && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">{err}</p>}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input className="flex-1 border border-gray-200 rounded-xl px-3.5 py-3 text-[16px] focus:outline-none focus:border-sky bg-white"
              placeholder="Work email" type="email" autoComplete="email" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="flex-1 border border-gray-200 rounded-xl px-3.5 py-3 text-[16px] focus:outline-none focus:border-sky bg-white"
              placeholder="Password" type="password" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') signUp(); }} />
          </div>
          <button onClick={signUp} disabled={busy}
            className="w-full mt-2.5 bg-gradient-to-br from-sky to-sky-deep text-white rounded-xl py-3.5 font-bold shadow-sky active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? 'Creating Your Workspace...' : <>Start Your Free Trial <ArrowRight size={18} /></>}
          </button>
          <p className="text-[11px] text-gray-400 mt-2.5 text-center">3-day free trial. No hardware. No per-project fees.</p>
        </>
      )}
    </div>
  );

  const nav_links: [string, string][] = [['How It Works', 'how'], ['Claim Defense', 'defense'], ['Xactimate', 'xactimate'], ['Compare', 'compare'], ['Pricing', 'pricing'], ['FAQ', 'faq']];

  // Comparison data, hoisted so the desktop table and the mobile card stack share one source.
  const compareCols = ['ScopeBook', 'Encircle', 'DocuSketch', 'magicplan'];
  const compareRows: [string, string, string, string, string][] = [
    ['Pricing model', 'Flat, unlimited jobs & users', 'Flat, by shop size', 'Per project + per sketch', 'Per project (+ overage)'],
    ['Cost as job volume grows', 'Stays flat', 'Stays flat', 'Climbs with sketches', 'Climbs with projects'],
    ['Hardware required', 'None (phone or tablet)', 'None', '360\u00b0 camera kit', 'None'],
    ['Drying & psychrometrics (S500)', 'Yes, daily log + GPP', 'Yes', 'Not yet', 'Moisture mapping only'],
    ['Pre-submission claim audit', 'Yes, Claim Defense', 'No', 'No', 'No'],
    ['Photos, contents, e-signatures', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Works offline in the field', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Unlimited users', 'Yes', 'Yes', 'Per-office fees', 'Yes']
  ];

  return (
    <div className="h-[100dvh] overflow-y-auto bg-white text-navy">
      {/* nav */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/welcome" className="flex items-center"><Wordmark className="text-[22px]" /></Link>
          <nav className="hidden md:flex items-center gap-6 text-[13px] font-semibold text-gray-500">
            {nav_links.map(([l, id]) => <button key={id} onClick={() => scrollToId(id)} className="hover:text-navy transition">{l}</button>)}
          </nav>
          <div className="flex items-center gap-3 sm:gap-4 text-sm">
            <Link to="/login" className="font-semibold text-gray-500 hover:text-navy">Sign In</Link>
            <button onClick={scrollToSignup} className="inline-flex bg-navy text-white font-semibold rounded-lg px-3 py-1.5 text-[13px] sm:px-4 sm:py-2 sm:text-sm hover:bg-navy-soft transition">Start Free</button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-5 pt-10 pb-12 sm:pt-14 sm:pb-16 grid lg:grid-cols-[1.05fr_0.95fr] gap-10 sm:gap-12 lg:gap-10 items-center">
        <div>
          <Eyebrow>Water &middot; Fire &middot; Mold Field Documentation</Eyebrow>
          <h1 className="font-display font-extrabold text-[34px] sm:text-[52px] leading-[1.05] sm:leading-[1.03] tracking-tight">
            Get Paid for the Whole Job, <span className="text-sky-deep">Not Most of It.</span>
          </h1>
          <p className="text-[16px] sm:text-[17px] text-gray-500 mt-4 sm:mt-5 leading-relaxed max-w-lg">
            On insurance work the estimate comes back light and justified line items get cut, so most shops quietly eat a 10 to 20% gap. ScopeBook documents every line in the field, moisture readings, photos, drying logs, F9 rationale, so it gets approved instead of reduced and you collect the full scope.
          </p>
          <div id="signup" className="mt-6 sm:mt-7 max-w-xl scroll-mt-20">{signupCard}</div>
          <p className="mt-4 text-[12px] font-semibold text-gray-400">Already have an account? <Link to="/login" className="text-sky-deep">Sign In</Link></p>
        </div>

        <div className="relative">
          <Shot kind="photo" className="aspect-[16/11] sm:aspect-[4/5]"
            label="Photo: Restoration Tech Using ScopeBook on a Tablet in a Gutted, Drying Room"
            file="/site/hero.jpg" />
          <div className="hidden sm:block absolute -bottom-5 -left-6 w-44">
            <Shot kind="phone" label="Claim Readiness Score" file="/site/ui-claim-readiness.png" />
          </div>
          <div className="hidden sm:flex absolute -top-3 -right-3 items-center gap-2 bg-white rounded-full shadow-soft px-3.5 py-2 text-[12px] font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Claim Ready, 94/100
          </div>
          {/* mobile-only proof pill, since the floating badge and phone shot are hidden on phones */}
          <div className="sm:hidden mt-3 flex items-center justify-center gap-2 bg-navy/[0.04] rounded-full py-2 text-[12px] font-bold text-navy">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Claim Ready Score, 94/100 Before You Submit
          </div>
        </div>
      </section>

      {/* credibility bar */}
      <section className="border-y border-gray-100 bg-navy text-white/80">
        <div className="max-w-6xl mx-auto px-5 py-3.5 sm:py-4 flex flex-wrap items-center justify-center gap-x-6 sm:gap-x-8 gap-y-1.5 text-[12px] sm:text-[13px] font-semibold text-center">
          <span>Built Around IICRC S500 Drying</span><span className="text-white/25 hidden sm:inline">/</span>
          <span>Works Offline in the Field</span><span className="text-white/25 hidden sm:inline">/</span>
          <span>No 360 Camera to Buy</span><span className="text-white/25 hidden sm:inline">/</span>
          <span>Unlimited Jobs &amp; Crew</span>
        </div>
      </section>

      {/* STORY */}
      <section id="how" className="max-w-6xl mx-auto px-5 py-14 sm:py-20 scroll-mt-16">
        <div className="max-w-2xl">
          <Eyebrow>How It Works</Eyebrow>
          <h2 className="font-display font-extrabold text-[27px] sm:text-[38px] leading-[1.08] sm:leading-[1.06]">One Job, One File, From First Photo to Final Payment.</h2>
        </div>

        {/* 01 */}
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center mt-10 sm:mt-14">
          <div>
            <Eyebrow n="01">On-Site</Eyebrow>
            <h3 className="font-display font-bold text-[22px] sm:text-[28px] leading-tight">Document Every Line While You&rsquo;re Standing in It.</h3>
            <p className="text-gray-500 mt-3 leading-relaxed">
              Moisture maps, flood cuts, containment, equipment placement, GPS and time-stamped photos, contents, and signatures, all on the phone the crew already carries. The proof that backs a supplement is captured as you work, not reconstructed from memory a week later.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-[12px] font-semibold text-navy">
              {['Moisture Readings', 'GPS Photo Proof', 'Contents Inventory', 'E-Signatures'].map((t) => (
                <span key={t} className="bg-sky-soft rounded-full px-3 py-1.5">{t}</span>
              ))}
            </div>
          </div>
          <div className="relative">
            <Shot kind="tablet" label="Moisture Map & Room Sketch" file="/site/ui-moisture-map.png" />
            <div className="hidden sm:block absolute -bottom-6 -right-4 w-40">
              <Shot kind="photo" className="aspect-[3/4]" label="Photo: Moisture Meter on Wet Drywall" file="/site/capture.jpg" />
            </div>
          </div>
        </div>

        {/* 03 */}
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center mt-16 sm:mt-24">
          <div className="order-2 lg:order-1 relative">
            <Shot kind="browser" label="Carrier-Ready Report & Share Link" file="/site/ui-report.png" />
            <div className="hidden sm:block absolute -bottom-6 -left-4 w-40">
              <Shot kind="photo" className="aspect-[4/3]" label="Photo: Owner Reviewing the File" file="/site/handoff.jpg" />
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <Eyebrow n="03">Handoff</Eyebrow>
            <h3 className="font-display font-bold text-[22px] sm:text-[28px] leading-tight">Hand the Adjuster a File That Backs Every Line.</h3>
            <p className="text-gray-500 mt-3 leading-relaxed">
              A branded report and a full daily drying log, sent as one clean link or PDF. Every reading, photo, and note lines up with the scope, so line items get approved instead of reduced, and supplements move instead of stalling.
            </p>
          </div>
        </div>
      </section>

      {/* 02 CLAIM DEFENSE (signature) */}
      <section id="defense" className="bg-navy text-white scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5 py-14 sm:py-20 grid lg:grid-cols-2 gap-12 lg:gap-14 items-center">
          <div>
            <Eyebrow n="02"><span className="text-white/50">Before You Submit</span></Eyebrow>
            <h2 className="font-display font-extrabold text-[28px] sm:text-[40px] leading-[1.07] sm:leading-[1.05]">Catch the Cut <span className="text-aqua">Before</span> the Carrier Does.</h2>
            <p className="text-white/70 mt-4 leading-relaxed max-w-md">
              Carriers reduce or deny the same line items over and over, usually because the file is missing the one thing that justifies them. Before your file goes out, ScopeBook checks every commonly-cut line for its proof, the photo, the reading, the drying log, the F9 note, and shows you the gap. You close it, so the line gets approved instead of reduced.
            </p>
            <ul className="mt-6 space-y-3 max-w-md">
              {[
                ['Flags the Lines Carriers Cut', 'Checks commonly-challenged items for the photo, reading, log, or F9 note that backs them.'],
                ['Defends Every Equipment-Day', 'Ties drying time and equipment to the readings that justify them on the invoice.'],
                ['Nothing Auto-Submits', 'It scores and warns. You review and send. Always.']
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <Check size={20} className="text-aqua mt-0.5 shrink-0" />
                  <span><span className="font-bold">{t}.</span> <span className="text-white/60">{d}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-[230px] sm:w-[270px]">
            <Shot kind="phone" label="Claim Readiness Audit, Full Screen" file="/site/ui-claim-readiness-full.png" />
          </div>
        </div>
      </section>

      {/* Drying & S500 */}
      <section className="max-w-6xl mx-auto px-5 py-14 sm:py-20">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div>
            <Eyebrow>Drying &amp; S500</Eyebrow>
            <h2 className="font-display font-extrabold text-[26px] sm:text-[34px] leading-tight">A Drying Log That Justifies Every Equipment-Day.</h2>
            <p className="text-gray-500 mt-3 leading-relaxed">
              Set the chambers, drop your air movers and dehus, and log readings. ScopeBook runs the psychrometrics, tracks GPP toward the dry standard, and builds the daily log automatically, so the equipment-days on your invoice are backed by the numbers instead of argued over.
            </p>
          </div>
          <div className="relative">
            <Shot kind="tablet" label="Daily Drying Log With GPP Chart" file="/site/ui-drying-log.png" />
            <div className="hidden sm:block absolute -top-6 -right-4 w-36">
              <Shot kind="photo" className="aspect-[3/4]" label="Photo: Logging Readings by a Dehumidifier" file="/site/drying.jpg" />
            </div>
          </div>
        </div>
      </section>

      {/* Xactimate */}
      <section id="xactimate" className="bg-sky-soft/30 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5 py-14 sm:py-20 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="order-2 lg:order-1"><Shot kind="browser" label="Xactimate Sketch Underlay (Scaled, to Trace)" file="/site/ui-underlay.png" /></div>
          <div className="order-1 lg:order-2">
            <Eyebrow>Xactimate Handoff</Eyebrow>
            <h2 className="font-display font-extrabold text-[26px] sm:text-[34px] leading-tight">Feed Xactimate Without Re-Drawing the Job.</h2>
            <p className="text-gray-500 mt-3 leading-relaxed">
              Export each level as a to-scale underlay with a calibration line, plus a room-by-room entry sheet of scope and quantities. Your estimator builds the estimate from real measurements, in the format adjusters approve faster and cut less, because they can compare it line by line.
            </p>
            <div className="mt-5 grid sm:grid-cols-2 gap-3 text-[13px]">
              <div className="card !p-3.5"><div className="font-bold">Scaled Underlay</div><div className="text-gray-500 mt-0.5">Trace the rooms right over it.</div></div>
              <div className="card !p-3.5"><div className="font-bold">Entry Sheet</div><div className="text-gray-500 mt-0.5">Key the scope, miss nothing.</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* crew photo band */}
      <section className="relative">
        <Shot kind="photo" className="!rounded-none aspect-[3/2] sm:aspect-[16/7]" label="Photo: Crew Loading Air Movers From a Branded Van at Dawn" file="/site/crew.jpg" />
        <div className="absolute inset-0 bg-navy/55 flex items-center">
          <div className="max-w-6xl mx-auto px-5 w-full">
            <p className="font-display font-extrabold text-white text-[22px] sm:text-[36px] leading-tight max-w-2xl">
              You Did the Work. ScopeBook Makes Sure You Get Paid for It.
            </p>
          </div>
        </div>
      </section>

      {/* bento */}
      <section className="max-w-6xl mx-auto px-5 py-14 sm:py-20">
        <div className="max-w-2xl mb-8 sm:mb-10">
          <Eyebrow>All in One App</Eyebrow>
          <h2 className="font-display font-extrabold text-[26px] sm:text-[34px] leading-tight">Everything the File Needs, Nothing the Office Has to Chase.</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:row-span-2 card !p-0 overflow-hidden">
            <Shot kind="photo" className="!rounded-none h-full min-h-[200px] sm:min-h-[240px]" label="Photo: Tech Capturing a Room on a Phone" file="/site/capture-2.jpg" />
          </div>
          {[
            ['Contents Inventory', 'Salvageable-vs-loss lists with photos, grouped by room.'],
            ['GPS Photo Proof', 'Every shot stamped with time and location.'],
            ['Floor Plan Sketch', 'Draw each room to scale, snap the level together.'],
            ['Offline Capture', 'Document in a dead basement; it syncs later.'],
            ['E-Signatures', 'Authorizations and completion certs signed on-site.'],
            ['Branded Reports', 'Your logo on the file the carrier reads.']
          ].map(([t, d]) => (
            <div key={t} className="card !p-4">
              <div className="font-bold text-[14px]">{t}</div>
              <div className="text-[12px] text-gray-500 mt-1 leading-snug">{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* comparison */}
      <section id="compare" className="bg-sky-soft/30 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5 py-14 sm:py-20">
          <div className="max-w-2xl mb-8 sm:mb-10">
            <Eyebrow>How ScopeBook Compares</Eyebrow>
            <h2 className="font-display font-extrabold text-[26px] sm:text-[34px] leading-tight">Built for a Shop That Documents Every Job.</h2>
            <p className="text-gray-500 mt-2">Per-project and per-sketch tools get expensive the more you work. ScopeBook is flat and unlimited, with the whole file and the claim audit in one place.</p>
          </div>

          {/* desktop: full table */}
          <div className="card !p-0 overflow-hidden hidden md:block">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr>
                  <th className="text-left font-bold text-gray-400 uppercase tracking-wide text-[11px] p-4 w-[26%]">What You Get</th>
                  <th className="p-4 text-center align-bottom bg-sky-soft"><Wordmark className="text-[15px]" /></th>
                  <th className="p-4 text-center align-bottom font-bold text-navy">Encircle</th>
                  <th className="p-4 text-center align-bottom font-bold text-navy">DocuSketch</th>
                  <th className="p-4 text-center align-bottom font-bold text-navy">magicplan</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map(([dim, rm, en, ds, mp], i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="p-4 font-semibold text-gray-600">{dim}</td>
                    <td className="p-4 text-center bg-sky-soft/40 font-bold text-navy">{rm}</td>
                    <td className="p-4 text-center text-gray-500">{en}</td>
                    <td className="p-4 text-center text-gray-500">{ds}</td>
                    <td className="p-4 text-center text-gray-500">{mp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile: one card per dimension, ScopeBook highlighted, no sideways scroll */}
          <div className="space-y-3 md:hidden">
            {compareRows.map((row, i) => {
              const [dim, ...vals] = row;
              return (
                <div key={i} className="card !p-4">
                  <div className="font-bold text-[13px] text-navy">{dim}</div>
                  <div className="mt-2.5 space-y-1">
                    {vals.map((v, j) => {
                      const isUs = j === 0;
                      return (
                        <div key={j} className={`flex items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 ${isUs ? 'bg-sky-soft' : ''}`}>
                          <span className={`text-[12px] shrink-0 ${isUs ? 'font-extrabold text-sky-deep' : 'font-semibold text-gray-400'}`}>{compareCols[j]}</span>
                          <span className={`text-[13px] text-right ${isUs ? 'font-bold text-navy' : 'text-gray-600'}`}>{v}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-gray-400 mt-3">Competitor details compiled from public pricing and product pages, 2026. Verify current specifics with each vendor.</p>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-5 py-14 sm:py-20 scroll-mt-16">
        <div className="max-w-2xl mb-8 sm:mb-10">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="font-display font-extrabold text-[26px] sm:text-[34px] leading-tight">One Plan. Everything In. Unlimited Jobs.</h2>
          <p className="text-gray-500 mt-2">No tiers, no per-project fees, no hardware. Every feature, every crew member, every claim, one flat price.</p>
        </div>

        <div className="rounded-3xl bg-navy text-white overflow-hidden relative">
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-sky/20 blur-3xl" />
          <div className="relative grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="p-7 sm:p-10 lg:border-r border-white/10">
              <div className="inline-flex items-center bg-white/10 rounded-full p-1 text-[13px] font-bold">
                <button onClick={() => setBilling('monthly')} className={`px-4 py-1.5 rounded-full transition ${billing === 'monthly' ? 'bg-white text-navy' : 'text-white/70'}`}>Monthly</button>
                <button onClick={() => setBilling('annual')} className={`px-4 py-1.5 rounded-full transition ${billing === 'annual' ? 'bg-white text-navy' : 'text-white/70'}`}>Annual</button>
              </div>

              <div className="mt-6 flex items-end gap-2">
                <span className="font-display font-extrabold text-[48px] sm:text-[54px] leading-none">{billing === 'annual' ? '$2,000' : '$249'}</span>
                <span className="text-white/60 font-semibold mb-2">{billing === 'annual' ? '/year' : '/month'}</span>
              </div>
              <div className="mt-2 text-[13px] text-white/70">
                {billing === 'annual'
                  ? <>That&rsquo;s $167/mo, billed annually. <span className="text-aqua font-bold">Save $988 a Year.</span></>
                  : <>Billed monthly, or pay $2,000/year and save $988.</>}
              </div>

              <div className="mt-6 inline-flex items-center gap-2 bg-white/10 rounded-full px-3.5 py-1.5 text-[12px] font-bold">
                <span className="w-2 h-2 rounded-full bg-aqua" /> Starts With a 3-Day Free Trial
              </div>

              <button onClick={scrollToSignup} className="w-full mt-6 bg-white text-navy font-bold rounded-xl py-3.5 active:scale-[0.99] inline-flex items-center justify-center gap-2">
                Start Your Free Trial <ArrowRight size={18} />
              </button>
              <p className="text-[11px] text-white/50 mt-3 text-center">No hardware. No per-project fees. Cancel anytime.</p>
            </div>

            <div className="p-7 sm:p-10">
              <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/50 mb-4">Everything Included</div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 text-[14px]">
                {['Unlimited Claims', 'Unlimited Users & Crew', 'Field Capture & Moisture Maps', 'Drying & S500 Log', 'Contents Inventory', 'GPS Photo Proof', 'E-Signatures', 'Claim Defense Audit', 'Xactimate Underlay & Entry Sheet', 'Branded Carrier-Ready Reports', 'Offline Capture', 'Custom Branding'].map((f) => (
                  <div key={f} className="flex items-center gap-2.5"><Check size={17} className="text-aqua shrink-0" /> <span className="text-white/85">{f}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-5 py-14 sm:py-20 scroll-mt-16">
        <div className="mb-8 sm:mb-9"><Eyebrow>Straight Answers</Eyebrow><h2 className="font-display font-extrabold text-[26px] sm:text-[34px]">Questions Owners Ask.</h2></div>
        <div className="space-y-3">
          {[
            ['Will this help my supplements get approved?', 'That is the point. Supplements get denied or delayed mostly for missing documentation. ScopeBook captures the readings, photos, drying logs, and F9 rationale that back each line, and flags what is missing before you submit.'],
            ['Does it work with Xactimate?', 'Yes. Export a to-scale underlay to trace in Xactimate plus a room-by-room entry sheet of scope and quantities to key in.'],
            ['Do I need a 360 camera or any hardware?', 'No. ScopeBook runs on the phone or tablet the crew already carries. Nothing to buy, nothing to charge overnight.'],
            ['Does it work offline in the field?', 'Yes. Document a job with no signal and it syncs automatically once you are back online.'],
            ['Are there per-project or per-sketch fees?', 'No. One flat price, unlimited claims and unlimited crew. No overages, no rush charges, no per-sketch billing.'],
            ['What losses is it built for?', 'Water, fire, and mold, from the first photo on-site through the carrier-ready file.']
          ].map(([q, a], i) => (
            <details key={i} className="group card !p-0 overflow-hidden">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none p-4 font-bold text-[15px]">
                {q}<ChevronDown size={18} className="text-gray-400 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-4 -mt-1 text-[13px] text-gray-500 leading-relaxed">{a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="max-w-6xl mx-auto px-5 pb-14 sm:pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-navy-soft to-navy text-white p-8 sm:p-14 text-center relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-sky/20 blur-3xl" />
          <div className="relative">
            <Wordmark light className="text-[28px] sm:text-[30px] block mb-6" />
            <h2 className="font-display font-extrabold text-[27px] sm:text-[40px] leading-[1.08] sm:leading-[1.06] max-w-2xl mx-auto">Stop Eating the Gap. Document the Next Job Right.</h2>
            <p className="text-white/70 mt-4 max-w-lg mx-auto">Start with a 3-day free trial. Then $249/mo or $2,000/yr, unlimited jobs and crew, no hardware.</p>
            <button onClick={scrollToSignup} className="mt-7 bg-white text-navy font-bold rounded-xl px-7 py-3.5 active:scale-[0.99] inline-flex items-center gap-2">Start Your Free Trial <ArrowRight size={18} /></button>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-5 py-9 grid sm:grid-cols-2 gap-6 items-center">
          <div>
            <Wordmark className="text-[18px]" />
            <p className="text-[13px] text-gray-400 mt-3 max-w-xs leading-relaxed">Field documentation and claim defense for water, fire, and mold restoration.</p>
          </div>
          <div className="flex flex-wrap sm:justify-end gap-x-6 gap-y-2 text-sm text-gray-500">
            <button onClick={() => scrollToId('how')} className="hover:text-navy">How It Works</button>
            <button onClick={() => scrollToId('defense')} className="hover:text-navy">Claim Defense</button>
            <button onClick={() => scrollToId('compare')} className="hover:text-navy">Compare</button>
            <button onClick={() => scrollToId('pricing')} className="hover:text-navy">Pricing</button>
            <button onClick={() => scrollToId('faq')} className="hover:text-navy">FAQ</button>
            <Link to="/login" className="hover:text-navy">Sign In</Link>
          </div>
        </div>
        <div className="border-t border-gray-100">
          <div className="max-w-6xl mx-auto px-5 py-4 text-[12px] text-gray-400 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>&copy; {new Date().getFullYear()} ScopeBook</span>
            <span>Built With Restoration Crews in the Field.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}