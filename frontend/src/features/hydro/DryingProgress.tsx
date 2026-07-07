import { TrendingDown, TrendingUp, Minus, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Reading {
  id: string; reading_type: string; location_label: string | null;
  temp_f: number | null; rh_pct: number | null; gpp: number | null;
  dew_point: number | null; material_mc: number | null; material: string | null; captured_at: string;
}
interface DryStd { id: string; material: string; goal_value: number | null; }

// The "dry map": turns the raw readings into the analysis carriers pay against —
// grain depression, GPP drying trend, and material MC vs the dry standard goal.
export function DryingProgress({ readings, stds }: { readings: Reading[]; stds: DryStd[] }) {
  const chron = [...readings].sort((a, b) => +new Date(a.captured_at) - +new Date(b.captured_at));
  const byType = (t: string) => chron.filter(r => r.reading_type === t);
  const affected = byType('psychrometric'), exterior = byType('exterior'), dehu = byType('dehu_outlet');
  const mc = chron.filter(r => r.reading_type === 'material_mc' && r.material_mc != null);
  const last = (a: Reading[]) => (a.length ? a[a.length - 1] : null);
  const la = last(affected), le = last(exterior), ld = last(dehu);
  const prevA = affected.length >= 2 ? affected[affected.length - 2] : null;

  const gd = la?.gpp != null && ld?.gpp != null ? +(la.gpp - ld.gpp).toFixed(0) : null;      // grain depression
  const affExt = la?.gpp != null && le?.gpp != null ? +(le.gpp - la.gpp).toFixed(0) : null;   // exterior − interior
  const trend = la?.gpp != null && prevA?.gpp != null ? +(la.gpp - prevA.gpp).toFixed(0) : null;
  const stalled = trend != null && trend >= -1 && affected.length >= 2;
  const rhVal = la?.rh_pct ?? null;

  const goalFor = (m: string | null) => {
    if (!m) return null;
    const s = stds.find(x => (x.material || '').toLowerCase() === m.toLowerCase());
    return s?.goal_value ?? null;
  };
  const locMap: Record<string, Reading[]> = {};
  mc.forEach(r => { const k = (r.location_label || 'Point') + ' | ' + (r.material || ''); (locMap[k] ??= []).push(r); });
  const locs = Object.values(locMap).map(rs => {
    const l = rs[rs.length - 1]; const goal = goalFor(l.material);
    const atGoal = goal != null && l.material_mc != null ? l.material_mc <= goal : null;
    return { label: l.location_label || 'Point', material: l.material, val: l.material_mc, goal, atGoal, series: rs.map(r => r.material_mc as number) };
  });
  const withGoal = locs.filter(l => l.atGoal !== null);
  const atGoalCount = withGoal.filter(l => l.atGoal).length;
  const allDry = withGoal.length > 0 && atGoalCount === withGoal.length;

  if (!chron.length) return null;

  // --- GPP trend chart ---
  const series = [
    { name: 'Affected', color: '#1483C2', pts: affected },
    { name: 'Exterior', color: '#94A3B8', pts: exterior },
    { name: 'Dehu out', color: '#11B5C6', pts: dehu }
  ].filter(s => s.pts.some(r => r.gpp != null));
  const allG = series.flatMap(s => s.pts.map(r => r.gpp).filter((v): v is number => v != null));
  const times = chron.map(r => +new Date(r.captured_at));
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const gMin = allG.length ? Math.min(...allG) : 0, gMax = allG.length ? Math.max(...allG) : 100;
  const W = 320, H = 130, PL = 30, PB = 18, PT = 8;
  const xs = (t: number) => t1 === t0 ? PL + (W - PL) / 2 : PL + ((t - t0) / (t1 - t0)) * (W - PL - 6);
  const ys = (g: number) => { const lo = gMin - 5, hi = gMax + 5; return PT + (1 - (g - lo) / (hi - lo || 1)) * (H - PT - PB); };

  const StatChip = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
    <div className={`rounded-xl p-2.5 ${tone}`}>
      <div className="text-[10px] font-semibold opacity-70">{label}</div>
      <div className="text-[15px] font-bold leading-tight mt-0.5">{value}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Completion / status banner */}
      {withGoal.length > 0 && (
        <div className={`rounded-2xl p-3.5 flex items-center gap-3 ${allDry ? 'bg-green-50' : 'bg-amber-50'}`}>
          {allDry ? <CheckCircle2 className="text-green-600" size={22} /> : <AlertTriangle className="text-amber-500" size={22} />}
          <div className="flex-1">
            <div className={`font-bold text-sm ${allDry ? 'text-green-700' : 'text-amber-700'}`}>
              {allDry ? 'All monitored points at dry goal' : `${atGoalCount} of ${withGoal.length} points at goal`}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">{allDry ? 'Confirm the goal holds across consecutive readings before pulling equipment.' : 'Keep drying and monitoring the points still above goal.'}</div>
          </div>
        </div>
      )}

      {/* Psychrometric status */}
      <div className="card">
        <div className="text-sm font-bold mb-2 flex items-center gap-1.5">
          Drying status
          {stalled && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1"><AlertTriangle size={11} /> Stalled</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatChip label="Affected GPP" value={la?.gpp != null ? `${la.gpp}` : '—'} tone="bg-sky-soft text-sky-deep" />
          <div className="rounded-xl p-2.5 bg-gray-50">
            <div className="text-[10px] font-semibold text-gray-400">Trend vs last</div>
            <div className="text-[15px] font-bold leading-tight mt-0.5 flex items-center gap-1 text-gray-700">
              {trend == null ? '—' : trend < 0 ? <><TrendingDown size={15} className="text-green-600" /> {trend} GPP</> : trend > 0 ? <><TrendingUp size={15} className="text-red-500" /> +{trend}</> : <><Minus size={15} /> flat</>}
            </div>
          </div>
          {gd != null && <StatChip label="Grain depression (dehu)" value={`${gd} GPP`} tone={gd >= 5 ? 'bg-aqua-soft text-aqua-deep' : 'bg-amber-100 text-amber-700'} />}
          {rhVal != null && <StatChip label="Affected RH" value={`${rhVal}%`} tone={rhVal <= 40 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'} />}
          {affExt != null && <StatChip label="Drier than exterior by" value={`${affExt} GPP`} tone={affExt >= 0 ? 'bg-gray-50 text-gray-600' : 'bg-amber-100 text-amber-700'} />}
        </div>
        {stalled && <p className="text-[11px] text-red-600 mt-2">GPP is not dropping. Check for air infiltration, add dehumidification, or find undiscovered moisture.</p>}
      </div>

      {/* GPP trend chart */}
      {series.length > 0 && allG.length >= 2 && (
        <div className="card">
          <div className="text-sm font-bold mb-1">Drying curve (GPP over time)</div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="mt-1">
            {[gMin, (gMin + gMax) / 2, gMax].map((g, i) => (
              <g key={i}>
                <line x1={PL} y1={ys(g)} x2={W} y2={ys(g)} stroke="#EEF2F7" strokeWidth={1} />
                <text x={PL - 4} y={ys(g) + 3} textAnchor="end" fontSize={8} fill="#9AA5B1">{Math.round(g)}</text>
              </g>
            ))}
            {series.map(s => {
              const pts = s.pts.filter(r => r.gpp != null).map(r => `${xs(+new Date(r.captured_at))},${ys(r.gpp as number)}`).join(' ');
              return <g key={s.name}>
                <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
                {s.pts.filter(r => r.gpp != null).map(r => <circle key={r.id} cx={xs(+new Date(r.captured_at))} cy={ys(r.gpp as number)} r={2.5} fill={s.color} />)}
              </g>;
            })}
          </svg>
          <div className="flex gap-3 mt-1 flex-wrap">
            {series.map(s => <span key={s.name} className="text-[11px] font-semibold text-gray-500 flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} /> {s.name}</span>)}
          </div>
        </div>
      )}

      {/* Material MC vs goal */}
      {locs.length > 0 && (
        <div className="card">
          <div className="text-sm font-bold mb-2">Material moisture vs dry goal</div>
          <div className="space-y-2">
            {locs.map((l, i) => {
              const spark = l.series;
              const smin = Math.min(...spark), smax = Math.max(...spark);
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{l.label}{l.material ? ` · ${l.material}` : ''}</div>
                    <div className="text-[11px] text-gray-400">latest {l.val}{l.goal != null ? ` · goal ${l.goal}` : ''}</div>
                  </div>
                  {spark.length >= 2 && (
                    <svg width={54} height={20} className="shrink-0">
                      <polyline points={spark.map((v, j) => `${(j / (spark.length - 1)) * 52 + 1},${19 - ((v - smin) / (smax - smin || 1)) * 18}`).join(' ')} fill="none" stroke="#1483C2" strokeWidth={1.5} />
                    </svg>
                  )}
                  {l.atGoal != null && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${l.atGoal ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{l.atGoal ? 'At goal' : 'Above'}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}