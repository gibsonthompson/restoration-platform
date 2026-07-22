import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, X, ChevronDown, MailCheck, Image as ImageIcon, Smartphone, Monitor } from 'lucide-react';
import { supabase } from '../lib/supabase';

/*
  RestoMate marketing / landing page.

  Design intent (deliberately NOT the templated SaaS look):
   - Image-forward and editorial. Real in-context photos of crews using the app
     and real UI screenshots carry the page. Icons are almost absent on purpose.
   - Asymmetric split hero with a photo, not a dashboard floating on a gradient.
   - Copy leads with the OUTCOME (get paid the full invoice) in restoration
     vernacular (the scrub, GPP, S500, equipment-days, Cat/Class), not generic
     benefit lines.
   - The three-phase story is a real sequence, so it is numbered 01/02/03.

  Every image is a <Shot/>: it renders a labeled, on-brand placeholder now and
  becomes a real image the moment you pass `src`. The placeholder text names the
  exact asset to drop in. Photos are AI-generated crew-in-the-field shots; the
  `ui` ones are real screenshots of the app. Filenames are noted on each frame.

  Design system is unchanged from the app: Bricolage Grotesque display, navy
  #0F2440 / sky-deep #2563EB, the `card` treatment. Signup logic is untouched.
*/

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
          <div className="font-bold text-[15px]">Confirm your email</div>
          <p className="text-[13px] text-gray-500 mt-1">We sent a link to <span className="font-semibold text-navy">{sentTo}</span>. Click it to finish setting up your workspace.</p>
          <Link to="/login" className="inline-block text-sky-deep font-semibold text-sm mt-3">Go to sign in</Link>
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
            {busy ? 'Creating your workspace...' : <>Start your first claim free <ArrowRight size={18} /></>}
          </button>
          <p className="text-[11px] text-gray-400 mt-2.5 text-center">No credit card. No hardware. No per-project fees.</p>
        </>
      )}
    </div>
  );

  const nav_links: [string, string][] = [['How it works', 'how'], ['Claim Defense', 'defense'], ['Xactimate', 'xactimate'], ['Compare', 'compare'], ['FAQ', 'faq']];

  return (
    <div className="h-[100dvh] overflow-y-auto bg-white text-navy">
      {/* nav */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/welcome" className="flex items-center"><img src="/restomate-logo.svg" alt="RestoMate" className="h-7 w-auto" /></Link>
          <nav className="hidden md:flex items-center gap-6 text-[13px] font-semibold text-gray-500">
            {nav_links.map(([l, id]) => <button key={id} onClick={() => scrollToId(id)} className="hover:text-navy transition">{l}</button>)}
          </nav>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/login" className="font-semibold text-gray-500 hover:text-navy">Sign in</Link>
            <button onClick={scrollToSignup} className="hidden sm:inline-flex bg-navy text-white font-semibold rounded-lg px-4 py-2 hover:bg-navy-soft transition">Start free</button>
          </div>
        </div>
      </header>

      {/* HERO: asymmetric split, photo-led */}
      <section className="max-w-6xl mx-auto px-5 pt-12 pb-14 grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-8 items-center">
        <div>
          <Eyebrow>Water &middot; Fire &middot; Mold field documentation</Eyebrow>
          <h1 className="font-display font-extrabold text-[40px] sm:text-[52px] leading-[1.02] tracking-tight">
            Leave the job with the claim <span className="text-sky-deep">already built.</span>
          </h1>
          <p className="text-[17px] text-gray-500 mt-5 leading-relaxed max-w-lg">
            RestoMate turns what your crew documents on-site into a carrier-ready package that survives the adjuster&rsquo;s scrub, so you collect the full invoice instead of arguing for it.
          </p>
          <div id="signup" className="mt-7 max-w-xl scroll-mt-20">{signupCard}</div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-4 text-[12px] font-semibold text-gray-400">
            <span>Already have an account? <Link to="/login" className="text-sky-deep">Sign in</Link></span>
          </div>
        </div>

        {/* photo with an overlapping real UI card: context + product in one frame */}
        <div className="relative">
          <Shot kind="photo" className="aspect-[4/5]"
            label="Photo: restoration tech using RestoMate on a tablet in a gutted, drying room"
            file="/site/hero.jpg" />
          <div className="absolute -bottom-5 -left-4 sm:-left-8 w-40 sm:w-48">
            <Shot kind="phone" label="Claim Readiness score" file="/site/ui-claim-readiness.png" />
          </div>
          <div className="hidden sm:flex absolute -top-3 -right-3 items-center gap-2 bg-white rounded-full shadow-soft px-3.5 py-2 text-[12px] font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Carrier-ready, 94/100
          </div>
        </div>
      </section>

      {/* honest credibility bar (no fabricated logos) */}
      <section className="border-y border-gray-100 bg-navy text-white/80">
        <div className="max-w-6xl mx-auto px-5 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-1.5 text-[13px] font-semibold">
          <span>Built around IICRC S500 drying</span><span className="text-white/25">/</span>
          <span>Works offline in the field</span><span className="text-white/25">/</span>
          <span>No 360 camera to buy</span><span className="text-white/25">/</span>
          <span>Unlimited jobs &amp; crew</span>
        </div>
      </section>

      {/* THE STORY: real 3-phase sequence, numbered, alternating image sides */}
      <section id="how" className="max-w-6xl mx-auto px-5 py-16 scroll-mt-16">
        <div className="max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="font-display font-extrabold text-[30px] sm:text-[38px] leading-[1.05]">One job. One app. From the wet basement to the wire transfer.</h2>
        </div>

        {/* 01 capture */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center mt-14">
          <div>
            <Eyebrow n="01">On-site</Eyebrow>
            <h3 className="font-display font-bold text-[24px] sm:text-[28px] leading-tight">Capture the loss while you&rsquo;re standing in it.</h3>
            <p className="text-gray-500 mt-3 leading-relaxed">
              Moisture maps, flood cuts, containment, equipment placement, GPS and time-stamped photos, contents, and signatures, all on the phone the crew already carries. In a dead basement with no signal it keeps working and syncs when you surface.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-[12px] font-semibold text-navy">
              {['Moisture map', 'GPS photo proof', 'Contents inventory', 'E-signatures'].map((t) => (
                <span key={t} className="bg-sky-soft rounded-full px-3 py-1.5">{t}</span>
              ))}
            </div>
          </div>
          <div className="relative">
            <Shot kind="tablet" label="Moisture map & room sketch" file="/site/ui-moisture-map.png" />
            <div className="absolute -bottom-6 -right-3 w-40 hidden sm:block">
              <Shot kind="photo" className="aspect-[3/4]" label="Photo: hands holding phone, moisture meter on wet drywall" file="/site/capture.jpg" />
            </div>
          </div>
        </div>

        {/* 03 handoff (02 gets its own spotlight section below) */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center mt-24">
          <div className="order-2 lg:order-1 relative">
            <Shot kind="browser" label="Carrier-ready report & share link" file="/site/ui-report.png" />
            <div className="absolute -bottom-6 -left-3 w-40 hidden sm:block">
              <Shot kind="photo" className="aspect-[4/3]" label="Photo: owner reviewing the report on a laptop" file="/site/handoff.jpg" />
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <Eyebrow n="03">Handoff</Eyebrow>
            <h3 className="font-display font-bold text-[24px] sm:text-[28px] leading-tight">Hand the adjuster a package, not a shoebox.</h3>
            <p className="text-gray-500 mt-3 leading-relaxed">
              A branded report and a full daily drying log, sent as one clean link or PDF. Every reading, photo, and signature is where the carrier expects it, so the file gets approved instead of kicked back for more documentation.
            </p>
          </div>
        </div>
      </section>

      {/* 02 CLAIM DEFENSE: the signature. Boldest treatment, dark, product-forward. */}
      <section id="defense" className="bg-navy text-white scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5 py-16 grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
          <div>
            <Eyebrow n="02"><span className="text-white/50">Before you submit</span></Eyebrow>
            <h2 className="font-display font-extrabold text-[30px] sm:text-[40px] leading-[1.03]">The adjuster&rsquo;s scrub, run on <span className="text-aqua">your</span> side first.</h2>
            <p className="text-white/70 mt-4 leading-relaxed max-w-md">
              Claim Defense scores every job against the same audit-by-exception checks carriers use, then tells you exactly what to fix: missing daily readings, unsigned authorizations, thin monitoring, equipment-days the S500 calc won&rsquo;t back. You close the gaps before you send, so nothing gets cut after.
            </p>
            <ul className="mt-6 space-y-3 max-w-md">
              {[
                ['Predicts the cut lines', 'Flags the exact items carriers challenge, ranked by what costs you most.'],
                ['Defends the invoice', 'Ties equipment-days and drying time back to the readings that justify them.'],
                ['Nothing auto-submits', 'It scores and warns. You review and send. Always.']
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <Check size={20} className="text-aqua mt-0.5 shrink-0" />
                  <span><span className="font-bold">{t}.</span> <span className="text-white/60">{d}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-[270px]">
            <Shot kind="phone" label="Claim Readiness audit, full screen" file="/site/ui-claim-readiness-full.png" />
          </div>
        </div>
      </section>

      {/* Drying & S500 editorial */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div>
            <Eyebrow>Drying &amp; S500</Eyebrow>
            <h2 className="font-display font-extrabold text-[28px] sm:text-[34px] leading-tight">A drying log that fills itself in and holds up.</h2>
            <p className="text-gray-500 mt-3 leading-relaxed">
              Set the chambers, drop your air movers and dehus, and log readings. RestoMate does the psychrometrics, tracks GPP toward the dry standard, and builds the daily log automatically, so the monitoring story is complete without a clipboard.
            </p>
          </div>
          <div className="relative">
            <Shot kind="tablet" label="Daily drying log with GPP chart" file="/site/ui-drying-log.png" />
            <div className="absolute -top-6 -right-3 w-36 hidden sm:block">
              <Shot kind="photo" className="aspect-[3/4]" label="Photo: tech logging readings by a dehumidifier in containment" file="/site/drying.jpg" />
            </div>
          </div>
        </div>
      </section>

      {/* Xactimate handoff */}
      <section id="xactimate" className="bg-gradient-to-b from-sky-soft/40 to-white scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5 py-16 grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className="order-2 lg:order-1"><Shot kind="browser" label="Xactimate sketch underlay (scaled, to trace)" file="/site/ui-underlay.png" /></div>
          <div className="order-1 lg:order-2">
            <Eyebrow>Xactimate handoff</Eyebrow>
            <h2 className="font-display font-extrabold text-[28px] sm:text-[34px] leading-tight">Feed Xactimate without re-drawing the job.</h2>
            <p className="text-gray-500 mt-3 leading-relaxed">
              Export each level as a to-scale underlay with a calibration line, plus a room-by-room entry sheet of scope and quantities. Your estimator traces real measurements and keys real numbers, instead of starting over on a blank grid.
            </p>
            <div className="mt-5 grid sm:grid-cols-2 gap-3 text-[13px]">
              <div className="card !p-3.5"><div className="font-bold">Scaled underlay</div><div className="text-gray-500 mt-0.5">Trace the rooms right over it.</div></div>
              <div className="card !p-3.5"><div className="font-bold">Entry sheet</div><div className="text-gray-500 mt-0.5">Key the scope, miss nothing.</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* full-bleed crew photo band with positioning line (not a fake testimonial) */}
      <section className="relative">
        <Shot kind="photo" className="!rounded-none aspect-[16/7]" label="Photo: two-person restoration crew loading air movers from a branded van at dawn" file="/site/crew.jpg" />
        <div className="absolute inset-0 bg-navy/55 flex items-center">
          <div className="max-w-6xl mx-auto px-5 w-full">
            <p className="font-display font-extrabold text-white text-[26px] sm:text-[36px] leading-tight max-w-2xl">
              You did the work. RestoMate makes sure the paperwork proves it.
            </p>
          </div>
        </div>
      </section>

      {/* bento: everything else, mixing a photo tile with tight text tiles (no icon grid) */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="max-w-2xl mb-9">
          <Eyebrow>All in one app</Eyebrow>
          <h2 className="font-display font-extrabold text-[28px] sm:text-[34px] leading-tight">Everything the loss needs, nothing the office has to chase.</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:row-span-2 card !p-0 overflow-hidden">
            <Shot kind="photo" className="!rounded-none h-full min-h-[240px]" label="Photo: tech capturing a room on a phone" file="/site/capture-2.jpg" />
          </div>
          {[
            ['Contents inventory', 'Salvageable-vs-loss lists with photos, grouped by room.'],
            ['GPS photo proof', 'Every shot stamped with time and location.'],
            ['Floor plan sketch', 'Draw each room to scale, snap the level together.'],
            ['Offline capture', 'Document in a dead basement; it syncs later.'],
            ['E-signatures', 'Authorizations and completion certs signed on-site.'],
            ['Branded reports', 'Your logo on the package the carrier reads.']
          ].map(([t, d]) => (
            <div key={t} className="card !p-4">
              <div className="font-bold text-[14px]">{t}</div>
              <div className="text-[12px] text-gray-500 mt-1 leading-snug">{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* comparison */}
      <section id="compare" className="max-w-6xl mx-auto px-5 py-16 scroll-mt-16">
        <div className="max-w-2xl mb-9">
          <Eyebrow>Why crews switch</Eyebrow>
          <h2 className="font-display font-extrabold text-[28px] sm:text-[34px] leading-tight">Most tools do one slice and bill you for it.</h2>
          <p className="text-gray-500 mt-2">RestoMate does the whole loss on a flat plan, so the field, the drying, and the claim defense live in one place.</p>
        </div>
        <div className="card !p-0 overflow-hidden">
          <div className="grid grid-cols-3 text-[13px]">
            <div className="p-4 font-bold text-gray-400 uppercase tracking-wide text-[11px]">What you get</div>
            <div className="p-4 font-bold text-center bg-sky-soft text-sky-deep">RestoMate</div>
            <div className="p-4 font-bold text-center text-gray-400">The usual setup</div>
            {[
              'Field capture, drying, contents & reports in one app',
              'Pre-submission Claim Readiness audit',
              'Flat price, unlimited jobs and crew',
              'No 360 camera or hardware to buy',
              'No per-project or per-sketch fees',
              'Works offline on any phone or tablet',
              'Xactimate underlay and entry sheet'
            ].map((label, i) => (
              <div key={i} className="contents">
                <div className="p-4 border-t border-gray-100 text-gray-600">{label}</div>
                <div className="p-4 border-t border-gray-100 flex justify-center bg-sky-soft/40"><Check size={18} className="text-emerald-500" /></div>
                <div className="p-4 border-t border-gray-100 flex justify-center"><X size={18} className="text-gray-300" /></div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[12px] text-gray-400 mt-3 max-w-2xl">
          &ldquo;The usual setup&rdquo; means stitching Encircle for documentation, DocuSketch for sketches (a camera to buy and per-sketch fees), and magicplan billed per project, then reconciling drying and audit by hand.
        </p>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-5 py-16 scroll-mt-16">
        <div className="mb-8"><Eyebrow>Straight answers</Eyebrow><h2 className="font-display font-extrabold text-[28px] sm:text-[34px]">Questions crews ask.</h2></div>
        <div className="space-y-3">
          {[
            ['Do I need a 360 camera or any hardware?', 'No. RestoMate runs on the phone or tablet the crew already carries. Nothing to buy, nothing to charge overnight.'],
            ['Does it work offline in the field?', 'Yes. Document a job with no signal and it syncs automatically once you are back online.'],
            ['Does it work with Xactimate?', 'Yes. Export a to-scale underlay to trace in Xactimate plus a room-by-room entry sheet of scope and quantities to key in.'],
            ['Are there per-project or per-sketch fees?', 'No. One flat price, unlimited claims and unlimited crew. No overages, no rush charges, no per-sketch billing.'],
            ['Is the report actually carrier-ready?', 'Yes. A branded report and daily drying log, shared by clean link or PDF, built to hold up line by line under the scrub.'],
            ['What losses is it built for?', 'Water, fire, and mold, from the first photo on-site through the carrier-ready package.']
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
      <section className="max-w-6xl mx-auto px-5 pb-16">
        <div className="rounded-3xl bg-gradient-to-br from-navy-soft to-navy text-white p-9 sm:p-14 text-center relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-sky/20 blur-3xl" />
          <div className="relative">
            <img src="/restomate-logo-white.svg" alt="RestoMate" className="h-8 w-auto mx-auto mb-6" />
            <h2 className="font-display font-extrabold text-[30px] sm:text-[40px] leading-[1.05] max-w-2xl mx-auto">Document the next job like it&rsquo;s going to get scrubbed.</h2>
            <p className="text-white/70 mt-4 max-w-lg mx-auto">Start your first claim free. No credit card, no hardware, no per-project fees.</p>
            <button onClick={scrollToSignup} className="mt-7 bg-white text-navy font-bold rounded-xl px-7 py-3.5 active:scale-[0.99] inline-flex items-center gap-2">Start free <ArrowRight size={18} /></button>
          </div>
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
            <button onClick={() => scrollToId('defense')} className="hover:text-navy">Claim Defense</button>
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