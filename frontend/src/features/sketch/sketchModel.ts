// Scene model for the moisture-map / sketch canvas. Stored verbatim in
// resto_sketches.canvas_json. Coordinates live in a fixed virtual space
// (0..1000 on each axis); the editor pans/zooms via a camera transform.

export type EquipType = 'air_mover' | 'dehumidifier' | 'air_scrubber';
export type Pt = [number, number];

export interface Poly { id: string; points: Pt[]; material?: string; surface?: 'floor' | 'wall' | 'ceiling'; }   // affected surface + material (S500)
// Xactimate-shaped demo/prep scope, measured from sketch geometry:
export interface FloodCut { wallId: string; edge: number; heightFt: number; }         // DRYW flood-cut: LF x height
export interface Containment { id: string; from: Pt; to: Pt; heightFt: number; }        // PLASTIC barrier: width x height
export interface Equip { id: string; type: EquipType; x: number; y: number; }
export interface Arrow { id: string; from: Pt; to: Pt; }   // water migration direction (S500)
export type OpeningKind = 'door' | 'opening' | 'window';
export interface Opening { id: string; wallId: string; edge: number; t: number; widthFt: number; kind: OpeningKind; }
export interface Reading { date: string; value: string; }   // date 'YYYY-MM-DD' ('' = undated legacy)
export interface MoisturePoint { id: string; x: number; y: number; label?: string; material?: string; readings?: Reading[]; }

export interface Scene {
  walls: Poly[];
  wetAreas: Poly[];
  equipment: Equip[];
  moisturePoints?: MoisturePoint[];
  arrows?: Arrow[];          // water migration arrows
  openings?: Opening[];      // doors / cased openings / windows on wall edges
  classOfLoss?: number;      // IICRC S500 class 1-4 (drives equipment suggestion)
  floodCuts?: FloodCut[];
  containments?: Containment[];
  originOfLoss?: Pt;   // S500: mark the source of loss with an X
}

export const SCENE_SIZE = 1000;
export const GRID = 25;
export const UNITS_PER_FT = 40;   // scene units per foot (matches the editor grid)
export const emptyScene = (): Scene => ({ walls: [], wetAreas: [], equipment: [], moisturePoints: [] });
export const uid = () => Math.random().toString(36).slice(2, 10);
export const todayISO = () => new Date().toISOString().slice(0, 10);

function normPoint(m: any): MoisturePoint {
  if (Array.isArray(m?.readings)) return { id: m.id, x: m.x, y: m.y, label: m.label ?? '', material: m.material, readings: m.readings };
  const legacy: Reading[] = m?.label ? [{ date: '', value: String(m.label) }] : [];
  return { id: m.id, x: m.x, y: m.y, label: '', material: m.material, readings: legacy };
}

export const normalizeScene = (s: any): Scene => ({
  walls: s?.walls ?? [],
  wetAreas: s?.wetAreas ?? [],
  equipment: s?.equipment ?? [],
  moisturePoints: (s?.moisturePoints ?? []).map(normPoint),
  arrows: s?.arrows ?? [],
  floodCuts: s?.floodCuts ?? [],
  containments: s?.containments ?? [],
  originOfLoss: s?.originOfLoss,
  openings: s?.openings ?? [],
  classOfLoss: s?.classOfLoss ?? undefined
});

// ---- reading / trend helpers ----
const byDate = (a: Reading, b: Reading) => (a.date || '').localeCompare(b.date || '');
export function latestReading(mp: MoisturePoint): Reading | undefined {
  const r = mp.readings ?? []; if (!r.length) return undefined;
  return [...r].sort(byDate)[r.length - 1];
}
export function readingAsOf(mp: MoisturePoint, date: string): Reading | undefined {
  const r = (mp.readings ?? []).filter(x => !x.date || !date || x.date <= date);
  if (!r.length) return undefined;
  return [...r].sort(byDate)[r.length - 1];
}
export function pointDisplay(mp: MoisturePoint, date?: string): string {
  const r = date ? readingAsOf(mp, date) : latestReading(mp);
  return r?.value ?? '';
}
export function allReadingDates(scene: Scene): string[] {
  const set = new Set<string>();
  for (const m of scene.moisturePoints ?? []) for (const r of m.readings ?? []) if (r.date) set.add(r.date);
  return [...set].sort();
}
export function upsertReading(mp: MoisturePoint, date: string, value: string): MoisturePoint {
  const readings = [...(mp.readings ?? [])];
  const i = readings.findIndex(r => r.date === date);
  if (i >= 0) readings[i] = { date, value }; else readings.push({ date, value });
  return { ...mp, readings };
}

// ---- geometry helpers ----
export function polygonArea(pts: Pt[]): number {   // scene units^2 (shoelace)
  let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}
export function sceneFloorSqFt(scene: Scene): number {
  const u2 = UNITS_PER_FT * UNITS_PER_FT;
  return (scene.walls ?? []).reduce((s, w) => s + (w.points.length >= 3 ? polygonArea(w.points) / u2 : 0), 0);
}
export function polygonCentroid(pts: Pt[]): Pt {
  let x = 0, y = 0, a = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; const cr = x1 * y2 - x2 * y1; a += cr; x += (x1 + x2) * cr; y += (y1 + y2) * cr; }
  a *= 0.5;
  if (!a) { const n = pts.length || 1; return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]; }
  return [x / (6 * a), y / (6 * a)];
}
export function pointInPolygon([x, y]: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
// Closed Catmull-Rom spline -> cubic bezier path (smooth wet-area outlines).
export function smoothClosedPath(pts: Pt[]): string {
  const n = pts.length;
  if (n < 3) return n ? 'M ' + pts.map(p => `${p[0]} ${p[1]}`).join(' L ') : '';
  const p = (i: number) => pts[((i % n) + n) % n];
  let d = `M ${p(0)[0]} ${p(0)[1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return d + ' Z';
}

// ---- S500 equipment guidance (heuristic; a starting point, not a substitute
// for a full psychrometric calc). Air movers scale with floor area + a room
// baseline; dehus scale with area, both stepped up by class of loss. ----
export function suggestEquipment(sqft: number, classOfLoss?: number): { airMovers: number; dehus: number } {
  if (!sqft || sqft <= 0) return { airMovers: 0, dehus: 0 };
  const cls = classOfLoss && classOfLoss >= 1 && classOfLoss <= 4 ? classOfLoss : 2;
  const perAm: Record<number, number> = { 1: 70, 2: 60, 3: 50, 4: 50 };
  const perDh: Record<number, number> = { 1: 500, 2: 400, 3: 300, 4: 300 };
  return { airMovers: Math.max(1, Math.ceil(sqft / perAm[cls]) + 1), dehus: Math.max(1, Math.ceil(sqft / perDh[cls])) };
}

export const EQUIP_META: Record<EquipType, { label: string; full: string; fill: string; ring: string }> = {
  air_mover:    { label: 'AM', full: 'Air Mover',    fill: '#29ABE6', ring: '#1483C2' },
  dehumidifier: { label: 'DH', full: 'Dehumidifier', fill: '#11B5C6', ring: '#0B7C88' },
  air_scrubber: { label: 'AS', full: 'Air Scrubber', fill: '#64748B', ring: '#475569' }
};

export const ptsStr = (pts: Pt[]) => pts.map(p => `${p[0]},${p[1]}`).join(' ');

// ---- snapping / hit helpers ----
export const snapGrid = (v: number, step = GRID) => Math.round(v / step) * step;
export const dist2 = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
export function snapVertex(p: Pt, prev: Pt | null, orthoTol = 18): Pt {
  let [x, y] = [snapGrid(p[0]), snapGrid(p[1])];
  if (prev) { if (Math.abs(x - prev[0]) <= orthoTol) x = prev[0]; if (Math.abs(y - prev[1]) <= orthoTol) y = prev[1]; }
  return [x, y];
}
export function hitEquipment(scene: Scene, x: number, y: number, r = 34): Equip | null {
  let best: Equip | null = null, bestD = r * r;
  for (const e of scene.equipment) { const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d <= bestD) { bestD = d; best = e; } }
  return best;
}
export function hitPoint(scene: Scene, x: number, y: number, r = 34): MoisturePoint | null {
  let best: MoisturePoint | null = null, bestD = r * r;
  for (const m of scene.moisturePoints ?? []) { const d = (m.x - x) ** 2 + (m.y - y) ** 2; if (d <= bestD) { bestD = d; best = m; } }
  return best;
}
export function hitWall(scene: Scene, x: number, y: number): Poly | null {
  for (const w of scene.walls) if (w.points.length >= 3 && pointInPolygon([x, y], w.points)) return w;
  return null;
}
function distToSeg(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - a[0]) * dx + (py - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
export function hitArrow(scene: Scene, x: number, y: number, r = 26): Arrow | null {
  for (const ar of scene.arrows ?? []) if (distToSeg(x, y, ar.from, ar.to) <= r) return ar;
  return null;
}

// ---- openings (doors / windows / cased openings on wall edges) ----
export const OPENING_DEFAULT_FT: Record<OpeningKind, number> = { door: 3, opening: 4, window: 3 };
export function wallById(scene: Scene, id: string): Poly | undefined { return scene.walls.find(w => w.id === id); }
export function edgePts(wall: Poly, edge: number): [Pt, Pt] {
  const n = wall.points.length; return [wall.points[edge], wall.points[(edge + 1) % n]];
}
export interface OpeningGeom { A: Pt; B: Pt; dir: Pt; nrm: Pt; center: Pt; gapLen: number; }
export function openingGeom(wall: Poly, op: Opening): OpeningGeom {
  const [P0, P1] = edgePts(wall, op.edge);
  const ex = P1[0] - P0[0], ey = P1[1] - P0[1];
  const len = Math.hypot(ex, ey) || 1;
  const dir: Pt = [ex / len, ey / len];
  let nrm: Pt = [-dir[1], dir[0]];
  const cx = P0[0] + op.t * ex, cy = P0[1] + op.t * ey;
  const c = polygonCentroid(wall.points);
  if ((c[0] - cx) * nrm[0] + (c[1] - cy) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];   // point into the room
  const half = Math.min((op.widthFt * UNITS_PER_FT) / 2, (len / 2) * 0.9);
  const A: Pt = [cx - dir[0] * half, cy - dir[1] * half];
  const B: Pt = [cx + dir[0] * half, cy + dir[1] * half];
  return { A, B, dir, nrm, center: [cx, cy], gapLen: half * 2 };
}
export function hitOpening(scene: Scene, x: number, y: number, r = 26): Opening | null {
  for (const op of scene.openings ?? []) {
    const w = wallById(scene, op.wallId); if (!w) continue;
    const g = openingGeom(w, op);
    if (Math.hypot(g.center[0] - x, g.center[1] - y) <= r) return op;
  }
  return null;
}
export function nearestWallEdge(scene: Scene, x: number, y: number): { wallId: string; edge: number; t: number; dist: number; edgeLen: number } | null {
  let best: { wallId: string; edge: number; t: number; dist: number; edgeLen: number } | null = null, bd = Infinity;
  for (const w of scene.walls) {
    const n = w.points.length;
    for (let i = 0; i < n; i++) {
      const P0 = w.points[i], P1 = w.points[(i + 1) % n];
      const ex = P1[0] - P0[0], ey = P1[1] - P0[1];
      const len2 = ex * ex + ey * ey || 1;
      let t = ((x - P0[0]) * ex + (y - P0[1]) * ey) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = P0[0] + t * ex, py = P0[1] + t * ey;
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = { wallId: w.id, edge: i, t, dist: d, edgeLen: Math.sqrt(len2) }; }
    }
  }
  return best;
}

// --- flood cut + containment geometry (measured for Xactimate) ---
export function edgePoints(scene: Scene, wallId: string, edge: number): [Pt, Pt] | null {
  const w = wallById(scene, wallId); if (!w) return null;
  const n = w.points.length;
  return [w.points[edge], w.points[(edge + 1) % n]];
}
// unit normal pointing INTO the room (toward the polygon centroid)
export function edgeInwardNormal(scene: Scene, wallId: string, edge: number): Pt {
  const w = wallById(scene, wallId); const ep = edgePoints(scene, wallId, edge);
  if (!w || !ep) return [0, 0];
  const [a, b] = ep; const dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  const c = polygonCentroid(w.points); const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  if ((c[0] - mx) * nx + (c[1] - my) * ny < 0) { nx = -nx; ny = -ny; }
  return [nx, ny];
}
export function hasFloodCut(scene: Scene, wallId: string, edge: number): boolean {
  return (scene.floodCuts ?? []).some(f => f.wallId === wallId && f.edge === edge);
}
export function floodCutStats(scene: Scene): { lf: number; sqft: number } {
  let lf = 0, sqft = 0;
  for (const fc of scene.floodCuts ?? []) {
    const ep = edgePoints(scene, fc.wallId, fc.edge); if (!ep) continue;
    const len = Math.hypot(ep[1][0] - ep[0][0], ep[1][1] - ep[0][1]) / UNITS_PER_FT;
    lf += len; sqft += len * fc.heightFt;
  }
  return { lf, sqft };
}
export function containmentStats(scene: Scene): { sqft: number; count: number } {
  let sqft = 0; const list = scene.containments ?? [];
  for (const c of list) sqft += (Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]) / UNITS_PER_FT) * c.heightFt;
  return { sqft, count: list.length };
}

// S500 affected-material documentation for wet areas
export const WET_SURFACES: ('floor' | 'wall' | 'ceiling')[] = ['floor', 'wall', 'ceiling'];
export const WET_MATERIALS = ['Carpet', 'Carpet Pad', 'Hardwood', 'Laminate', 'Vinyl / LVP', 'Tile', 'Concrete', 'Drywall', 'Baseboard', 'Insulation', 'Subfloor', 'Trim'];