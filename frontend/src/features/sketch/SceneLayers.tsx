import { EQUIP_META, ptsStr, pointDisplay, smoothClosedPath, polygonCentroid, wallById, openingGeom, type Arrow, type Equip, type EquipType, type MoisturePoint, type Opening, type Poly, type Pt, type Scene } from './sketchModel';

// Pictographic equipment icons (fan / dehumidifier unit / filter), identical to
// the report engine (resto-map-svg.js) so the app and PDF match exactly.
export function EquipIcon({ type }: { type: EquipType }) {
  if (type === 'air_mover') return (
    <g>
      <circle cx={-0.5} cy={1} r={5.6} fill="#fff" />
      <path d="M3 -2.4 L8.6 -6 L10.2 -3.3 L4.6 0.3 Z" fill="#fff" />
      <circle cx={-0.5} cy={1} r={2.15} fill="#29ABE6" />
    </g>
  );
  if (type === 'dehumidifier') return (
    <g>
      <rect x={-7} y={-7} width={14} height={14} rx={3} fill="#fff" />
      <path d="M0 -3.6 C 2.5 -0.4 3.3 1 3.3 2.4 A3.3 3.3 0 1 1 -3.3 2.4 C -3.3 1 -2.5 -0.4 0 -3.6 Z" fill="#11B5C6" />
    </g>
  );
  return (
    <g>
      <rect x={-7} y={-7} width={14} height={14} rx={3} fill="#fff" />
      <g stroke="#64748B" strokeWidth={1.7} strokeLinecap="round">
        <line x1={-4.3} y1={-3} x2={4.3} y2={-3} /><line x1={-4.3} y1={0} x2={4.3} y2={0} /><line x1={-4.3} y1={3} x2={4.3} y2={3} />
      </g>
    </g>
  );
}

function EquipGlyph({ eq, selected }: { eq: Equip; selected?: boolean }) {
  const m = EQUIP_META[eq.type];
  return (
    <g transform={`translate(${eq.x},${eq.y})`}>
      <circle r={26} fill={m.fill} stroke={selected ? '#0E2A4D' : m.ring} strokeWidth={selected ? 6 : 3} />
      <g transform="scale(2)"><EquipIcon type={eq.type} /></g>
    </g>
  );
}

// Double-line mitered wall band (no fill — the floor fill is a separate layer
// drawn beneath the wet areas). Matches resto-map-svg.js at 2x scene scale.
const WALL_W = 18, WALL_LW = 3.2;
function WallBand({ w }: { w: Poly }) {
  const c = polygonCentroid(w.points);
  const pts = ptsStr(w.points);
  return (
    <g>
      <polygon points={pts} fill="none" stroke="#0E2A4D" strokeWidth={WALL_W} strokeLinejoin="miter" strokeMiterlimit={8} />
      <polygon points={pts} fill="none" stroke="#ffffff" strokeWidth={WALL_W - 2 * WALL_LW} strokeLinejoin="miter" strokeMiterlimit={8} />
      {w.material && (
        <text x={c[0]} y={c[1] + 8} textAnchor="middle" fontSize={22} fontWeight={700} fill="#64748b">{w.material}</text>
      )}
    </g>
  );
}

function ArrowGlyph({ a, selected }: { a: Arrow; selected?: boolean }) {
  const [x1, y1] = a.from, [x2, y2] = a.to;
  const ang = Math.atan2(y2 - y1, x2 - x1), hl = 34, hw = 15;
  const bx = x2 - hl * Math.cos(ang), by = y2 - hl * Math.sin(ang);
  const c = selected ? '#0E2A4D' : '#4F46E5';
  return (
    <g stroke={c} fill={c}>
      <line x1={x1} y1={y1} x2={bx} y2={by} strokeWidth={selected ? 7 : 5} strokeLinecap="round" />
      <polygon stroke="none" points={`${x2},${y2} ${bx - hw * Math.sin(ang)},${by + hw * Math.cos(ang)} ${bx + hw * Math.sin(ang)},${by - hw * Math.cos(ang)}`} />
    </g>
  );
}

function PointGlyph({ mp, display, selected }: { mp: MoisturePoint; display: string; selected?: boolean }) {
  return (
    <g transform={`translate(${mp.x},${mp.y})`}>
      <path d="M0 14 C 0 14 22 -10 22 -28 a22 22 0 1 0 -44 0 C -22 -10 0 14 0 14 Z"
            fill="#F26B3A" stroke={selected ? '#0E2A4D' : '#D8501F'} strokeWidth={selected ? 5 : 2.5} />
      <circle cx={0} cy={-28} r={15} fill="#fff" />
      <text x={0} y={-28} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={800} fill="#D8501F">
        {(display || '-').slice(0, 4)}
      </text>
    </g>
  );
}

function OpeningGlyph({ scene, op, selected }: { scene: Scene; op: Opening; selected?: boolean }) {
  const w = wallById(scene, op.wallId); if (!w) return null;
  const { A, B, dir, nrm, center, gapLen } = openingGeom(w, op);
  const h = WALL_W / 2 + 1.5;
  const off = (P: Pt, s: number): Pt => [P[0] + nrm[0] * s, P[1] + nrm[1] * s];
  const inner = off(A, h), innerB = off(B, h), outer = off(A, -h), outerB = off(B, -h);
  const jA1 = off(A, -WALL_W / 2), jA2 = off(A, WALL_W / 2);
  const jB1 = off(B, -WALL_W / 2), jB2 = off(B, WALL_W / 2);
  const openEnd: Pt = [A[0] + nrm[0] * gapLen, A[1] + nrm[1] * gapLen];
  const sweep = (dir[0] * nrm[1] - dir[1] * nrm[0]) > 0 ? 1 : 0;
  return (
    <g>
      {/* knock the wall out of the gap: floor continues inside, white outside */}
      <polygon points={`${A[0]},${A[1]} ${B[0]},${B[1]} ${innerB[0]},${innerB[1]} ${inner[0]},${inner[1]}`} fill="#f4f7fb" />
      <polygon points={`${A[0]},${A[1]} ${B[0]},${B[1]} ${outerB[0]},${outerB[1]} ${outer[0]},${outer[1]}`} fill="#ffffff" />
      <line x1={jA1[0]} y1={jA1[1]} x2={jA2[0]} y2={jA2[1]} stroke="#0E2A4D" strokeWidth={WALL_LW} strokeLinecap="round" />
      <line x1={jB1[0]} y1={jB1[1]} x2={jB2[0]} y2={jB2[1]} stroke="#0E2A4D" strokeWidth={WALL_LW} strokeLinecap="round" />
      {op.kind === 'door' && (
        <>
          <path d={`M ${B[0]} ${B[1]} A ${gapLen} ${gapLen} 0 0 ${sweep} ${openEnd[0]} ${openEnd[1]}`} fill="none" stroke="#94a3b8" strokeWidth={2.5} />
          <line x1={A[0]} y1={A[1]} x2={openEnd[0]} y2={openEnd[1]} stroke="#0E2A4D" strokeWidth={3} strokeLinecap="round" />
        </>
      )}
      {op.kind === 'window' && <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="#0E2A4D" strokeWidth={2.5} />}
      {selected && <circle cx={center[0]} cy={center[1]} r={13} fill="none" stroke="#0E2A4D" strokeWidth={2.5} />}
    </g>
  );
}

// Shared read-only renderer. `activeDate` selects which visit's value each pin
// shows; omit it (thumbnails / report) to show the latest known reading.
export function SceneLayers({ scene, currentWall, selectedId, activeDate }:
  { scene: Scene; currentWall?: Pt[]; selectedId?: string | null; activeDate?: string }) {
  return (
    <g>
      {/* floor fills sit beneath the wet areas so the walls read correctly on top */}
      {scene.walls.map(p => (
        <polygon key={'floor-' + p.id} points={ptsStr(p.points)} fill="#f4f7fb" />
      ))}
      {scene.wetAreas.map(p => (
        <path key={p.id} d={smoothClosedPath(p.points)} fill="#7DD3FC" fillOpacity={0.5} stroke="#0284c7" strokeWidth={3} strokeLinejoin="round" />
      ))}
      {scene.walls.map(p => <WallBand key={p.id} w={p} />)}
      {(scene.openings ?? []).map(op => <OpeningGlyph key={op.id} scene={scene} op={op} selected={op.id === selectedId} />)}
      {(scene.arrows ?? []).map(a => <ArrowGlyph key={a.id} a={a} selected={a.id === selectedId} />)}
      {currentWall && currentWall.length > 0 && (
        <>
          <polyline points={ptsStr(currentWall)} fill="none" stroke="#1483C2" strokeWidth={5} strokeDasharray="14 9" strokeLinejoin="round" />
          {currentWall.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 ? 9 : 6} fill={i === 0 ? '#1483C2' : '#fff'} stroke="#1483C2" strokeWidth={3} />
          ))}
        </>
      )}
      {(scene.moisturePoints ?? []).map(mp => (
        <PointGlyph key={mp.id} mp={mp} display={pointDisplay(mp, activeDate)} selected={mp.id === selectedId} />
      ))}
      {scene.equipment.map(eq => <EquipGlyph key={eq.id} eq={eq} selected={eq.id === selectedId} />)}
    </g>
  );
}