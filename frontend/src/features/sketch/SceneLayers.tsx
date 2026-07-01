import { EQUIP_META, ptsStr, type Equip, type MoisturePoint, type Pt, type Scene } from './sketchModel';

function EquipGlyph({ eq, selected }: { eq: Equip; selected?: boolean }) {
  const m = EQUIP_META[eq.type];
  return (
    <g transform={`translate(${eq.x},${eq.y})`}>
      <circle r={26} fill={m.fill} stroke={selected ? '#0E2A4D' : m.ring} strokeWidth={selected ? 6 : 3} />
      <text textAnchor="middle" dominantBaseline="central" fontSize={20} fontWeight={800} fill="#fff">{m.label}</text>
    </g>
  );
}

function PointGlyph({ mp, selected }: { mp: MoisturePoint; selected?: boolean }) {
  // Teardrop pin with the reading value inside.
  return (
    <g transform={`translate(${mp.x},${mp.y})`}>
      <path d="M0 14 C 0 14 22 -10 22 -28 a22 22 0 1 0 -44 0 C -22 -10 0 14 0 14 Z"
            fill="#F26B3A" stroke={selected ? '#0E2A4D' : '#D8501F'} strokeWidth={selected ? 5 : 2.5} />
      <circle cx={0} cy={-28} r={15} fill="#fff" />
      <text x={0} y={-28} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={800} fill="#D8501F">
        {(mp.label || '').slice(0, 4)}
      </text>
    </g>
  );
}

// Shared read-only renderer. Used by the editor (live) and the sketch list
// (static thumbnails). Tolerant of older scenes without moisturePoints.
export function SceneLayers({ scene, currentWall, selectedId }:
  { scene: Scene; currentWall?: Pt[]; selectedId?: string | null }) {
  return (
    <g>
      {scene.wetAreas.map(p => (
        <polygon key={p.id} points={ptsStr(p.points)} fill="#7DD3FC" fillOpacity={0.5} stroke="#0284c7" strokeWidth={3} strokeLinejoin="round" />
      ))}
      {scene.walls.map(p => (
        <polygon key={p.id} points={ptsStr(p.points)} fill="#0E2A4D" fillOpacity={0.04} stroke="#0E2A4D" strokeWidth={6} strokeLinejoin="round" />
      ))}
      {currentWall && currentWall.length > 0 && (
        <>
          <polyline points={ptsStr(currentWall)} fill="none" stroke="#1483C2" strokeWidth={5} strokeDasharray="14 9" strokeLinejoin="round" />
          {currentWall.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 ? 9 : 6} fill={i === 0 ? '#1483C2' : '#fff'} stroke="#1483C2" strokeWidth={3} />
          ))}
        </>
      )}
      {(scene.moisturePoints ?? []).map(mp => <PointGlyph key={mp.id} mp={mp} selected={mp.id === selectedId} />)}
      {scene.equipment.map(eq => <EquipGlyph key={eq.id} eq={eq} selected={eq.id === selectedId} />)}
    </g>
  );
}