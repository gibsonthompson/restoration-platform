import { WET_SURFACES, MATERIALS_BY_SURFACE, roomDimensions, wetSqFt, type Scene, type Poly } from './sketchModel';

// Standalone wet-area editor sheet. A separate module so it can never collide with an
// older inlined version of this modal in a stale bundle chunk. Opened both right after a
// wet area is painted AND when a finished wet area is tapped in Move mode, so a stroke is
// always editable after the fact.
export function WetAreaSheet(
  { scene, wa, ceilingFt, onPatch, onDelete, onClose }:
  { scene: Scene; wa: Poly; ceilingFt: number | null; onPatch: (patch: Partial<Poly>) => void; onDelete: () => void; onClose: () => void }
) {
  const surface = wa.surface ?? 'floor';
  const dims = roomDimensions(scene, ceilingFt);
  const surfaceMax = surface === 'floor' ? dims.F : surface === 'ceiling' ? dims.C : dims.grossWallSF;
  const cap = surfaceMax > 0 ? Math.round(surfaceMax * 100) / 100 : Infinity;
  const drawn = surface === 'floor' ? wetSqFt({ ...wa, sqft: undefined }) : 0;
  // Never surface a number bigger than the surface itself. A brush ribbon can cover more
  // than the floor it sits on, and a stored value can outlive the room being shrunk, so the
  // DISPLAYED value is always capped, whatever its source. Billing is capped the same way in
  // the report, so what the tech sees here is what goes on the estimate.
  const rawSqft = wa.sqft != null ? wa.sqft : (surface === 'floor' && drawn > 0 ? Math.round(drawn) : undefined);
  const shownSqft = rawSqft != null ? Math.min(rawSqft, cap) : undefined;
  const isPrefill = wa.sqft == null && surface === 'floor' && drawn > 0;
  const drawnOverflowed = isPrefill && drawn > cap + 0.5;

  const setSqft = (raw: string) => {
    const n = parseFloat(raw);
    if (raw.trim() === '' || isNaN(n) || n <= 0) { onPatch({ sqft: undefined }); return; }
    onPatch({ sqft: Math.min(n, cap) });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8vh)' }}>
      <div className="absolute inset-0 bg-navy/30" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
        <div className="font-display font-bold text-lg text-navy">Affected material</div>
        <p className="text-xs text-gray-400 mt-0.5">Tag this wet area for the drying log and estimate.</p>

        {/* AFFECTED AREA, first thing so it can't be missed. Floor pre-fills from the
            drawing; walls and ceiling are typed. Capped at the surface so it only reduces. */}
        <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-4">Affected area (sq ft)</label>
        <div className="flex gap-2 mt-1 items-center">
          <input
            value={shownSqft != null ? String(shownSqft) : ''}
            onChange={e => setSqft(e.target.value)}
            inputMode="decimal"
            placeholder={surface === 'floor' ? 'Confirm the wet floor area' : `How much ${surface} is wet`}
            className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[16px] font-bold focus:outline-none focus:border-sky" />
          <span className="text-xs text-gray-400">sq ft</span>
        </div>
        {surfaceMax > 0 && (
          <p className="text-[10px] text-gray-400 mt-1">{surface[0].toUpperCase() + surface.slice(1)} is {surfaceMax} sq ft. Enter only the wet portion.</p>
        )}
        {drawnOverflowed ? (
          <p className="text-[10px] text-amber-600 mt-1">Your drawing covered the whole {surface}, so this is set to {cap} sq ft. Lower it to the actual wet area.</p>
        ) : isPrefill ? (
          <p className="text-[10px] text-gray-400 mt-1">Pre-filled from your drawing. Change it to the measured wet area.</p>
        ) : null}

        <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-4">Surface</label>
        <div className="flex bg-gray-100 rounded-full p-0.5 mt-1">
          {WET_SURFACES.map(sf => (
            <button key={sf} onClick={() => onPatch({ surface: sf, material: MATERIALS_BY_SURFACE[sf].includes(wa.material ?? '') ? wa.material : undefined })}
              className={`flex-1 py-1.5 rounded-full text-xs font-bold capitalize ${surface === sf ? 'bg-white shadow-sm text-sky' : 'text-gray-500'}`}>{sf}</button>
          ))}
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Material</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {MATERIALS_BY_SURFACE[surface].map(m => (
            <button key={m} onClick={() => onPatch({ material: m })} className={`px-3 py-1.5 rounded-full text-[13px] font-semibold ${wa.material === m ? 'bg-sky text-white' : 'bg-sky-soft text-sky-deep'}`}>{m}</button>
          ))}
        </div>
        <input value={wa.material ?? ''} onChange={e => onPatch({ material: e.target.value })}
          placeholder="Or type a material name" className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-2 text-[16px] focus:outline-none focus:border-sky" />

        {surface === 'floor' && (
          <>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Flooring plan</label>
            <div className="flex bg-gray-100 rounded-full p-0.5 mt-1">
              {([['dry', 'Dry in place'], ['remove', 'Remove / tear out']] as [string, string][]).map(([val, lbl]) => (
                <button key={val} onClick={() => onPatch({ disposition: val as 'dry' | 'remove' })}
                  className={`flex-1 py-1.5 rounded-full text-xs font-bold ${(wa.disposition ?? 'dry') === val ? 'bg-white shadow-sm text-sky' : 'text-gray-500'}`}>{lbl}</button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Dry in place bills water extraction. Remove bills flooring tear-out.</p>
          </>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={onDelete} className="flex-1 border border-red-200 rounded-xl py-3 font-semibold text-red-600 active:bg-red-50">Delete</button>
          <button onClick={onClose} className="btn-primary flex-1 py-3 justify-center">Done</button>
        </div>
      </div>
    </div>
  );
}