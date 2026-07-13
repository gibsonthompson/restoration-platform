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

// A brand-new space (hallway, closet, stairwell) gets a real rectangular sketch,
// not just length/width numbers, because doors attach to a wallId + edge. It is
// a real room in the structure; it just isn't AFFECTED until someone says so.
export function rectScene(widthFt: number, lengthFt: number): Scene {
  const w = Math.max(1, widthFt) * UNITS_PER_FT;
  const h = Math.max(1, lengthFt) * UNITS_PER_FT;
  return {
    walls: [{ id: uid(), points: [[0, 0], [w, 0], [w, h], [0, h]] }],
    wetAreas: [], equipment: [], moisturePoints: [], arrows: [], openings: [],
    floodCuts: [], containments: []
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