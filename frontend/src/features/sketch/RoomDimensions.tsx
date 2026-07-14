import { useState } from 'react';
import { Ruler, ChevronDown, TriangleAlert, Pencil } from 'lucide-react';
import { formatFeetInches } from '../../lib/feetInches';
import { roomDimensions, OPENING_LABEL, type Scene } from './sketchModel';

// The wall / square-foot panel. This is the thing that was missing: the engine could
// compute all of it, and nothing in the app ever showed it.
//
// It SHOWS ITS WORK on purpose. An adjuster will ask how you got 356 SF of wall, and
// "the app said so" is not an answer. Gross area, every opening deducted by name, net.
// Same arithmetic a human would do on paper, which is exactly what survives a scrub.
export function RoomDimensions({ scene, ceilingHeightFt, onEditCeiling }: {
  scene: Scene;
  ceilingHeightFt?: number | null;
  onEditCeiling?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const d = roomDimensions(scene, ceilingHeightFt);

  if (!d.F) {
    return (
      <div className="card flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center shrink-0"><Ruler size={16} /></div>
        <div className="text-[12px] text-gray-500 leading-relaxed">
          Draw the room and its measurements appear here: floor, ceiling, wall area with the doors and windows taken out, and how much baseboard it needs.
        </div>
      </div>
    );
  }

  const Row = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-[12px] text-gray-500">{label}</span>
      <span className="text-right">
        <span className="text-[14px] font-bold text-navy tabular-nums">{value}</span>
        {sub && <span className="block text-[10px] text-gray-400">{sub}</span>}
      </span>
    </div>
  );

  return (
    <div className="card !p-0 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 p-3.5 text-left active:bg-gray-50 transition">
        <div className="w-9 h-9 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0"><Ruler size={17} /></div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[14px] text-navy">Measurements</div>
          <div className="text-[11px] text-gray-400 leading-snug tabular-nums">
            Floor {d.F} sq ft &middot; Walls {d.W} sq ft &middot; Baseboard {d.baseboardLF} ft
          </div>
        </div>
        <ChevronDown size={17} className={`text-gray-300 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-2">
          {/* ceiling height: nothing below can be computed without it */}
          <button onClick={onEditCeiling} disabled={!onEditCeiling}
            className={`w-full flex items-center justify-between py-2 ${onEditCeiling ? 'active:bg-gray-50' : ''}`}>
            <span className="text-[12px] text-gray-500">Ceiling height</span>
            <span className="flex items-center gap-1.5">
              <span className={`text-[14px] font-bold tabular-nums ${d.assumedCeiling ? 'text-amber-700' : 'text-navy'}`}>
                {formatFeetInches(d.SH)}
              </span>
              {d.assumedCeiling && <span className="chip bg-amber-100 text-amber-700">assumed</span>}
              {onEditCeiling && <Pencil size={13} className="text-gray-300" />}
            </span>
          </button>

          <div className="h-px bg-gray-100 my-1" />

          <Row label="Floor area" value={`${d.F} sq ft`} sub={`${d.SY} sq yards`} />
          <Row label="Ceiling area" value={`${d.C} sq ft`} sub="flat ceiling" />
          <Row label="Perimeter" value={`${d.PF} ft`} sub="all the way around" />

          {/* THE WALL MATH, shown step by step. This is the number that pays for paint
              and drywall, so it has to be defensible line by line, not a black box. */}
          <div className="mt-2 bg-sky-soft/50 rounded-xl p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-sky-deep mb-1.5">Wall area</div>
            <div className="flex items-baseline justify-between py-0.5">
              <span className="text-[12px] text-sky-deep/80">{d.PF} ft around &times; {formatFeetInches(d.SH)} high</span>
              <span className="text-[13px] font-semibold text-sky-deep tabular-nums">{d.grossWallSF} sq ft</span>
            </div>
            {d.openings.map(o => (
              <div key={o.id} className="flex items-baseline justify-between py-0.5">
                <span className="text-[12px] text-sky-deep/70">
                  less {OPENING_LABEL[o.kind].toLowerCase()} {formatFeetInches(o.widthFt)} &times; {formatFeetInches(o.heightFt)}
                  {o.assumedHeight && <span className="text-amber-700 font-semibold"> (assumed)</span>}
                </span>
                <span className="text-[13px] font-semibold text-sky-deep/70 tabular-nums">-{o.sqft} sq ft</span>
              </div>
            ))}
            <div className="h-px bg-sky-deep/15 my-1.5" />
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-bold text-sky-deep">Wall area to bill</span>
              <span className="text-[16px] font-extrabold text-sky-deep tabular-nums">{d.W} sq ft</span>
            </div>
          </div>

          <div className="mt-1">
            <Row label="Walls and ceiling" value={`${d.WC} sq ft`} sub="what drywall and paint bill" />
            <Row label="Baseboard" value={`${d.baseboardLF} ft`} sub="doorways taken out, windows left in" />
          </div>

          {d.warnings.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {d.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  <TriangleAlert size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <span className="text-[11.5px] text-amber-800 leading-relaxed">{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* the estimator's shorthand, kept quiet at the bottom for whoever needs it */}
          <p className="text-[10px] text-gray-400 leading-relaxed mt-2.5">
            Xactimate calls these F (floor), C (ceiling), W (wall), WC (walls and ceiling), PF (perimeter). Estimators say "SF" for square feet and "LF" for linear feet, which is just feet measured in a line, like baseboard.
          </p>
        </div>
      )}
    </div>
  );
}