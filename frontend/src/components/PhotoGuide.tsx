import { useState } from 'react';
import { Camera, ChevronDown, Crosshair, Ruler, Droplet, Wind, Package, Hammer, CheckCircle2, Info } from 'lucide-react';
import { MIN_PHOTOS_PER_ROOM } from '../lib/claimReadiness';

// What the photos are FOR, in the tech's hands, at the moment they're shooting.
// The governing rule adjusters apply: every line item you bill needs a photo that
// shows it. If the adjuster can't see it, it's hard to justify paying for it.
// So this is not "take pictures of the damage", it's "build the evidence for the
// invoice you're going to send".
//
// Sequence is always WIDE -> MID -> CLOSE, and there are three phases (arrival,
// during demo, completion). Phase 2 is where supplements are won or lost, because
// hidden damage cannot be re-photographed once it's in the dumpster.

// MIN_PHOTOS_PER_ROOM lives in claimReadiness (the scoring engine) so the guidance
// here and the score the adjuster-facing checklist shows can never disagree.

interface Step { icon: any; title: string; body: string; }

const ARRIVAL: Step[] = [
  { icon: Crosshair, title: 'Four corner wide shots, every affected room', body: 'Stand in each corner and shoot toward the opposite corner. Four photos covers the whole room and proves the scope of the area you are billing. This is the shot most crews skip and most adjusters want.' },
  { icon: Camera, title: 'Mid-range, showing where the damage sits', body: 'One step back from the damage, so the adjuster can see which wall and which part of the room it is on. Close-ups with no context get questioned.' },
  { icon: Ruler, title: 'Close-ups, with a tape or probe in frame', body: 'Fill the frame with the damage itself, and put a tape measure, ruler, or your meter in the shot so there is no argument about size or severity.' },
  { icon: Droplet, title: 'The cause of loss, up close', body: 'The failed supply line, the burst pipe, the appliance, the entry point. This is the photo that answers "was this sudden or gradual", which is the single most common reason a water claim gets denied outright.' },
  { icon: Droplet, title: 'Water lines and migration', body: 'The stain line on the drywall or baseboard shows how high the water rose. Photograph where the water traveled, not just where it pooled.' }
];

const DURING: Step[] = [
  { icon: Wind, title: 'Moisture readings, with the number visible', body: 'Photograph the meter against the material with the reading legible, and note where it was taken. A reading with no location is worth little in a dispute.' },
  { icon: Wind, title: 'Equipment in place', body: 'Air movers, dehus, and scrubbers where they actually sit. This backs the equipment-days line, which is the single most scrubbed item on a mitigation invoice.' },
  { icon: Hammer, title: 'Hidden damage, BEFORE it goes in the dumpster', body: 'Wet insulation, saturated subfloor, mold behind the drywall. Once it is hauled off it cannot be re-photographed, and an unsupported supplement gets denied. Shoot the material after removal and before disposal.' },
  { icon: Package, title: 'Contents and total-loss items', body: 'Photograph damaged personal property with make, model, or serial visible where you can. This supports the Coverage C contents claim.' }
];

const COMPLETION: Step[] = [
  { icon: CheckCircle2, title: 'Final readings and dried condition', body: 'Photos showing the area at dry standard close the loop and support the final invoice, proving the equipment came off at the right time and not later.' }
];

function Section({ label, steps }: { label: string; steps: Step[] }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">{label}</div>
      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-sky-soft text-sky-deep flex items-center justify-center shrink-0 mt-0.5">
              <s.icon size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-navy leading-snug">{s.title}</div>
              <div className="text-[12px] text-gray-500 leading-relaxed mt-0.5">{s.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PhotoGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="card !p-0 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 p-4 text-left active:bg-gray-50 transition">
        <div className="w-9 h-9 rounded-xl bg-navy text-white flex items-center justify-center shrink-0">
          <Info size={17} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[14px] text-navy">What these photos are for</div>
          <div className="text-[11px] text-gray-400 leading-snug">Every line item you bill needs a photo behind it.</div>
        </div>
        <ChevronDown size={17} className={`text-gray-300 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5 border-t border-gray-100 pt-4">
          <p className="text-[12px] text-gray-500 leading-relaxed">
            An adjuster pays for damage they can see. If you bill 200 sq ft of carpet tear-out and there is no photo of that carpet, the line gets cut. So shoot the evidence for the invoice, not just the mess. Always go <span className="font-semibold text-navy">wide, then mid, then close</span>, which is why every room needs at least {MIN_PHOTOS_PER_ROOM} photos.
          </p>

          <Section label="On arrival, before you touch anything" steps={ARRIVAL} />
          <Section label="During mitigation and demo" steps={DURING} />
          <Section label="At completion" steps={COMPLETION} />

          <div className="bg-sky-soft/60 rounded-xl p-3">
            <div className="text-[12px] font-bold text-sky-deep">A rule of thumb, not a rule</div>
            <p className="text-[12px] text-sky-deep/80 leading-relaxed mt-0.5">
              Public adjusters often quote 20 to 30 photos per affected room. Treat that as a direction, not a quota. Complete coverage of every room and every billed line beats volume. Photos you did not need are easy to ignore. Evidence you never captured cannot be recreated after the demo.
            </p>
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            DocuMate stamps every photo with the time and, if enabled, GPS, so the carrier can verify when and where it was taken. Photos are grouped by room in the report automatically.
          </p>
        </div>
      )}
    </div>
  );
}