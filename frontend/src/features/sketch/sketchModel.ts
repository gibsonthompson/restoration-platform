// Scene model for the moisture-map / sketch canvas. Stored verbatim in
// resto_sketches.canvas_json. Coordinates live in a fixed virtual space
// (0..1000 on each axis); the editor pans/zooms via a camera transform.

export type EquipType = 'air_mover' | 'dehumidifier' | 'air_scrubber';
export type Pt = [number, number];

export interface Poly { id: string; points: Pt[]; material?: string; surface?: 'floor' | 'wall' | 'ceiling'; brush?: number; strokes?: Pt[][]; disposition?: 'dry' | 'remove'; }   // affected surface + material (S500); brush = painted stroke width; strokes = multi-stroke paint; disposition = dry-in-place (extraction) vs remove (flooring tear-out) for the Xactimate export
// Xactimate-shaped demo/prep scope, measured from sketch geometry:
export interface FloodCut { wallId: string; edge: number; heightFt: number; lengthFt?: number; startFt?: number; }   // DRYW flood-cut: LF at cut height, positioned startFt from the edge start
export interface Containment { id: string; heightFt: number; x?: number; y?: number; widthFt?: number; label?: string; from?: Pt; to?: Pt; }   // PLASTIC barrier: width x height (tap-placed); from/to legacy
export interface Equip { id: string; type: EquipType; x: number; y: number; }
export interface Arrow { id: string; from: Pt; to: Pt; }   // water migration direction (S500)

// 'missing_wall' is Xactimate's own concept: an open archway between two rooms. It is
// not a door in a wall, it is the ABSENCE of wall, so it deducts full ceiling height
// from wall area and leaves no baseboard.
export type OpeningKind = 'door' | 'opening' | 'window' | 'missing_wall';

// heightFt is a MEASUREMENT, and it must be captured, not invented. Wall area is
//   W = (perimeter x ceiling height) - SUM(opening width x opening HEIGHT)
// so an assumed height is an assumed dollar amount on a paint or drywall line. It is
// optional only so that sketches drawn before this existed still parse; anything
// consuming it treats a missing height as an ASSUMPTION and says so out loud.
export interface Opening { id: string; wallId: string; edge: number; t: number; widthFt: number; heightFt?: number; kind: OpeningKind; }
export interface Reading { date: string; value: string; }   // date 'YYYY-MM-DD' ('' = undated legacy)
export interface MoisturePoint { id: string; x: number; y: number; label?: string; material?: string; readings?: Reading[]; }

export interface Scene {
  walls: Poly[];
  wetAreas: Poly[];
  equipment: Equip[];
  moisturePoints?: MoisturePoint[];
  arrows?: Arrow[];          // water migration arrows
  openings?: Opening[];      // doors / cased openings / windows / missing walls on wall edges
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

// ---- openings (doors / windows / cased openings / missing walls on wall edges) ----
//
// These are XACTIMATE'S OWN DEFAULTS, not guesses. Decoded from the reference file's
// SKETCHDOCUMENTPREFS, at 1524 internal units per foot:
//   defDoorWidth   3810  = 2' 6"      defDoorHeight   10160 = 6' 8"
//   defWindowWidth 4064  = 2' 8"      defWindowHeight  6096 = 4' 0"
// Starting from the same defaults an estimator sees means a tech confirms a number
// instead of correcting one.
export const OPENING_DEFAULT_FT: Record<OpeningKind, number> = {
  door: 2.5,                 // 2' 6"
  window: 2 + 8 / 12,        // 2' 8"
  opening: 4,                // a cased opening is wider; no Xactimate default, so a sane one
  missing_wall: 6
};

// Starting HEIGHTS. Used ONLY as the value the capture sheet opens on, never as a
// silent substitute for a measurement. missing_wall is null because a missing wall is
// full ceiling height by definition.
export const OPENING_DEFAULT_HEIGHT_FT: Record<OpeningKind, number | null> = {
  door: 6 + 8 / 12,          // 6' 8", Xactimate's default door
  window: 4,                 // 4' 0", Xactimate's default window
  opening: 6 + 8 / 12,
  missing_wall: null
};

// Plain-English descriptions. A tech should never have to guess what a term means.
export const OPENING_DESC: Record<OpeningKind, string> = {
  door: 'A normal door in a wall.',
  window: 'A window. Baseboard runs underneath it, so it does not interrupt the trim.',
  opening: 'A doorway with no door in it: an archway or a squared-off gap between two rooms. The wall and its frame are still there, so it has jambs.',
  missing_wall: 'No wall at all between two rooms. Deducts the full height of the wall, and there is no baseboard across it.'
};

// Openings you can walk through interrupt baseboard. A WINDOW does not, because
// baseboard runs underneath it.
export const OPENING_BREAKS_BASEBOARD: Record<OpeningKind, boolean> = {
  door: true, opening: true, missing_wall: true, window: false
};

export const OPENING_LABEL: Record<OpeningKind, string> = {
  door: 'Door', window: 'Window', opening: 'Cased opening', missing_wall: 'Missing wall'
};

// Resolve an opening's height. A missing wall is always full ceiling height. Anything
// else uses the MEASURED height, and only falls back to a standard size when nothing
// was captured. Returns the flag so a caller can tell the user the number is assumed.
export function openingHeightFt(op: Opening, ceilingHeightFt: number): { heightFt: number; assumed: boolean } {
  if (op.kind === 'missing_wall') return { heightFt: ceilingHeightFt, assumed: false };
  if (op.heightFt != null && op.heightFt > 0) {
    return { heightFt: Math.min(op.heightFt, ceilingHeightFt), assumed: false };
  }
  const def = OPENING_DEFAULT_HEIGHT_FT[op.kind] ?? ceilingHeightFt;
  return { heightFt: Math.min(def, ceilingHeightFt), assumed: true };
}

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
export function edgeLenFt(scene: Scene, wallId: string, edge: number): number {
  const ep = edgePoints(scene, wallId, edge); if (!ep) return 0;
  return Math.hypot(ep[1][0] - ep[0][0], ep[1][1] - ep[0][1]) / UNITS_PER_FT;
}
export function floodCutStats(scene: Scene): { lf: number; sqft: number } {
  let lf = 0, sqft = 0;
  for (const fc of scene.floodCuts ?? []) {
    const full = edgeLenFt(scene, fc.wallId, fc.edge); if (!full) continue;
    const len = fc.lengthFt != null ? Math.min(fc.lengthFt, full) : full;
    lf += len; sqft += len * fc.heightFt;
  }
  return { lf, sqft };
}
export function containmentSqFt(c: Containment): number {
  if (c.widthFt != null) return c.widthFt * c.heightFt;
  if (c.from && c.to) return (Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]) / UNITS_PER_FT) * c.heightFt;
  return 0;
}
export function containmentStats(scene: Scene): { sqft: number; count: number } {
  const list = scene.containments ?? [];
  let sqft = 0; for (const c of list) sqft += containmentSqFt(c);
  return { sqft, count: list.length };
}

// S500 affected-material documentation for wet areas
export const FLOOD_HEIGHTS: { label: string; ft: number }[] = [{ label: '4"', ft: 1 / 3 }, { label: "2'", ft: 2 }, { label: "4'", ft: 4 }];
export const WET_SURFACES: ('floor' | 'wall' | 'ceiling')[] = ['floor', 'wall', 'ceiling'];
export const FLOOR_MATERIALS = ['Carpet', 'Carpet Pad', 'Hardwood', 'Laminate', 'Vinyl / LVP', 'Tile', 'Concrete', 'Subfloor'];
export const WALL_MATERIALS = ['Drywall', 'Plaster', 'Paneling', 'Baseboard', 'Trim', 'Insulation', 'Wallpaper'];
export const CEILING_MATERIALS = ['Drywall', 'Plaster', 'Acoustic Tile', 'Insulation', 'Trim'];
export const MATERIALS_BY_SURFACE: Record<'floor' | 'wall' | 'ceiling', string[]> = { floor: FLOOR_MATERIALS, wall: WALL_MATERIALS, ceiling: CEILING_MATERIALS };

// Wet area square footage: painted brush stroke (length x width) or legacy filled polygon
export function wetSqFt(w: Poly): number {
  if (w.brush) {
    const strokes = w.strokes ?? (w.points.length ? [w.points] : []);
    let area = 0;
    for (const st of strokes) {
      let len = 0;
      for (let i = 1; i < st.length; i++) len += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
      area += len * w.brush + Math.PI * (w.brush / 2) ** 2;
    }
    return area / (UNITS_PER_FT * UNITS_PER_FT);
  }
  return polygonArea(w.points) / (UNITS_PER_FT * UNITS_PER_FT);
}

// Flood-cut segment endpoints on the wall edge (positioned by startFt, sized by lengthFt)
export function floodCutEnds(scene: Scene, fc: FloodCut): { a: Pt; ux: number; uy: number; full: number; startU: number; lenU: number; start: Pt; end: Pt } | null {
  const ep = edgePoints(scene, fc.wallId, fc.edge); if (!ep) return null;
  const [a, b] = ep; const dx = b[0] - a[0], dy = b[1] - a[1], full = Math.hypot(dx, dy) || 1;
  const ux = dx / full, uy = dy / full;
  const startU = Math.max(0, Math.min((fc.startFt ?? 0) * UNITS_PER_FT, full));
  const lenU = fc.lengthFt != null ? Math.min(fc.lengthFt * UNITS_PER_FT, full - startU) : (full - startU);
  return { a, ux, uy, full, startU, lenU, start: [a[0] + ux * startU, a[1] + uy * startU], end: [a[0] + ux * (startU + lenU), a[1] + uy * (startU + lenU)] };
}
// Project a scene point onto the wall edge; return distance-from-start in FEET (clamped to the wall)
export function projectToEdgeFt(scene: Scene, wallId: string, edge: number, pt: Pt): number {
  const ep = edgePoints(scene, wallId, edge); if (!ep) return 0;
  const [a, b] = ep; const dx = b[0] - a[0], dy = b[1] - a[1], full2 = dx * dx + dy * dy || 1;
  const t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / full2;
  return Math.max(0, Math.min(1, t)) * Math.sqrt(full2) / UNITS_PER_FT;
}

// ============================================================================
// ROOM DIMENSION VARIABLES (Xactimate's own model), frontend twin of
// resto-scope-quantities.roomDimensions. A parity test compares the two.
// ----------------------------------------------------------------------------
//   F  = floor SF          C  = ceiling SF (FLAT ceiling: C = F)
//   SY = floor sq YARDS    = F / 9
//   PF = floor perimeter   PC = ceiling perimeter (= PF)
//   SH = ceiling height
//   W  = (PF x SH) - SUM(opening width x opening HEIGHT)     <-- WALL SF
//   WC = W + C
//
// Confirmed against a real Xactimate file whose 12x12 room reports
// C=144; F=144; SY=16; PC=48; PF=48; SH=7.667; W=368; WC=512.
//
// Baseboard runs the perimeter, interrupted by anything you can walk through (a
// door, a cased opening, a missing wall). A WINDOW does not interrupt it, because
// baseboard runs underneath a window.
//
// FLAT CEILINGS ONLY. C = F is false for a vaulted ceiling. Stated so nobody later
// assumes it was handled.
// ============================================================================
export interface RoomDims {
  F: number; C: number; SY: number; PF: number; PC: number; SH: number; W: number; WC: number;
  grossWallSF: number; openingDeductSF: number; baseboardLF: number;
  openings: { id: string; kind: OpeningKind; widthFt: number; heightFt: number; sqft: number; assumedHeight: boolean }[];
  warnings: string[];
  assumedCeiling: boolean;
}

const r2n = (n: number) => Math.round(n * 100) / 100;

// The largest wall polygon = the room outline.
export function roomOutlinePoly(scene: Scene): Poly | null {
  let best: Poly | null = null, bestArea = 0;
  for (const w of scene.walls ?? []) {
    if (!w.points || w.points.length < 3) continue;
    const a = polygonArea(w.points);
    if (a > bestArea) { bestArea = a; best = w; }
  }
  return best;
}

export function roomDimensions(scene: Scene, ceilingHeightFt?: number | null): RoomDims {
  const warnings: string[] = [];
  const hasCeiling = Number(ceilingHeightFt) > 0;
  const SH = hasCeiling ? Number(ceilingHeightFt) : 8;
  if (!hasCeiling) warnings.push('No ceiling height measured. Wall area assumes an 8 ft ceiling.');

  const poly = roomOutlinePoly(scene);
  if (!poly) {
    warnings.push('Draw the room outline to get dimensions.');
    return { F: 0, C: 0, SY: 0, PF: 0, PC: 0, SH, W: 0, WC: 0, grossWallSF: 0, openingDeductSF: 0, baseboardLF: 0, openings: [], warnings, assumedCeiling: !hasCeiling };
  }

  const u2 = UNITS_PER_FT * UNITS_PER_FT;
  const Fraw = polygonArea(poly.points) / u2;
  let per = 0;
  for (let i = 0; i < poly.points.length; i++) {
    const [x1, y1] = poly.points[i], [x2, y2] = poly.points[(i + 1) % poly.points.length];
    per += Math.hypot(x2 - x1, y2 - y1);
  }
  const PFraw = per / UNITS_PER_FT;

  // openings on this room, with their measured (or assumed) sizes
  const wmap: Record<string, Poly> = {};
  (scene.walls ?? []).forEach(w => { wmap[w.id] = w; });
  const openings: RoomDims['openings'] = [];
  for (const op of scene.openings ?? []) {
    const w = wmap[op.wallId]; if (!w) continue;
    const edgeFt = edgeLenFt(scene, op.wallId, op.edge);
    let widthFt = op.widthFt != null ? op.widthFt : OPENING_DEFAULT_FT[op.kind];
    widthFt = Math.max(0, Math.min(widthFt, edgeFt || widthFt));       // never wider than its wall
    const { heightFt, assumed } = openingHeightFt(op, SH);
    openings.push({
      id: op.id, kind: op.kind, widthFt: r2n(widthFt), heightFt: r2n(heightFt),
      sqft: r2n(widthFt * heightFt), assumedHeight: assumed
    });
  }

  // FULL precision internally; round only on output. Rounding the perimeter first and
  // THEN multiplying by the ceiling height pushes the error straight into wall area,
  // and wall area is what a paint line bills against.
  const grossRaw = PFraw * SH;
  const deductRaw = openings.reduce((a, o) => a + o.sqft, 0);
  let Wraw = grossRaw - deductRaw;
  if (Wraw < 0) { warnings.push('The openings are larger than the wall area. Check their sizes.'); Wraw = 0; }

  const breakLF = openings.filter(o => OPENING_BREAKS_BASEBOARD[o.kind]).reduce((a, o) => a + o.widthFt, 0);
  if (openings.some(o => o.assumedHeight)) {
    warnings.push('Some openings have no measured height and are using a standard size.');
  }

  return {
    F: r2n(Fraw), C: r2n(Fraw), SY: r2n(Fraw / 9),
    PF: r2n(PFraw), PC: r2n(PFraw), SH,
    W: r2n(Wraw), WC: r2n(Wraw + Fraw),
    grossWallSF: r2n(grossRaw), openingDeductSF: r2n(deductRaw),
    baseboardLF: r2n(Math.max(0, PFraw - breakLF)),
    openings, warnings, assumedCeiling: !hasCeiling
  };
}

// The room's overall bounding box in FEET, written back to resto_rooms so anything
// reading room.length_ft / width_ft gets a real number instead of 0 x 0.
export function roomBBoxFt(scene: Scene): { widthFt: number; lengthFt: number } {
  const poly = roomOutlinePoly(scene);
  if (!poly) return { widthFt: 0, lengthFt: 0 };
  const xs = poly.points.map(p => p[0]), ys = poly.points.map(p => p[1]);
  return {
    widthFt: r2n((Math.max(...xs) - Math.min(...xs)) / UNITS_PER_FT),
    lengthFt: r2n((Math.max(...ys) - Math.min(...ys)) / UNITS_PER_FT)
  };
}

// ============================================================================
// EXACT EDGE LENGTHS
// ----------------------------------------------------------------------------
// A dimension could only ever be set by DRAGGING, and you cannot drag 12 ft 7 in
// with a fingertip. This is the fix: type the wall's real length and the geometry
// updates to exactly that.
//
// The catch: changing one edge of a CLOSED polygon breaks closure. For a rectilinear
// room (all corners square, which is almost every room) the fix is the one a builder
// would give you: the PARALLEL PARTNER edge absorbs the change. Lengthen the north
// wall and the south wall follows, because in a real rectangular room they ARE the
// same measurement.
//
// If no partner exists (a genuinely angled room), we translate the downstream
// vertices and let the closing edge take up the slack, and the caller is told, so
// nothing silently deforms.
// ============================================================================
export function setEdgeLengthFt(pts: Pt[], edge: number, newLenFt: number): { points: Pt[]; exact: boolean } | null {
  const n = pts.length;
  if (n < 3 || edge < 0 || edge >= n || !(newLenFt > 0)) return null;

  const vecs: Pt[] = [];
  for (let i = 0; i < n; i++) vecs.push([pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]]);
  const mag = (v: Pt) => Math.hypot(v[0], v[1]);

  const oldLen = mag(vecs[edge]);
  if (oldLen < 1e-6) return null;
  const newLen = newLenFt * UNITS_PER_FT;
  const delta = newLen - oldLen;
  const d: Pt = [vecs[edge][0] / oldLen, vecs[edge][1] / oldLen];

  // find an ANTIPARALLEL partner: the edge that runs back the other way. In a
  // rectangle that is the opposite wall. Prefer the longest such edge.
  let partner = -1, partnerLen = 0;
  for (let i = 0; i < n; i++) {
    if (i === edge) continue;
    const L = mag(vecs[i]); if (L < 1e-6) continue;
    const u: Pt = [vecs[i][0] / L, vecs[i][1] / L];
    const dot = u[0] * d[0] + u[1] * d[1];
    if (dot < -0.996 && L > partnerLen) { partner = i; partnerLen = L; }   // within ~5 degrees of opposite
  }

  const out = vecs.map(v => [v[0], v[1]] as Pt);
  out[edge] = [d[0] * newLen, d[1] * newLen];

  let exact = false;
  if (partner >= 0) {
    // the partner must grow by the same delta so the signed vectors still sum to zero
    const L = mag(vecs[partner]);
    const u: Pt = [vecs[partner][0] / L, vecs[partner][1] / L];
    const pNew = L + delta;
    if (pNew > UNITS_PER_FT * 0.25) {          // do not collapse a wall below 3 inches
      out[partner] = [u[0] * pNew, u[1] * pNew];
      exact = true;
    }
  }

  // rebuild from the first vertex, walking the (possibly adjusted) edge vectors
  const res: Pt[] = [[pts[0][0], pts[0][1]]];
  for (let i = 0; i < n - 1; i++) {
    const prev = res[i];
    res.push([prev[0] + out[i][0], prev[1] + out[i][1]]);
  }
  return { points: res, exact };
}

// Length of one edge of a polygon, in feet.
export function polyEdgeLenFt(pts: Pt[], edge: number): number {
  const n = pts.length;
  if (n < 2 || edge < 0 || edge >= n) return 0;
  const a = pts[edge], b = pts[(edge + 1) % n];
  return Math.hypot(b[0] - a[0], b[1] - a[1]) / UNITS_PER_FT;
}