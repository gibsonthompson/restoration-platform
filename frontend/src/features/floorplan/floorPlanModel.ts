// Floor-plan model: a structure's floor plan is a thin *layout* over existing
// room sketches. A "block" is just a room footprint placed at {x, y, rotation};
// geometry is never copied, we read each room's live sketch walls at render time,
// so re-sketching a room updates its block automatically.
import { normalizeScene, UNITS_PER_FT, type Poly, type Pt, type Scene } from '../sketch/sketchModel';

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
export const snap = (v: number, step = UNITS_PER_FT) => Math.round(v / step) * step;

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