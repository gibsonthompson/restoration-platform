// Scene model for the moisture-map / sketch canvas. Stored verbatim in
// resto_sketches.canvas_json. Coordinates live in a fixed virtual space
// (0..1000 on each axis); the editor pans/zooms via the SVG viewBox.

export type EquipType = 'air_mover' | 'dehumidifier' | 'air_scrubber';
export type Pt = [number, number];

export interface Poly { id: string; points: Pt[]; }
export interface Equip { id: string; type: EquipType; x: number; y: number; }

export interface Scene {
  walls: Poly[];       // closed room outlines
  wetAreas: Poly[];    // freehand wet-area polygons (the blue blob)
  equipment: Equip[];  // placed air movers / dehus / scrubbers
}

export const SCENE_SIZE = 1000;
export const emptyScene = (): Scene => ({ walls: [], wetAreas: [], equipment: [] });
export const uid = () => Math.random().toString(36).slice(2, 10);

export const EQUIP_META: Record<EquipType, { label: string; full: string }> = {
  air_mover:     { label: 'AM', full: 'Air Mover' },
  dehumidifier:  { label: 'DH', full: 'Dehumidifier' },
  air_scrubber:  { label: 'AS', full: 'Air Scrubber' }
};

export const ptsStr = (pts: Pt[]) => pts.map(p => `${p[0]},${p[1]}`).join(' ');

// Nearest equipment within a hit radius (scene units). Used for select/drag.
export function hitEquipment(scene: Scene, x: number, y: number, r = 32): Equip | null {
  let best: Equip | null = null, bestD = r * r;
  for (const e of scene.equipment) {
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d <= bestD) { bestD = d; best = e; }
  }
  return best;
}