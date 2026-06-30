import { EQUIP_META, ptsStr, type Equip, type Pt, type Scene } from './sketchModel';

function EquipGlyph({ eq, selected }: { eq: Equip; selected?: boolean }) {
  return (
    <g transform={`translate(${eq.x},${eq.y})`}>
      <circle r={22} fill="white" stroke={selected ? '#ea580c' : '#374151'} strokeWidth={selected ? 4 : 3} />
      <text textAnchor="middle" dominantBaseline="central" fontSize={18} fontWeight={700} fill="#374151">
        {EQUIP_META[eq.type].label}
      </text>
    </g>
  );
}

// Shared, read-only renderer for a Scene. Used by the editor (live) and by the
// sketch list (static thumbnails).
export function SceneLayers({ scene, currentWall, selectedId }:
  { scene: Scene; currentWall?: Pt[]; selectedId?: string | null }) {
  return (
    <g>
      {scene.wetAreas.map(p => (
        <polygon key={p.id} points={ptsStr(p.points)} fill="#38bdf8" fillOpacity={0.45} stroke="#0284c7" strokeWidth={2} />
      ))}
      {scene.walls.map(p => (
        <polygon key={p.id} points={ptsStr(p.points)} fill="none" stroke="#111827" strokeWidth={5} strokeLinejoin="round" />
      ))}
      {currentWall && currentWall.length > 0 && (
        <>
          <polyline points={ptsStr(currentWall)} fill="none" stroke="#111827" strokeWidth={4} strokeDasharray="10 7" />
          {currentWall.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={5} fill="#ea580c" />)}
        </>
      )}
      {scene.equipment.map(eq => <EquipGlyph key={eq.id} eq={eq} selected={eq.id === selectedId} />)}
    </g>
  );
}