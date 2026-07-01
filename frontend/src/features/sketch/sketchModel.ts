// Scene model for the moisture-map / sketch canvas. Stored verbatim in
// resto_sketches.canvas_json. Coordinates live in a fixed virtual space
// (0..1000 on each axis); the editor pans/zooms via the SVG viewBox.

export type EquipType = 'air_mover' | 'dehumidifier' | 'air_scrubber';
export type Pt = [number, number];

export interface Poly { id: string; points: Pt[]; }
export interface Equip { id: string; type: EquipType; x: number; y: number; }
export interface MoisturePoint { id: string; x: number; y: number; label: string; material?: string; }

export interface Scene {
  walls: Poly[];                    // closed room outlines
  wetAreas: Poly[];                 // wet-area polygons (the blue blob)
  equipment: Equip[];               // placed air movers / dehus / scrubbers
  moisturePoints?: MoisturePoint[]; // reading pins (added later; optional for old scenes)
}

export const SCENE_SIZE = 1000;
export const GRID = 25;
export const emptyScene = (): Scene => ({ walls: [], wetAreas: [], equipment: [], moisturePoints: [] });
export const uid = () => Math.random().toString(36).slice(2, 10);

// Normalize a stored scene so older records (no moisturePoints) are safe to use.
export const normalizeScene = (s: any): Scene => ({
  walls: s?.walls ?? [],
  wetAreas: s?.wetAreas ?? [],
  equipment: s?.equipment ?? [],
  moisturePoints: s?.moisturePoints ?? []
});

export const EQUIP_META: Record<EquipType, { label: string; full: string; fill: string; ring: string }> = {
  air_mover:    { label: 'AM', full: 'Air Mover',    fill: '#29ABE6', ring: '#1483C2' },
  dehumidifier: { label: 'DH', full: 'Dehumidifier', fill: '#11B5C6', ring: '#0B7C88' },
  air_scrubber: { label: 'AS', full: 'Air Scrubber', fill: '#64748B', ring: '#475569' }
};

export const ptsStr = (pts: Pt[]) => pts.map(p => `${p[0]},${p[1]}`).join(' ');

// ---- snapping helpers ----
export const snapGrid = (v: number, step = GRID) => Math.round(v / step) * step;
export const dist2 = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

// Snap a candidate wall vertex: grid, then orthogonal to the previous vertex.
export function snapVertex(p: Pt, prev: Pt | null, orthoTol = 18): Pt {
  let [x, y] = [snapGrid(p[0]), snapGrid(p[1])];
  if (prev) {
    if (Math.abs(x - prev[0]) <= orthoTol) x = prev[0]; // vertical run
    if (Math.abs(y - prev[1]) <= orthoTol) y = prev[1]; // horizontal run
  }
  return [x, y];
}

// Nearest equipment within a hit radius (scene units).
export function hitEquipment(scene: Scene, x: number, y: number, r = 34): Equip | null {
  let best: Equip | null = null, bestD = r * r;
  for (const e of scene.equipment) {
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d <= bestD) { bestD = d; best = e; }
  }
  return best;
}

// Nearest moisture point within a hit radius.
export function hitPoint(scene: Scene, x: number, y: number, r = 34): MoisturePoint | null {
  let best: MoisturePoint | null = null, bestD = r * r;
  for (const m of scene.moisturePoints ?? []) {
    const d = (m.x - x) ** 2 + (m.y - y) ** 2;
    if (d <= bestD) { bestD = d; best = m; }
  }
  return best;
}