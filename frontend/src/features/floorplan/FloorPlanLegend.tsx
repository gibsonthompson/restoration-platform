// Floor plan legend / key.
//
// Every swatch below is drawn with the SAME colors and stroke widths that
// SceneLayers.tsx (OpeningGlyph / WallBand) uses on the plan itself, so what a
// tech sees in this key is pixel-for-pixel what the plan draws. If SceneLayers
// ever changes a symbol, mirror the change here.
//
//   wall band   : navy #0E2A4D outer, white center. WALL_W 18, WALL_LW 3.2.
//   jambs       : navy #0E2A4D, width 3.2, round cap (door / window / cased).
//   door swing  : grey #94a3b8 arc width 2.5, navy leaf line width 3.
//   window      : navy #0E2A4D line across the gap, width 2.5.
//   cased open  : jambs only, floor continues through, no arc, no cross line.
//   missing wall: NO jambs, grey #94a3b8 dashed line, dasharray 6 6, width 2.5.

const NAVY = '#0E2A4D';
const GREY = '#94a3b8';
const FLOOR = '#f4f7fb';
const WALL_W = 18;
const WALL_LW = 3.2;

type Kind = 'door' | 'window' | 'cased' | 'missing';

// A short horizontal wall segment with a gap in the middle. Gap ends A and B
// sit at x = 38 and x = 58; the inward normal points straight down, matching a
// wall whose room is below it, exactly like the plan's knock-out.
function Swatch({ kind }: { kind: Kind }) {
  const Ax = 38, Bx = 58, y = 22, gapLen = Bx - Ax;
  const openEndX = Ax, openEndY = y + gapLen; // A + normal * gapLen
  return (
    <svg viewBox="0 0 96 46" width={76} height={36} style={{ flex: '0 0 auto' }} aria-hidden="true">
      {/* wall band, drawn in two pieces so the gap is a true hole */}
      <line x1={6} y1={y} x2={Ax} y2={y} stroke={NAVY} strokeWidth={WALL_W} />
      <line x1={Bx} y1={y} x2={90} y2={y} stroke={NAVY} strokeWidth={WALL_W} />
      <line x1={6} y1={y} x2={Ax} y2={y} stroke="#ffffff" strokeWidth={WALL_W - 2 * WALL_LW} />
      <line x1={Bx} y1={y} x2={90} y2={y} stroke="#ffffff" strokeWidth={WALL_W - 2 * WALL_LW} />

      {/* floor continues through the gap */}
      <rect x={Ax} y={y - WALL_W / 2} width={gapLen} height={WALL_W} fill={FLOOR} />

      {/* jambs on everything except a missing wall */}
      {kind !== 'missing' && (
        <>
          <line x1={Ax} y1={y - WALL_W / 2} x2={Ax} y2={y + WALL_W / 2} stroke={NAVY} strokeWidth={WALL_LW} strokeLinecap="round" />
          <line x1={Bx} y1={y - WALL_W / 2} x2={Bx} y2={y + WALL_W / 2} stroke={NAVY} strokeWidth={WALL_LW} strokeLinecap="round" />
        </>
      )}

      {kind === 'door' && (
        <>
          <path d={`M ${Bx} ${y} A ${gapLen} ${gapLen} 0 0 1 ${openEndX} ${openEndY}`} fill="none" stroke={GREY} strokeWidth={2.5} />
          <line x1={Ax} y1={y} x2={openEndX} y2={openEndY} stroke={NAVY} strokeWidth={3} strokeLinecap="round" />
        </>
      )}

      {kind === 'window' && (
        <line x1={Ax} y1={y} x2={Bx} y2={y} stroke={NAVY} strokeWidth={2.5} />
      )}

      {kind === 'missing' && (
        <line x1={Ax} y1={y} x2={Bx} y2={y} stroke={GREY} strokeWidth={2.5} strokeDasharray="6 6" />
      )}
    </svg>
  );
}

const ROWS: { kind: Kind; label: string; note: string }[] = [
  { kind: 'door', label: 'Door', note: 'Swing arc shows the way it opens. Interrupts baseboard.' },
  { kind: 'window', label: 'Window', note: 'Line across the opening. Baseboard runs underneath.' },
  { kind: 'cased', label: 'Cased opening', note: 'Walk-through with jambs, no door. Interrupts baseboard.' },
  { kind: 'missing', label: 'Missing wall', note: 'Open archway, no wall. Deducts full ceiling height, no baseboard.' },
];

export default function FloorPlanLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        padding: compact ? '10px 12px' : '14px 16px',
        boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
        maxWidth: 340,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#64748b',
          marginBottom: 10,
        }}
      >
        Legend
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12 }}>
        {ROWS.map((r) => (
          <div key={r.kind} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Swatch kind={r.kind} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, lineHeight: 1.2 }}>{r.label}</div>
              {!compact && (
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.35, marginTop: 2 }}>{r.note}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}