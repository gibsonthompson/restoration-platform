// Floor-plan model: a structure's floor plan is a thin *layout* over existing
// room sketches. A "block" is just a room footprint placed at {x, y, rotation};
// geometry is never copied, we read each room's live sketch walls at render time,
// so re-sketching a room updates its block automatically.
//
// The floor plan is also an EDITOR onto those same sketches. Anything placed here
// (a door, an air mover, a wet floor) is written into the room's own
// resto_sketches.canvas_json, never into layout_json. layout_json stores WHERE
// rooms sit and nothing else. That keeps one source of truth: an air mover placed
// on the floor plan is the same record the room editor, the S500 equipment check,
// the report, and the Xactimate export all read.
import { normalizeScene, pointInPolygon, uid, UNITS_PER_FT, type Poly, type Pt, type Scene } from '../sketch/sketchModel';

export interface Block { roomId: string; x: number; y: number; rotation: number; }   // rotation in degrees
export interface FloorPlanLayout { blocks: Block[]; }

export interface Footprint {
  roomId: string; name: string; hasSketch: boolean;
  walls: Poly[];           // room walls in the room's own sketch coordinates
  center: Pt;              // footprint bbox center = rotation pivot
  w: number; h: number;    // footprint size (scene units)
}

const DEG = Math.PI / 180;

// Build a room's footprint from its latest sketch, or a placeholder rectangle
// (from room dimensions, fallback 12x12 ft) when the room hasn't been sketched.
export function footprintFromRoom(
  room: { id: string; name: string; length_ft?: number | null; width_ft?: number | null },
  sketchJson: any | null
): Footprint {
  const scene: Scene | null = sketchJson ? normalizeScene(sketchJson) : null;
  let walls: Poly[] = (scene?.walls ?? []).filter(w => w.points && w.points.length >= 3);
  const hasSketch = walls.length > 0;
  if (!hasSketch) {
    const w = (room.width_ft || 12) * UNITS_PER_FT, h = (room.length_ft || 12) * UNITS_PER_FT;
    walls = [{ id: 'placeholder', points: [[0, 0], [w, 0], [w, h], [0, h]] }];
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of walls) for (const [x, y] of p.points) {
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return { roomId: room.id, name: room.name, hasSketch, walls, center: [(minX + maxX) / 2, (minY + maxY) / 2], w: maxX - minX, h: maxY - minY };
}

// Transform a footprint-local point into floor-plan space for a placement.
export function placePoint([px, py]: Pt, fp: Footprint, b: Block): Pt {
  const dx = px - fp.center[0], dy = py - fp.center[1];
  const a = b.rotation * DEG, cos = Math.cos(a), sin = Math.sin(a);
  return [b.x + dx * cos - dy * sin, b.y + dx * sin + dy * cos];
}

// The INVERSE of placePoint: floor-plan space back into the room's own sketch
// coordinates. This is what makes placing an element on the floor plan land in
// exactly the right spot inside the room's sketch.
//   place:   world = b.xy + R(a) . (local - center)
//   unplace: local = center + R(-a) . (world - b.xy)
export function unplacePoint([wx, wy]: Pt, fp: Footprint, b: Block): Pt {
  const ux = wx - b.x, uy = wy - b.y;
  const a = b.rotation * DEG, cos = Math.cos(a), sin = Math.sin(a);
  // R(-a) = [[cos, sin], [-sin, cos]]
  const lx = cos * ux + sin * uy;
  const ly = -sin * ux + cos * uy;
  return [fp.center[0] + lx, fp.center[1] + ly];
}

// The SVG transform equivalent of placePoint, so a room's whole scene can be
// rendered in floor-plan space with the SAME renderer the room editor uses.
// translate(b) . rotate(a) . translate(-center) applied to a local point gives
// b + R(a).(p - center), which is placePoint exactly.
export function blockTransform(fp: Footprint, b: Block): string {
  return `translate(${b.x} ${b.y}) rotate(${b.rotation}) translate(${-fp.center[0]} ${-fp.center[1]})`;
}

export function placedWalls(fp: Footprint, b: Block): Poly[] {
  return fp.walls.map(w => ({ ...w, points: w.points.map(pt => placePoint(pt, fp, b)) }));
}
export function placedBBox(fp: Footprint, b: Block) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of placedWalls(fp, b)) for (const [x, y] of w.points) {
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}
// Topmost block under a point (blocks later in the array render on top).
export function hitBlock(fps: Record<string, Footprint>, blocks: Block[], x: number, y: number): Block | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i], fp = fps[b.roomId]; if (!fp) continue;
    const bb = placedBBox(fp, b);
    if (x >= bb.minX && x <= bb.maxX && y >= bb.minY && y <= bb.maxY) return b;
  }
  return null;
}

// Which ROOM is under this point, tested against the real wall polygons rather
// than the bounding box. Dragging a block by its bbox is forgiving and correct;
// dropping an air mover into a room is not, because an L-shaped or rotated room's
// bbox covers space that is not inside the room.
export function hitRoom(fps: Record<string, Footprint>, blocks: Block[], x: number, y: number): Block | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i], fp = fps[b.roomId]; if (!fp) continue;
    for (const w of placedWalls(fp, b)) {
      if (w.points.length >= 3 && pointInPolygon([x, y], w.points)) return b;
    }
  }
  return null;
}

export const snap = (v: number, step = UNITS_PER_FT) => Math.round(v / step) * step;

// ---------------------------------------------------------------------------
// WALL-TO-WALL SNAPPING
// ---------------------------------------------------------------------------
// Grid snapping alone cannot butt two rooms together: a 12 ft 3 in room next to a
// 9 ft 7 in room will never line up on a 1 ft grid. So while a room is dragged we
// look for a wall on ANOTHER room that this room's wall could sit flush against,
// and nudge it the last few inches.
//
// Three gates, and all three matter:
//   1. PARALLEL. Two walls that cross at an angle are not a shared wall.
//      Antiparallel counts: adjacent rooms wound the same way have their shared
//      edges running in opposite directions, so we compare |dot|.
//   2. CLOSE. Within a tolerance, which the caller passes in SCENE units derived
//      from pixels (tol = px / zoom). A fixed scene tolerance feels like glue when
//      zoomed in and is unreachable when zoomed out.
//   3. OVERLAPPING. This is the one that is easy to forget and ruins it. Two walls
//      can be parallel and an inch apart while sitting at opposite ends of the
//      building. Without an overlap test the room teleports across the plan to
//      align with a wall it does not touch.
//
// Then a second, independent pass aligns the CORNERS along the wall direction, so
// rooms end up flush at the ends rather than merely parallel. The two passes act
// on perpendicular axes, so applying both is safe.
export interface WallSnap {
  dx: number; dy: number;
  a: [Pt, Pt];   // the dragged room's snapped edge, in world space (for highlighting)
  b: [Pt, Pt];   // the wall it snapped to
}

const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]];
const dot = (p: Pt, q: Pt) => p[0] * q[0] + p[1] * q[1];
const norm = (p: Pt): Pt => { const l = Math.hypot(p[0], p[1]) || 1; return [p[0] / l, p[1] / l]; };

const PARALLEL_COS = 0.996;   // within about 5 degrees

export function computeWallSnap(
  fps: Record<string, Footprint>,
  blocks: Block[],
  dragged: Block,
  tol: number,
  minOverlap: number
): WallSnap | null {
  const fpD = fps[dragged.roomId]; if (!fpD) return null;
  const mine = placedWalls(fpD, dragged);

  const others: Pt[][] = [];
  for (const b of blocks) {
    if (b.roomId === dragged.roomId) continue;
    const fp = fps[b.roomId]; if (!fp) continue;
    for (const w of placedWalls(fp, b)) others.push(w.points);
  }
  if (!others.length) return null;

  let best: { cost: number; dx: number; dy: number; a: [Pt, Pt]; b: [Pt, Pt] } | null = null;

  for (const w of mine) {
    const n = w.points.length;
    for (let i = 0; i < n; i++) {
      const a1 = w.points[i], a2 = w.points[(i + 1) % n];
      const lenA = Math.hypot(a2[0] - a1[0], a2[1] - a1[1]);
      if (lenA < 1) continue;                       // degenerate edge
      const d1 = norm(sub(a2, a1));
      const n1: Pt = [-d1[1], d1[0]];               // unit normal of this edge

      for (const pts of others) {
        const m = pts.length;
        for (let j = 0; j < m; j++) {
          const b1 = pts[j], b2 = pts[(j + 1) % m];
          const lenB = Math.hypot(b2[0] - b1[0], b2[1] - b1[1]);
          if (lenB < 1) continue;
          const d2 = norm(sub(b2, b1));

          // gate 1: parallel (either direction)
          if (Math.abs(dot(d1, d2)) < PARALLEL_COS) continue;

          // gate 2: close, measured perpendicular to our edge
          const perp = dot(sub(b1, a1), n1);
          if (Math.abs(perp) > tol) continue;

          // gate 3: the two edges actually face each other along the wall
          const sB1 = dot(sub(b1, a1), d1), sB2 = dot(sub(b2, a1), d1);
          const lo = Math.max(0, Math.min(sB1, sB2));
          const hi = Math.min(lenA, Math.max(sB1, sB2));
          if (hi - lo < minOverlap) continue;

          // move our edge onto their line
          let dx = n1[0] * perp, dy = n1[1] * perp;

          // second pass, on the perpendicular axis: pull the CORNERS flush too, so
          // the rooms line up at their ends instead of just running parallel.
          const ends = [sB1, sB2, sB1 - lenA, sB2 - lenA];
          let bestT = 0, bestTAbs = Infinity;
          for (const t of ends) {
            if (Math.abs(t) < bestTAbs && Math.abs(t) <= tol) { bestTAbs = Math.abs(t); bestT = t; }
          }
          if (bestTAbs < Infinity) { dx += d1[0] * bestT; dy += d1[1] * bestT; }

          const cost = Math.abs(perp) + (bestTAbs < Infinity ? bestTAbs * 0.25 : 0);
          if (!best || cost < best.cost) {
            best = {
              cost, dx, dy,
              a: [[a1[0] + dx, a1[1] + dy], [a2[0] + dx, a2[1] + dy]],
              b: [b1, b2]
            };
          }
        }
      }
    }
  }
  if (!best) return null;
  return { dx: best.dx, dy: best.dy, a: best.a, b: best.b };
}

// The largest wall polygon in a scene = the room outline. Used to mark a whole
// floor wet with a polygon that is exact by construction rather than painted.
export function roomOutline(scene: Scene): Poly | null {
  let best: Poly | null = null, bestArea = 0;
  for (const w of scene.walls) {
    if (!w.points || w.points.length < 3) continue;
    let a = 0;
    for (let i = 0; i < w.points.length; i++) {
      const [x1, y1] = w.points[i], [x2, y2] = w.points[(i + 1) % w.points.length];
      a += x1 * y2 - x2 * y1;
    }
    a = Math.abs(a) / 2;
    if (a > bestArea) { bestArea = a; best = w; }
  }
  return best;
}

// A brand-new space (hallway, closet, stairwell) is DRAWN on the floor plan, as a
// rectangle or a true polygon, exactly like a room is drawn in the sketch editor. An
// L-shaped hallway is a real thing in a real house and a width x length box cannot
// express it.
//
// The drawing arrives in FLOOR-PLAN (world) coordinates, but a room's sketch lives in
// its OWN local coordinates, and the block then places it. So we split the polygon
// into a shape plus a placement, chosen so the room appears exactly where it was drawn:
//
//   local  = world - minCorner            (shape, with its min corner at the origin)
//   center = bboxCenter(local) = C - minCorner
//   block  = { x: C[0], y: C[1] }         (C = bbox centre of the drawn polygon)
//
// then placePoint(local) = block + (local - center) = C + (world - C) = world. Exact.
export function sceneFromWorldPolygon(worldPts: Pt[]): { scene: Scene; block: { x: number; y: number; rotation: number } } {
  const xs = worldPts.map(p => p[0]), ys = worldPts.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...xs), maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const local: Pt[] = worldPts.map(p => [p[0] - minX, p[1] - minY]);
  return {
    scene: {
      walls: [{ id: uid(), points: local }],
      wetAreas: [], equipment: [], moisturePoints: [], arrows: [], openings: [],
      floodCuts: [], containments: []
    },
    block: { x: cx, y: cy, rotation: 0 }
  };
}

// Keep saved placements; lay any not-yet-placed rooms out in a left-to-right row
// so nothing stacks on the origin the first time you open the plan.
export function autoArrange(fps: Footprint[], saved: Block[]): Block[] {
  const byId = new Map(saved.map(b => [b.roomId, b]));
  let cursorX = 0;
  const gap = UNITS_PER_FT * 2;
  const out: Block[] = [];
  for (const fp of fps) {
    const cur = byId.get(fp.roomId);
    if (cur) { out.push(cur); continue; }
    out.push({ roomId: fp.roomId, x: cursorX + fp.w / 2, y: 0, rotation: 0 });
    cursorX += fp.w + gap;
  }
  return out;
}