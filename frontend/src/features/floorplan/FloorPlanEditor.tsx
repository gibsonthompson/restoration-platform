import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Save, RotateCw, Plus, Minus, Grid3x3, DoorOpen, MousePointer2,
  SquarePlus, Droplet, MapPin, Trash2, Check, Magnet, Compass, Ruler, Info, Navigation
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SceneLayers, EquipIcon } from '../sketch/SceneLayers';
import { MeasureSheet } from '../sketch/MeasureSheet';
import { RoomSizeSheet } from '../sketch/RoomSizeSheet';
import { formatFeetInches } from '../../lib/feetInches';
import { viewTransform, screenToScene, panDelta, normRot, type View as VView } from '../sketch/viewTransform';
import {
  normalizeScene, uid, nearestWallEdge, hitOpening, edgeLenFt, ptsStr,
  OPENING_DEFAULT_FT, OPENING_DEFAULT_HEIGHT_FT,
  OPENING_DESC, OPENING_LABEL, UNITS_PER_FT, SCENE_SIZE,
  MATERIALS_BY_SURFACE, EQUIP_META,
  type EquipType, type OpeningKind, type Pt, type Scene
} from '../sketch/sketchModel';
import {
  footprintFromRoom, placedWalls, placedBBox, blockTransform, hitBlock, hitRoom,
  unplacePoint, roomOutline, sceneFromWorldPolygon, snap, autoArrange, computeWallSnap,
  type Block, type Footprint, type WallSnap
} from './floorPlanModel';
import FloorPlanLegend from './FloorPlanLegend';

interface RoomRow { id: string; name: string; length_ft: number | null; width_ft: number | null; height_ft?: number | null; affected?: boolean | null; sort_order?: number | null }
type GKind = 'idle' | 'pan' | 'drag' | 'place' | 'rect';
type Tool = 'select' | 'space' | 'door' | 'window' | 'opening' | 'missing_wall' | 'equip' | 'origin' | 'wet';
type SpaceMode = 'rect' | 'poly';

// The opening being measured. When `targets` is set this is a RE-MEASURE of openings that
// already exist; otherwise `local` and `world` describe a brand new one that is in no scene
// yet. Nothing is written until both numbers are real, because an opening with no measured
// height is an ASSUMPTION, and an assumption prints a warning on the sheet the adjuster reads.
//
// `targets` is a LIST because a door on a wall between two rooms exists as one opening
// record in EACH room. Editing only the tapped one would leave a 3 ft door on one side and a
// 2 ft 6 in door on the other, and the two wall areas would disagree.
interface OpeningDraft {
  roomId: string; kind: OpeningKind;
  edgeLenFt: number; widthFt: number; heightFt?: number;
  stage: 'width' | 'height';
  local?: Pt; world?: Pt;                          // placing a new one
  targets?: { roomId: string; id: string }[];      // re-measuring existing ones
}
type OpeningRef = { roomId: string; id: string };
interface OpeningSelState { targets: OpeningRef[] }

// ---------------------------------------------------------------------------
// RESIZING A ROOM FROM THE PLAN
// ---------------------------------------------------------------------------
// A room's size lives in its OWN sketch, in its own coordinates. The floor plan is a
// second lens on that same data, so resizing a room here has to rewrite the room's
// canvas_json, not some layout-only copy of it. Anything else and the plan and the
// sketch drift apart, and the estimate is built off whichever one you opened last.
//
// Rectangles only, and that is deliberate. Scaling an L-shaped hallway to a width and a
// length silently changes wall lengths a tech never touched. If the outline is not a
// rectangle we say so and send them to the sketch, where every wall can be typed.
const RECT_TOL = 2;   // scene units. 2 units is 0.05 ft, well under an inch.

function outlineBBox(scene: Scene): { x0: number; y0: number; w: number; h: number } | null {
  const poly = roomOutline(scene);
  if (!poly || !poly.points || poly.points.length < 3) return null;
  const xs = poly.points.map(p => p[0]), ys = poly.points.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x0, y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

function isAxisRect(pts: Pt[]): boolean {
  if (!pts || pts.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
    if (dx > RECT_TOL && dy > RECT_TOL) return false;    // neither horizontal nor vertical
    if (dx <= RECT_TOL && dy <= RECT_TOL) return false;  // degenerate edge
  }
  return true;
}

// Scale the room's GEOMETRY about its top-left corner. Everything positioned inside the
// room moves with it, so an air mover that was in the middle stays in the middle.
//
// What does NOT scale: opening widths, flood cut lengths and containment sizes. Those are
// REAL-WORLD MEASUREMENTS in feet. A 3 ft door is 3 ft whether the room is 12 ft or 14 ft
// across, and quietly stretching it to 3 ft 6 in because someone corrected the room size
// would put a fabricated number on a drywall line.
function scaleScene(scene: Scene, x0: number, y0: number, sx: number, sy: number): Scene {
  const P = (p: Pt): Pt => [x0 + (p[0] - x0) * sx, y0 + (p[1] - y0) * sy];
  return {
    ...scene,
    walls: (scene.walls ?? []).map(w => ({ ...w, points: w.points.map(P) })),
    wetAreas: (scene.wetAreas ?? []).map(w => ({
      ...w,
      points: (w.points ?? []).map(P),
      strokes: w.strokes ? w.strokes.map(st => st.map(P)) : undefined,
      brush: w.brush != null ? w.brush * ((sx + sy) / 2) : undefined
    })),
    equipment: (scene.equipment ?? []).map(e => { const q = P([e.x, e.y]); return { ...e, x: q[0], y: q[1] }; }),
    moisturePoints: (scene.moisturePoints ?? []).map(m => { const q = P([m.x, m.y]); return { ...m, x: q[0], y: q[1] }; }),
    arrows: (scene.arrows ?? []).map(a => ({ ...a, from: P(a.from), to: P(a.to) })),
    containments: (scene.containments ?? []).map(c => {
      const out = { ...c };
      if (c.x != null && c.y != null) { const q = P([c.x, c.y]); out.x = q[0]; out.y = q[1]; }
      if (c.from && c.to) { out.from = P(c.from); out.to = P(c.to); }
      return out;
    }),
    originOfLoss: scene.originOfLoss ? P(scene.originOfLoss) : undefined
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const OFF = 50;          // offset cursor: the target sits up-left of the finger, never under the thumb
const SNAP_PX = 18;      // wall-snap reach, in SCREEN pixels (scaled to scene units by zoom)
const MIN_OVERLAP = UNITS_PER_FT;
const ASSUMED_CEILING_FT = 8;   // matches roomDimensions' own fallback, and it warns when it uses it

const ftLabel = (u: number) => `${Math.round(u / UNITS_PER_FT)} ft`;
const dimFt = (u: number) => `${(u / UNITS_PER_FT).toFixed(1)} ft`;

// Starting points a tech taps instead of types. The FIRST entry of each is Xactimate's
// own default, decoded from the reference file's SKETCHDOCUMENTPREFS, so the common case
// is confirming a number rather than correcting one.
const WIDTH_QUICK: Record<OpeningKind, { label: string; ft: number }[]> = {
  door:         [{ label: "2' 6\"", ft: 2.5 }, { label: "2' 8\"", ft: 2 + 8 / 12 }, { label: "3' 0\"", ft: 3 }],
  window:       [{ label: "2' 8\"", ft: 2 + 8 / 12 }, { label: "3' 0\"", ft: 3 }, { label: "4' 0\"", ft: 4 }],
  opening:      [{ label: "4' 0\"", ft: 4 }, { label: "5' 0\"", ft: 5 }, { label: "6' 0\"", ft: 6 }],
  missing_wall: [{ label: "6' 0\"", ft: 6 }, { label: "8' 0\"", ft: 8 }, { label: "10' 0\"", ft: 10 }]
};
const HEIGHT_QUICK: Record<OpeningKind, { label: string; ft: number }[]> = {
  door:         [{ label: "6' 8\"", ft: 6 + 8 / 12 }, { label: "7' 0\"", ft: 7 }, { label: "8' 0\"", ft: 8 }],
  window:       [{ label: "3' 0\"", ft: 3 }, { label: "4' 0\"", ft: 4 }, { label: "5' 0\"", ft: 5 }],
  opening:      [{ label: "6' 8\"", ft: 6 + 8 / 12 }, { label: "7' 0\"", ft: 7 }, { label: "8' 0\"", ft: 8 }],
  missing_wall: []
};

// Palette stickers: the same thing that lands on the plan, so a tech sees exactly what
// they are dragging. Equipment reuses the real EquipIcon art exported by SceneLayers
// rather than a second set of drawings that could drift out of step.
function PlanGlyph({ kind, size = 26 }: { kind: string; size?: number }) {
  if (kind === 'air_mover' || kind === 'dehumidifier' || kind === 'air_scrubber') {
    const m = EQUIP_META[kind as EquipType];
    return (
      <svg width={size} height={size} viewBox="-13 -13 26 26">
        <circle r={12} fill={m.fill} stroke={m.ring} strokeWidth={1.5} />
        <EquipIcon type={kind as EquipType} />
      </svg>
    );
  }
  const shell = (inner: any, fill = '#475569', ring = '#334155') => (
    <svg width={size} height={size} viewBox="-13 -13 26 26">
      <circle r={12} fill={fill} stroke={ring} strokeWidth={1.5} />{inner}
    </svg>
  );
  if (kind === 'door') return shell(
    <g stroke="#fff" fill="none" strokeLinecap="round">
      <line x1={-5} y1={7} x2={-5} y2={-7} strokeWidth={2.6} />
      <path d="M-5 -7 A12 12 0 0 1 7 5" strokeWidth={1.6} strokeDasharray="2 2" />
    </g>);
  if (kind === 'window') return shell(
    <g stroke="#fff" strokeWidth={1.8} strokeLinecap="round" fill="none">
      <rect x={-6} y={-4.5} width={12} height={9} rx={1} />
      <line x1={0} y1={-4.5} x2={0} y2={4.5} /><line x1={-6} y1={0} x2={6} y2={0} />
    </g>);
  // A cased opening still has a frame, so the jambs are drawn. That is the whole
  // difference between it and a missing wall, and the glyph should say so.
  if (kind === 'opening') return shell(
    <g stroke="#fff" strokeWidth={2.6} strokeLinecap="round">
      <line x1={-8} y1={0} x2={-3.5} y2={0} /><line x1={3.5} y1={0} x2={8} y2={0} />
      <line x1={-3.5} y1={-4} x2={-3.5} y2={4} strokeWidth={1.8} />
      <line x1={3.5} y1={-4} x2={3.5} y2={4} strokeWidth={1.8} />
    </g>);
  // A missing wall is the ABSENCE of wall: no jambs, and the gap is drawn as nothing.
  if (kind === 'missing_wall') return shell(
    <g stroke="#fff" strokeLinecap="round" fill="none">
      <line x1={-9} y1={0} x2={-4} y2={0} strokeWidth={2.8} />
      <line x1={4} y1={0} x2={9} y2={0} strokeWidth={2.8} />
      <line x1={-4} y1={0} x2={4} y2={0} strokeWidth={1.4} strokeDasharray="1.5 2.5" opacity={0.75} />
    </g>, '#B45309', '#7C2D12');
  if (kind === 'origin') return shell(
    <g stroke="#fff" strokeWidth={3} strokeLinecap="round">
      <line x1={-5} y1={-5} x2={5} y2={5} /><line x1={5} y1={-5} x2={-5} y2={5} />
    </g>, '#DC2626', '#991B1B');
  return shell(<circle r={5} fill="#fff" />);
}

// Structure floor-plan canvas. TWO things at once, and that is the design:
//   1. A LAYOUT of rooms (drag, rotate, snap flush). Saved to resto_structure_floorplans.
//   2. An EDITOR onto each room's own sketch. A door, air mover, or wet floor placed
//      here is written into that room's resto_sketches.canvas_json, in the room's own
//      coordinates, exactly as if placed in the moisture map. One source of truth: the
//      room editor, the S500 check, the report, and the Xactimate export all read it.
//
// The interaction is held to the SAME standard as the room editor. Spaces are DRAWN
// (rectangle drag, or the crosshair + Add corner method for any shape), openings and
// equipment are DRAGGED out of the palette with a live ghost showing exactly where they
// will land, and an opening is MEASURED on drop instead of assumed. Anything less is a
// worse tool for the same job.
export function FloorPlanEditor({ structureId, structureName, claimId, orgId, onClose }: {
  structureId: string; structureName: string; claimId: string; orgId: string; onClose: (saved: boolean) => void;
}) {
  const nav = useNavigate();
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [footprints, setFootprints] = useState<Record<string, Footprint>>({});
  const [scenes, setScenes] = useState<Record<string, Scene>>({});
  const [sketchIds, setSketchIds] = useState<Record<string, string | undefined>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [equipType, setEquipType] = useState<EquipType>('air_mover');
  const [doorKind, setDoorKind] = useState<OpeningKind>('door');
  const [spaceMode, setSpaceMode] = useState<SpaceMode>('rect');
  const [showGrid, setShowGrid] = useState(true);
  const [magnet, setMagnet] = useState(true);
  const [showLegend, setShowLegend] = useState(false);
  const [wallSnap, setWallSnap] = useState<WallSnap | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<VView>({ tx: 0, ty: 0, k: 1, rot: 0 });
  const [active, setActive] = useState<{ scene: Pt; px: Pt } | null>(null);
  const [draft, setDraft] = useState<{ kind: 'rect'; a: Pt; b: Pt } | { kind: 'poly'; pts: Pt[] } | null>(null);
  const [paletteGhost, setPaletteGhost] = useState<{ kind: string; x: number; y: number; over: boolean } | null>(null);
  const [nameSheet, setNameSheet] = useState<{ points: Pt[]; name: string } | null>(null);
  const [wetSheet, setWetSheet] = useState<{ roomId: string; material: string; disposition: 'dry' | 'remove' } | null>(null);
  const [openSheet, setOpenSheet] = useState<OpeningDraft | null>(null);
  const [selOpening, setSelOpening] = useState<OpeningSelState | null>(null);
  const [spaceSizeSheet, setSpaceSizeSheet] = useState(false);
  const [roomSizeSheet, setRoomSizeSheet] = useState<string | null>(null);   // roomId being resized
  // Rooms whose width_ft / length_ft must be written back to resto_rooms on save.
  const [dimsDirty, setDimsDirty] = useState<Set<string>>(new Set());
  const [structCeiling, setStructCeiling] = useState<number | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const inited = useRef(false);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const g = useRef<{ kind: GKind; downPx: Pt; lastPx: Pt; moved: boolean; roomId?: string; grab?: Pt; openHit?: OpeningRef[] }>(
    { kind: 'idle', downPx: [0, 0], lastPx: [0, 0], moved: false });
  const pdrag = useRef<{ id: number; kind: string; startX: number; startY: number; dragging: boolean } | null>(null);

  const markDirty = (roomId: string) => setDirty(d => new Set(d).add(roomId));

  useEffect(() => {
    (async () => {
      const { data: rws } = await supabase.from('resto_rooms')
        .select('id, name, length_ft, width_ft, height_ft, affected, sort_order').eq('structure_id', structureId).order('sort_order');
      const rs = (rws as RoomRow[]) ?? [];
      const ids = rs.map(r => r.id);
      const latest: Record<string, any> = {};
      const sids: Record<string, string | undefined> = {};
      if (ids.length) {
        const { data: sk } = await supabase.from('resto_sketches')
          .select('id, room_id, canvas_json, created_at').in('room_id', ids).order('created_at', { ascending: false });
        for (const row of ((sk as any[]) ?? [])) {
          if (!(row.room_id in latest)) { latest[row.room_id] = row.canvas_json; sids[row.room_id] = row.id; }
        }
      }
      const fps: Record<string, Footprint> = {};
      const scs: Record<string, Scene> = {};
      for (const r of rs) {
        fps[r.id] = footprintFromRoom(r, latest[r.id] ?? null);
        scs[r.id] = normalizeScene(latest[r.id] ?? null);
      }
      // The level's default ceiling height. An opening can never be taller than the wall
      // it sits in, and roomDimensions silently clamps it if it is, which would hide a typo.
      const { data: st } = await supabase.from('resto_structures')
        .select('default_ceiling_height_ft').eq('id', structureId).maybeSingle();
      setStructCeiling((st as any)?.default_ceiling_height_ft ?? null);

      const { data: fp } = await supabase.from('resto_structure_floorplans')
        .select('layout_json').eq('structure_id', structureId).limit(1);
      const saved: Block[] = (fp && (fp[0] as any)?.layout_json?.blocks) ?? [];
      setRooms(rs); setFootprints(fps); setScenes(scs); setSketchIds(sids);
      setBlocks(autoArrange(rs.map(r => fps[r.id]), saved));
      setLoading(false);
    })();
  }, [structureId]);

  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (inited.current || !size.w || !size.h || loading) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of blocks) { const fp = footprints[b.roomId]; if (!fp) continue; const bb = placedBBox(fp, b); minX = Math.min(minX, bb.minX); minY = Math.min(minY, bb.minY); maxX = Math.max(maxX, bb.maxX); maxY = Math.max(maxY, bb.maxY); }
    if (!isFinite(minX)) { setView({ k: 0.6, rot: 0, tx: size.w / 2, ty: size.h / 2 }); inited.current = true; return; }
    const cw = (maxX - minX) || 1, ch = (maxY - minY) || 1, pad = 70;
    const k = Math.min((size.w - pad) / cw, (size.h - pad) / ch, 3);
    setView({ k, rot: 0, tx: (size.w - cw * k) / 2 - minX * k, ty: (size.h - ch * k) / 2 - minY * k });
    inited.current = true;
  }, [size, loading, blocks, footprints]);

  function toPixel(cx: number, cy: number): Pt {
    const svg = svgRef.current; const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return [0, 0];
    const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
    const r = p.matrixTransform(ctm.inverse()); return [r.x, r.y];
  }
  // Un-rotates as well as un-scales, so a tap lands where the finger is even when
  // the plan is turned.
  function pxToScene(p: Pt): Pt { return screenToScene(p, viewRef.current, size.w, size.h); }
  const clampK = (k: number) => Math.min(20, Math.max(0.05, k));
  const snapPt = (p: Pt): Pt => [snap(p[0]), snap(p[1])];

  // Ceiling height for a room: its own override, then the level default, then the same
  // 8 ft roomDimensions falls back to (and warns about).
  const ceilingFtFor = (roomId: string) => {
    const r = rooms.find(x => x.id === roomId);
    const own = r?.height_ft != null ? Number(r.height_ft) : null;
    return own ?? structCeiling ?? ASSUMED_CEILING_FT;
  };
  const ceilingIsAssumed = (roomId: string) => {
    const r = rooms.find(x => x.id === roomId);
    return (r?.height_ft == null) && structCeiling == null;
  };

  // ---- writing into a room's OWN sketch ------------------------------------
  const patchScene = (roomId: string, fn: (s: Scene) => Scene) => {
    setScenes(sc => ({ ...sc, [roomId]: fn(sc[roomId] ?? normalizeScene(null)) }));
    markDirty(roomId);
  };

  // Which openings sit under this world point? Plural, because a door on a shared wall is
  // one record in EACH room. The same trick placement uses: push the world point back into
  // each room's own coordinates and ask that room's scene.
  function hitOpeningsWorld(world: Pt): OpeningRef[] {
    const out: OpeningRef[] = [];
    for (const b of blocks) {
      const fp = footprints[b.roomId]; const sc = scenes[b.roomId];
      if (!fp || !sc) continue;
      const lp = unplacePoint(world, fp, b);
      const op = hitOpening(sc, lp[0], lp[1], 30);
      if (op) out.push({ roomId: b.roomId, id: op.id });
    }
    return out;
  }

  // The tapped opening, read back out of the scene so the displayed size is always the
  // stored size and never a stale copy.
  const selOpen = (() => {
    const t = selOpening?.targets[0];
    if (!t) return null;
    const op = (scenes[t.roomId]?.openings ?? []).find(o => o.id === t.id);
    return op ? { roomId: t.roomId, op } : null;
  })();
  const selOpenSize = !selOpen ? ''
    : selOpen.op.kind === 'missing_wall' ? `${formatFeetInches(selOpen.op.widthFt)} wide, full height`
    : selOpen.op.heightFt ? `${formatFeetInches(selOpen.op.widthFt)} \u00d7 ${formatFeetInches(selOpen.op.heightFt)}`
    : `${formatFeetInches(selOpen.op.widthFt)}, height not measured`;

  function measureSelectedOpening() {
    if (!selOpen || !selOpening) return;
    const sc = scenes[selOpen.roomId];
    setOpenSheet({
      targets: selOpening.targets,
      roomId: selOpen.roomId, kind: selOpen.op.kind,
      edgeLenFt: edgeLenFt(sc, selOpen.op.wallId, selOpen.op.edge),
      widthFt: selOpen.op.widthFt, heightFt: selOpen.op.heightFt,
      stage: 'width'
    });
  }

  function deleteSelectedOpening() {
    if (!selOpening) return;
    for (const t of selOpening.targets) {
      patchScene(t.roomId, s => ({ ...s, openings: (s.openings ?? []).filter(o => o.id !== t.id) }));
    }
    setSelOpening(null);
  }

  // Place an element at a world point: find the room under it, invert the block
  // transform to get that point in the room's OWN coordinates, then write it there.
  function commitPlace(world: Pt, kindOverride?: string) {
    const kind = kindOverride ?? (tool === 'equip' ? equipType : isOpeningKind(tool) ? doorKind : tool);
    const hit = hitRoom(footprints, blocks, world[0], world[1]);
    if (!hit) return;
    const fp = footprints[hit.roomId]; if (!fp) return;
    const local = unplacePoint(world, fp, hit);

    if (kind === 'air_mover' || kind === 'dehumidifier' || kind === 'air_scrubber') {
      patchScene(hit.roomId, s => ({ ...s, equipment: [...s.equipment, { id: uid(), type: kind as EquipType, x: local[0], y: local[1] }] }));
      return;
    }
    if (kind === 'origin') { patchScene(hit.roomId, s => ({ ...s, originOfLoss: local })); return; }
    if (isOpeningKind(kind)) { beginOpening(hit.roomId, local, world, kind as OpeningKind); return; }
    if (kind === 'wet') { setWetSheet({ roomId: hit.roomId, material: 'Carpet', disposition: 'dry' }); return; }
  }

  // An opening is a MEASUREMENT, not a decoration. Wall area is
  //   (perimeter x ceiling height) - SUM(width x height)
  // so a default-sized door is a made-up deduction on a real drywall line. Find the wall,
  // then ask for the numbers before anything is written.
  function beginOpening(roomId: string, local: Pt, world: Pt, kind: OpeningKind) {
    const sc = scenes[roomId]; if (!sc) return;
    const near = nearestWallEdge(sc, local[0], local[1]);
    if (!near || near.dist >= 45 || near.edgeLen <= UNITS_PER_FT) return;   // not on a wall: nothing to attach to
    setOpenSheet({
      roomId, local, world, kind,
      edgeLenFt: near.edgeLen / UNITS_PER_FT,
      widthFt: OPENING_DEFAULT_FT[kind],
      stage: 'width'
    });
  }

  // A door on a wall between two rooms is physically in BOTH rooms, but openings[] is
  // per-room. Write it into the room that was hit, then mirror it into any other room
  // whose wall runs through the same world point, carrying the SAME measured width and
  // height. A door visible from only one side is wrong, and a door that is 3 ft on one
  // side and 2 ft 6 in on the other is worse.
  //
  // With `targets`, this RE-MEASURES openings that already exist rather than adding more,
  // and it updates every room the opening appears in, so the two halves cannot drift apart.
  function commitOpening(d: OpeningDraft, heightFt?: number) {
    const { kind, widthFt } = d;

    // Keep the opening inside its own wall after a width change. Clamping against the OLD
    // width and then widening to 3 ft could push it off the end of the wall it sits on.
    const clampT = (s: Scene, o: { wallId: string; edge: number; t: number }) => {
      const w = s.walls.find(x => x.id === o.wallId);
      if (!w) return o.t;
      const n = w.points.length;
      const a = w.points[o.edge], b = w.points[(o.edge + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const halfFrac = Math.min(0.45, (widthFt * UNITS_PER_FT / 2) / len);
      return Math.max(halfFrac, Math.min(1 - halfFrac, o.t));
    };

    if (d.targets) {
      for (const t of d.targets) {
        patchScene(t.roomId, s => ({
          ...s,
          openings: (s.openings ?? []).map(o => o.id === t.id
            ? { ...o, widthFt, heightFt, t: clampT(s, o) }
            : o)
        }));
      }
      return;
    }

    if (!d.local || !d.world) return;
    const put = (rid: string, lp: Pt) => {
      const sc = scenes[rid]; if (!sc) return false;
      const near = nearestWallEdge(sc, lp[0], lp[1]);
      if (!near || near.dist >= 45 || near.edgeLen <= UNITS_PER_FT) return false;
      const halfFrac = Math.min(0.45, (widthFt * UNITS_PER_FT / 2) / near.edgeLen);
      const t = Math.max(halfFrac, Math.min(1 - halfFrac, near.t));
      patchScene(rid, s => ({
        ...s,
        openings: [...(s.openings ?? []), { id: uid(), wallId: near.wallId, edge: near.edge, t, widthFt, heightFt, kind }]
      }));
      return true;
    };
    if (!put(d.roomId, d.local)) return;
    for (const b of blocks) {
      if (b.roomId === d.roomId) continue;
      const fp2 = footprints[b.roomId]; if (!fp2) continue;
      put(b.roomId, unplacePoint(d.world, fp2, b));
    }
  }

  // Whole-floor wet, measured from the room's own outline so the square footage is exact
  // by construction. Partial areas belong in the room's moisture map, where you can be
  // precise: wet SF is what drives extraction and tear-out dollars.
  function applyWet() {
    if (!wetSheet) return;
    const { roomId, material, disposition } = wetSheet;
    const scene = scenes[roomId];
    const outline = scene ? roomOutline(scene) : null;
    if (!outline) { setWetSheet(null); return; }
    patchScene(roomId, s => ({
      ...s,
      wetAreas: [...s.wetAreas, { id: uid(), points: outline.points.map(p => [p[0], p[1]] as Pt), surface: 'floor' as const, material, disposition }]
    }));
    setWetSheet(null);
  }

  // ---- drawing a new space: rectangle OR true polygon ----------------------
  async function createSpace(worldPts: Pt[], name: string) {
    setNameSheet(null);
    setSaving(true);
    try {
      const { scene, block } = sceneFromWorldPolygon(worldPts);
      const nextSort = Math.max(0, ...rooms.map(r => r.sort_order ?? 0)) + 1;
      const xs = worldPts.map(p => p[0]), ys = worldPts.map(p => p[1]);
      const wFt = (Math.max(...xs) - Math.min(...xs)) / UNITS_PER_FT;
      const lFt = (Math.max(...ys) - Math.min(...ys)) / UNITS_PER_FT;

      const { data: room, error } = await supabase.from('resto_rooms')
        .insert({
          org_id: orgId, structure_id: structureId, name: name.trim() || 'Hallway',
          sort_order: nextSort, affected: false,
          width_ft: Math.round(wFt * 10) / 10, length_ft: Math.round(lFt * 10) / 10
        })
        .select('id, name, length_ft, width_ft, height_ft, affected, sort_order').single();
      if (error || !room) { alert('Could not add the space: ' + (error?.message ?? 'unknown error')); return; }

      const { data: sk } = await supabase.from('resto_sketches')
        .insert({ org_id: orgId, room_id: (room as any).id, type: 'moisture_map', canvas_json: scene as any })
        .select('id').single();

      const r = room as RoomRow;
      const fp = footprintFromRoom(r, scene);
      setRooms(rs => [...rs, r]);
      setFootprints(f => ({ ...f, [r.id]: fp }));
      setScenes(s => ({ ...s, [r.id]: scene }));
      setSketchIds(s => ({ ...s, [r.id]: (sk as any)?.id }));
      setBlocks(bs => [...bs, { roomId: r.id, ...block }]);
      setSelected(r.id);
      setTool('select');
      setDraft(null);
    } finally { setSaving(false); }
  }

  // Type the two measurements and the space draws itself, same as the room editor. The
  // rectangle lands centred on what the tech is looking at, with its ORIGIN snapped rather
  // than its size, so the width and length stay exactly what was typed. It then goes
  // through the normal naming flow, because an unnamed space on a floor plan is useless.
  function createRectExact(widthFt: number, lengthFt: number) {
    const w = widthFt * UNITS_PER_FT, h = lengthFt * UNITS_PER_FT;
    const c = size.w ? pxToScene([size.w / 2, size.h / 2]) : ([0, 0] as Pt);
    const x = snap(c[0] - w / 2), y = snap(c[1] - h / 2);
    setSpaceSizeSheet(false);
    setDraft(null);
    setNameSheet({ points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], name: '' });
  }

  // RESIZE AN EXISTING ROOM, and have it land in the room's own sketch.
  //
  // With no sketch yet, the typed size CREATES one: tap a placeholder room on the plan,
  // type 12 x 10, and it becomes a real drawn room with a real outline. That is the fastest
  // path from an empty claim to a measurable one.
  function applyRoomSize(roomId: string, widthFt: number, lengthFt: number) {
    const scene = scenes[roomId] ?? normalizeScene(null);
    const W = widthFt * UNITS_PER_FT, H = lengthFt * UNITS_PER_FT;
    const outline = roomOutline(scene);

    let next: Scene;
    if (!outline || !outline.points || outline.points.length < 3) {
      const x0 = (SCENE_SIZE - W) / 2, y0 = (SCENE_SIZE - H) / 2;
      next = { ...scene, walls: [...(scene.walls ?? []), { id: uid(), points: [[x0, y0], [x0 + W, y0], [x0 + W, y0 + H], [x0, y0 + H]] as Pt[] }] };
    } else if (isAxisRect(outline.points)) {
      const bb = outlineBBox(scene);
      if (!bb || bb.w < 1 || bb.h < 1) return;
      next = scaleScene(scene, bb.x0, bb.y0, W / bb.w, H / bb.h);
    } else {
      alert('This room is not a rectangle, so it cannot be set to a single width and length without changing the shape a tech drew. Open the room sketch and type each wall length there.');
      setRoomSizeSheet(null);
      return;
    }

    setScenes(sc => ({ ...sc, [roomId]: next }));
    markDirty(roomId);
    setDimsDirty(d => new Set(d).add(roomId));

    const room = rooms.find(r => r.id === roomId);
    if (room) {
      const nr: RoomRow = { ...room, width_ft: round2(widthFt), length_ft: round2(lengthFt) };
      setRooms(rs => rs.map(r => (r.id === roomId ? nr : r)));
      setFootprints(f => ({ ...f, [roomId]: footprintFromRoom(nr, next) }));
    }
    setRoomSizeSheet(null);
  }

  function addPolyCorner() {
    if (!size.w) return;
    const p = snapPt(pxToScene([size.w / 2, size.h / 2]));
    const d = draft;
    if (d?.kind === 'poly' && d.pts.length >= 3 && Math.hypot(p[0] - d.pts[0][0], p[1] - d.pts[0][1]) < 40) { closePoly(); return; }
    setDraft(d?.kind === 'poly' ? { kind: 'poly', pts: [...d.pts, p] } : { kind: 'poly', pts: [p] });
  }
  function undoPolyPoint() {
    setDraft(d => (d?.kind === 'poly' ? (d.pts.length <= 1 ? null : { kind: 'poly', pts: d.pts.slice(0, -1) }) : d));
  }
  function closePoly() {
    if (draft?.kind !== 'poly' || draft.pts.length < 3) return;
    setNameSheet({ points: draft.pts, name: '' });
  }

  async function toggleAffected() {
    if (!selected) return;
    const r = rooms.find(x => x.id === selected); if (!r) return;
    const next = !(r.affected !== false);
    const { error } = await supabase.from('resto_rooms').update({ affected: next }).eq('id', r.id);
    if (error) { alert('Could not update the room: ' + error.message); return; }
    setRooms(rs => rs.map(x => x.id === r.id ? { ...x, affected: next } : x));
  }

  // ---- canvas gestures -----------------------------------------------------
  const isOpening = isOpeningKind(tool);
  const isPlace = tool === 'equip' || tool === 'origin';
  const isDroppable = isOpening || isPlace || tool === 'wet';

  function onDown(e: React.PointerEvent) {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]; const pa = toPixel(a.x, a.y), pb = toPixel(b.x, b.y);
      pinch.current = { dist: Math.hypot(pa[0] - pb[0], pa[1] - pb[1]), cx: (pa[0] + pb[0]) / 2, cy: (pa[1] + pb[1]) / 2 };
      g.current.kind = 'idle'; setActive(null);
      if (draft?.kind === 'rect') setDraft(null);
      return;
    }
    const px = toPixel(e.clientX, e.clientY); const s = pxToScene(px);
    const pxO = toPixel(e.clientX - OFF, e.clientY - OFF); const sO = pxToScene(pxO);
    g.current.downPx = px; g.current.lastPx = px; g.current.moved = false;

    if (tool === 'space') {
      if (spaceMode === 'poly') { g.current.kind = 'pan'; }   // crosshair method: finger pans, button drops corners
      else { const p = snapPt(s); g.current.kind = 'rect'; setDraft({ kind: 'rect', a: p, b: p }); setActive({ scene: p, px }); }
      return;
    }
    if (isDroppable) { g.current.kind = 'place'; setActive({ scene: sO, px: pxO }); return; }

    // An opening under the finger is remembered, but it does NOT take over the gesture:
    // a drag still moves the room, and only a clean tap selects the door. Grabbing a room
    // by its doorway is a normal way to pick it up.
    const oh = hitOpeningsWorld(s);
    g.current.openHit = oh.length ? oh : undefined;

    const hit = hitBlock(footprints, blocks, s[0], s[1]);
    if (hit) { setSelected(hit.roomId); g.current.kind = 'drag'; g.current.roomId = hit.roomId; g.current.grab = [s[0] - hit.x, s[1] - hit.y]; }
    else { setSelected(null); g.current.kind = 'pan'; }
  }

  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) { doPinch(); return; }
    const px = toPixel(e.clientX, e.clientY);
    const dx = px[0] - g.current.lastPx[0], dy = px[1] - g.current.lastPx[1];
    if (!g.current.moved && Math.hypot(px[0] - g.current.downPx[0], px[1] - g.current.downPx[1]) > 4) g.current.moved = true;
    const pxO = toPixel(e.clientX - OFF, e.clientY - OFF); const sO = pxToScene(pxO);

    if (g.current.kind === 'place') setActive({ scene: sO, px: pxO });
    else if (g.current.kind === 'rect') {
      const p = snapPt(pxToScene(px));
      setDraft(d => (d && d.kind === 'rect' ? { ...d, b: p } : d));
      setActive({ scene: p, px });
    }
    else if (g.current.kind === 'pan') { const [pdx, pdy] = panDelta([dx, dy], viewRef.current); setView(v => ({ ...v, tx: v.tx + pdx, ty: v.ty + pdy })); }
    else if (g.current.kind === 'drag' && g.current.roomId) {
      const s = pxToScene(px); const id = g.current.roomId, grab = g.current.grab!;
      const raw = { x: s[0] - grab[0], y: s[1] - grab[1] };
      setBlocks(bs => {
        const moved = bs.map(b => b.roomId === id ? { ...b, ...raw } : b);
        const me = moved.find(b => b.roomId === id)!;
        // Tolerance is derived from PIXELS, not scene units. A fixed scene tolerance is
        // glue when zoomed in and unreachable when zoomed out.
        const res = magnet ? computeWallSnap(footprints, moved, me, SNAP_PX / viewRef.current.k, MIN_OVERLAP) : null;
        setWallSnap(res);
        if (!res) return moved;
        return moved.map(b => b.roomId === id ? { ...b, x: b.x + res.dx, y: b.y + res.dy } : b);
      });
    }
    g.current.lastPx = px;
  }

  function onUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size === 1) { const [p] = [...pointers.current.values()]; pinch.current = null; g.current.kind = 'pan'; g.current.lastPx = toPixel(p.x, p.y); g.current.moved = true; }
      else if (pointers.current.size === 0) { pinch.current = null; g.current.kind = 'idle'; }
      return;
    }
    if (pointers.current.size > 0) return;

    if (g.current.kind === 'rect' && draft?.kind === 'rect') {
      const { a, b } = draft;
      if (Math.abs(b[0] - a[0]) >= UNITS_PER_FT && Math.abs(b[1] - a[1]) >= UNITS_PER_FT) {
        setNameSheet({ points: [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]], name: '' });
      } else setDraft(null);
    }
    else if (g.current.kind === 'place' && active) commitPlace(active.scene);
    else if (g.current.kind === 'drag' && g.current.roomId && g.current.moved) {
      const id = g.current.roomId;
      // Do NOT grid-snap over a wall snap: rounding to the nearest foot would break the
      // flush edge we just achieved, and a 12 ft 3 in room next to a 9 ft 7 in room can
      // never be flush on a 1 ft grid. Grid snap is the free-placement fallback only.
      if (!wallSnap) setBlocks(bs => bs.map(b => b.roomId === id ? { ...b, x: snap(b.x), y: snap(b.y) } : b));
    }

    // A tap that did not move: select the opening under it, or clear the selection.
    if (tool === 'select' && !g.current.moved) {
      if (g.current.openHit) { setSelOpening({ targets: g.current.openHit }); setSelected(null); }
      else setSelOpening(null);
    }

    g.current.kind = 'idle'; g.current.roomId = undefined; g.current.grab = undefined; g.current.openHit = undefined;
    setActive(null); setWallSnap(null);
  }

  function doPinch() {
    const [a, b] = [...pointers.current.values()]; const pa = toPixel(a.x, a.y), pb = toPixel(b.x, b.y);
    const dist = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]); const cx = (pa[0] + pb[0]) / 2, cy = (pa[1] + pb[1]) / 2;
    const pv = pinch.current!, v = viewRef.current; const k = clampK(v.k * (dist / (pv.dist || dist))); const f = k / v.k;
    let tx = cx - (cx - v.tx) * f, ty = cy - (cy - v.ty) * f; tx += cx - pv.cx; ty += cy - pv.cy;
    setView(vv => ({ ...vv, tx, ty, k })); pinch.current = { dist, cx, cy };
  }

  // ---- drag straight out of the palette, exactly as the room editor does ----
  function pointInWrap(x: number, y: number) {
    const el = wrapRef.current; if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  function onPaletteDown(e: React.PointerEvent, item: { key: string; onSelect: () => void }) {
    item.onSelect();                                   // a plain tap still arms the tool
    pdrag.current = { id: e.pointerId, kind: item.key, startX: e.clientX, startY: e.clientY, dragging: false };
  }
  function onPaletteMove(e: React.PointerEvent) {
    const d = pdrag.current; if (!d || e.pointerId !== d.id) return;
    if (!d.dragging) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 8) return;
      d.dragging = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(d.id); } catch (_e) {}
    }
    const over = pointInWrap(e.clientX, e.clientY);
    if (over) {
      const opx = toPixel(e.clientX - OFF, e.clientY - OFF);
      setActive({ scene: pxToScene(opx), px: opx });
    } else setActive(null);
    setPaletteGhost({ kind: d.kind, x: e.clientX, y: e.clientY, over });
  }
  function onPaletteUp(e: React.PointerEvent) {
    const d = pdrag.current; if (!d || e.pointerId !== d.id) return;
    if (d.dragging && pointInWrap(e.clientX, e.clientY)) {
      commitPlace(pxToScene(toPixel(e.clientX - OFF, e.clientY - OFF)), d.kind);
    }
    pdrag.current = null; setPaletteGhost(null); setActive(null);
  }
  function onPaletteCancel() { pdrag.current = null; setPaletteGhost(null); setActive(null); }

  function zoomBy(f: number) { const v = viewRef.current, cx = size.w / 2, cy = size.h / 2; const k = clampK(v.k * f); const ff = k / v.k; setView({ ...v, k, tx: cx - (cx - v.tx) * ff, ty: cy - (cy - v.ty) * ff }); }
  function rotateSel() { if (!selected) return; setBlocks(bs => bs.map(b => b.roomId === selected ? { ...b, rotation: (b.rotation + 90) % 360 } : b)); }

  // ---- SAVING ---------------------------------------------------------------
  //
  // THE FLOOR PLAN WAS NOT SAVING, AND THIS IS WHY.
  //
  // Every supabase call in here threw its result away. The layout upsert uses
  // onConflict: 'structure_id', which requires a UNIQUE INDEX on that column. There was
  // none, so Postgres refused the statement outright with
  //
  //   42P10: there is no unique or exclusion constraint matching the ON CONFLICT
  //          specification
  //
  // and the editor called onClose(true) regardless. It closed. It said it saved. Every
  // drag, every rotation and every door placed on the plan went in the bin.
  //
  // Two changes, and they are both non-negotiable:
  //   1. EVERY result is checked, and a failure THROWS with the real Postgres message.
  //   2. A failed save does NOT close the editor. Losing an hour of work in a wet house
  //      because a dialog closed is not an acceptable outcome of a database error.
  //
  // And one more: the layout is READ BACK after writing. An error-free write that wrote
  // nothing (a row-level security policy that filters rather than rejects, say) is the
  // one failure a returned error cannot catch, so we go and look.
  const roomName = (id: string) => (rooms.find(r => r.id === id)?.name) || 'a room';

  async function persist() {
    // 1. each room's sketch, in the room's OWN coordinates
    for (const roomId of dirty) {
      const scene = scenes[roomId]; if (!scene) continue;
      const id = sketchIds[roomId];
      if (id) {
        const { error } = await supabase.from('resto_sketches')
          .update({ canvas_json: scene as any }).eq('id', id);
        if (error) throw new Error(`Could not save the sketch for ${roomName(roomId)}: ${error.message}`);
      } else {
        const { data, error } = await supabase.from('resto_sketches')
          .insert({ org_id: orgId, room_id: roomId, type: 'moisture_map', canvas_json: scene as any })
          .select('id').single();
        if (error || !data) throw new Error(`Could not create the sketch for ${roomName(roomId)}: ${error?.message ?? 'no row came back'}`);
        setSketchIds(s => ({ ...s, [roomId]: (data as any).id }));
      }
    }

    // 2. any room resized on the plan writes its dimensions back to resto_rooms, so every
    //    screen that reads room.width_ft / length_ft agrees with the sketch
    for (const roomId of dimsDirty) {
      const r = rooms.find(x => x.id === roomId); if (!r) continue;
      const { error } = await supabase.from('resto_rooms')
        .update({ width_ft: r.width_ft, length_ft: r.length_ft }).eq('id', roomId);
      if (error) throw new Error(`Could not save the size of ${roomName(roomId)}: ${error.message}`);
    }

    // 3. the layout: WHERE each room sits. Never what is inside it.
    const { error: fpErr } = await supabase.from('resto_structure_floorplans').upsert(
      { structure_id: structureId, org_id: orgId, layout_json: { blocks }, updated_at: new Date().toISOString() },
      { onConflict: 'structure_id' });
    if (fpErr) {
      const hint = (fpErr as any).code === '42P10'
        ? ' The resto_structure_floorplans table needs a UNIQUE index on structure_id. Run migration 20260714_floorplan_unique.sql.'
        : '';
      throw new Error('Could not save the floor plan layout: ' + fpErr.message + hint);
    }

    // 4. TRUST NOTHING. Read it back.
    const { data: check, error: readErr } = await supabase.from('resto_structure_floorplans')
      .select('layout_json').eq('structure_id', structureId).maybeSingle();
    if (readErr) throw new Error('Saved, but could not verify the floor plan: ' + readErr.message);
    const saved = ((check as any)?.layout_json?.blocks ?? []) as Block[];
    if (saved.length !== blocks.length) {
      throw new Error(`The floor plan did not persist: ${blocks.length} room${blocks.length === 1 ? '' : 's'} on screen, ${saved.length} stored. Nothing was lost on your screen, so try again.`);
    }

    setDirty(new Set());
    setDimsDirty(new Set());
  }

  async function save() {
    setSaving(true);
    try {
      await persist();
      onClose(true);
    } catch (e: any) {
      alert(e?.message ?? 'Could not save the floor plan.');   // stay open; the work is still here
    } finally { setSaving(false); }
  }

  async function openRoom() {
    if (!selected) return;
    setSaving(true);
    try {
      await persist();
    } catch (e: any) {
      alert((e?.message ?? 'Could not save the floor plan.') + '\n\nStaying here so nothing is lost.');
      return;   // do NOT navigate away from unsaved work
    } finally { setSaving(false); }
    nav(`/claims/${claimId}/structures/${structureId}/rooms/${selected}`);
  }

  const k = view.k;
  const vMinX = -view.tx / k, vMinY = -view.ty / k, vMaxX = (size.w - view.tx) / k, vMaxY = (size.h - view.ty) / k;
  const step = UNITS_PER_FT;
  const gx: number[] = [], gy: number[] = [];
  if (showGrid && k > 0.03) {
    for (let x = Math.floor(vMinX / step) * step; x <= vMaxX; x += step) gx.push(x);
    for (let y = Math.floor(vMinY / step) * step; y <= vMaxY; y += step) gy.push(y);
  }
  const selFp = selected ? footprints[selected] : null;
  // Read the size back out of the room's SKETCH, not out of resto_rooms. The sketch is the
  // source of truth; the columns are a cache of it.
  const selSize = (() => {
    if (!selected) return null;
    const sc = scenes[selected];
    const outline = sc ? roomOutline(sc) : null;
    if (!outline || !outline.points || outline.points.length < 3) return { drawn: false, rect: false, w: 0, l: 0 };
    const bb = outlineBBox(sc);
    if (!bb) return { drawn: false, rect: false, w: 0, l: 0 };
    return { drawn: true, rect: isAxisRect(outline.points), w: bb.w / UNITS_PER_FT, l: bb.h / UNITS_PER_FT };
  })();
  const selRoom = selected ? rooms.find(r => r.id === selected) : null;
  const selAffected = selRoom ? selRoom.affected !== false : true;
  const isPoly = tool === 'space' && spaceMode === 'poly';
  const chScene = isPoly && size.w ? snapPt(pxToScene([size.w / 2, size.h / 2])) : null;
  const rectDraft = draft?.kind === 'rect' ? draft : null;
  const polyDraft = draft?.kind === 'poly' ? draft : null;
  const rx = rectDraft ? Math.min(rectDraft.a[0], rectDraft.b[0]) : 0, ry = rectDraft ? Math.min(rectDraft.a[1], rectDraft.b[1]) : 0;
  const rw = rectDraft ? Math.abs(rectDraft.b[0] - rectDraft.a[0]) : 0, rh = rectDraft ? Math.abs(rectDraft.b[1] - rectDraft.a[1]) : 0;
  const activeKey = tool === 'equip' ? equipType : isOpening ? doorKind : tool;

  const OPENING_ITEMS = [
    { key: 'door', label: 'Door', onSelect: () => { setDoorKind('door'); setTool('door'); } },
    { key: 'window', label: 'Window', onSelect: () => { setDoorKind('window'); setTool('window'); } },
    { key: 'opening', label: 'Cased', onSelect: () => { setDoorKind('opening'); setTool('opening'); } },
    { key: 'missing_wall', label: 'Missing wall', onSelect: () => { setDoorKind('missing_wall'); setTool('missing_wall'); } }
  ];
  const PLACE_ITEMS = [
    { key: 'air_mover', label: 'Air Mover', onSelect: () => { setEquipType('air_mover'); setTool('equip'); } },
    { key: 'dehumidifier', label: 'Dehumidifier', onSelect: () => { setEquipType('dehumidifier'); setTool('equip'); } },
    { key: 'air_scrubber', label: 'Air Scrubber', onSelect: () => { setEquipType('air_scrubber'); setTool('equip'); } },
    { key: 'origin', label: 'Origin (X)', onSelect: () => setTool('origin') }
  ];

  const selectTool = (t: Tool) => { setTool(t); setDraft(null); setActive(null); setSelected(null); setSelOpening(null); };
  const Tab = ({ t, icon: Icon, label, on }: { t: Tool; icon: any; label: string; on?: boolean }) => (
    <button onClick={() => selectTool(t)}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${(on ?? tool === t) ? 'text-sky' : 'text-gray-400'}`}>
      <Icon size={20} strokeWidth={(on ?? tool === t) ? 2.6 : 2} /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#F4F7FB] flex flex-col select-none">
      <div className="safe-top bg-white border-b border-gray-100 flex items-center px-2 pb-2 gap-1">
        <button onClick={() => onClose(false)} className="p-2 rounded-xl active:bg-gray-100"><X size={22} /></button>
        <div className="flex-1 text-center font-display font-bold text-[15px] truncate px-1">{structureName} · Floor plan</div>
        <button onClick={() => setMagnet(v => !v)} className={`p-2 rounded-xl active:bg-gray-100 ${magnet ? 'text-sky' : 'text-gray-400'}`}><Magnet size={20} /></button>
        <button onClick={() => setShowGrid(v => !v)} className={`p-2 rounded-xl active:bg-gray-100 ${showGrid ? 'text-sky' : 'text-gray-400'}`}><Grid3x3 size={20} /></button>
        <button onClick={() => setShowLegend(v => !v)} aria-label="Legend" className={`p-2 rounded-xl active:bg-gray-100 ${showLegend ? 'text-sky' : 'text-gray-400'}`}><Info size={20} /></button>
        <button onClick={save} disabled={saving} className="ml-1 btn-primary py-2 px-4 text-sm disabled:opacity-50"><Save size={16} /> Save</button>
      </div>

      <div ref={wrapRef} className="flex-1 relative overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Loading rooms...</div>
        ) : (
          <svg ref={svgRef} className="w-full h-full touch-none" viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
               onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <rect x={0} y={0} width={size.w} height={size.h} fill="#F4F7FB" />
            <g transform={viewTransform(view, size.w, size.h)}>
              <g stroke="#DCE6F1" strokeWidth={1 / k}>
                {gx.map(x => <line key={'x' + x} x1={x} y1={vMinY} x2={x} y2={vMaxY} />)}
                {gy.map(y => <line key={'y' + y} x1={vMinX} y1={y} x2={vMaxX} y2={y} />)}
              </g>

              {blocks.map(b => {
                const fp = footprints[b.roomId]; if (!fp) return null;
                const scene = scenes[b.roomId];
                const room = rooms.find(r => r.id === b.roomId);
                const affected = room ? room.affected !== false : true;
                const sel = b.roomId === selected;
                const walls = placedWalls(fp, b);
                return (
                  <g key={b.roomId}>
                    {/* the room's REAL scene, drawn by the SAME renderer the room editor uses.
                        translate(b) rotate(a) translate(-center) IS placePoint, so walls,
                        doors, wet areas and equipment all land exactly right. */}
                    {fp.hasSketch && scene ? (
                      <g transform={blockTransform(fp, b)} opacity={affected ? 1 : 0.55}>
                        <SceneLayers scene={scene} rot={view.rot} />
                      </g>
                    ) : (
                      walls.map((w, i) => (
                        <polygon key={i} points={ptsStr(w.points)} fill="#fff7ed" stroke="#f59e0b"
                                 strokeWidth={3 / k} strokeLinejoin="round" strokeDasharray={`${9 / k} ${7 / k}`} />
                      ))
                    )}
                    {walls.map((w, i) => (
                      <polygon key={'sel' + i} points={ptsStr(w.points)} fill="none"
                               stroke={sel ? '#1483C2' : 'transparent'} strokeWidth={5 / k}
                               strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                    ))}
                    <text x={b.x} y={b.y} textAnchor="middle" dominantBaseline="central"
                          transform={`rotate(${-view.rot} ${b.x} ${b.y})`}
                          fontSize={18 / k} fontWeight={700} fill={affected ? '#0E2A4D' : '#64748B'}
                          stroke="#eef4fb" strokeWidth={4 / k} paintOrder="stroke"
                          style={{ pointerEvents: 'none' }}>{fp.name}</text>
                    {!affected && (
                      <text x={b.x} y={b.y + 22 / k} textAnchor="middle" dominantBaseline="central"
                            transform={`rotate(${-view.rot} ${b.x} ${b.y + 22 / k})`}
                            fontSize={11 / k} fontWeight={600} fill="#64748B" style={{ pointerEvents: 'none' }}>context only</text>
                    )}
                  </g>
                );
              })}

              {wallSnap && (
                <g style={{ pointerEvents: 'none' }}>
                  <line x1={wallSnap.b[0][0]} y1={wallSnap.b[0][1]} x2={wallSnap.b[1][0]} y2={wallSnap.b[1][1]}
                        stroke="#22C55E" strokeWidth={7 / k} strokeLinecap="round" opacity={0.55} />
                  <line x1={wallSnap.a[0][0]} y1={wallSnap.a[0][1]} x2={wallSnap.a[1][0]} y2={wallSnap.a[1][1]}
                        stroke="#22C55E" strokeWidth={4 / k} strokeLinecap="round" />
                </g>
              )}

              {rectDraft && (
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={rx} y={ry} width={rw} height={rh} fill="#0E2A4D" fillOpacity={0.05}
                        stroke="#1483C2" strokeWidth={2 / k} strokeDasharray={`${6 / k} ${4 / k}`} />
                  <circle cx={rectDraft.a[0]} cy={rectDraft.a[1]} r={9 / k} fill="#1483C2" stroke="#fff" strokeWidth={2.5 / k} />
                  {rw > 0 && <text x={rx + rw / 2} y={ry - 26 / k} textAnchor="middle" fontSize={13 / k} fontWeight={800} fill="#0E2A4D" stroke="#fff" strokeWidth={4 / k} paintOrder="stroke">{ftLabel(rw)}</text>}
                  {rh > 0 && <text x={rx - 26 / k} y={ry + rh / 2} textAnchor="middle" fontSize={13 / k} fontWeight={800} fill="#0E2A4D" stroke="#fff" strokeWidth={4 / k} paintOrder="stroke" transform={`rotate(-90 ${rx - 26 / k} ${ry + rh / 2})`}>{ftLabel(rh)}</text>}
                </g>
              )}

              {polyDraft && (
                <g style={{ pointerEvents: 'none' }}>
                  <polyline points={ptsStr(polyDraft.pts)} fill="none" stroke="#1483C2" strokeWidth={2.5 / k} strokeDasharray={`${7 / k} ${5 / k}`} />
                  {polyDraft.pts.slice(1).map((pt, i) => {
                    const a = polyDraft.pts[i]; const mid: Pt = [(a[0] + pt[0]) / 2, (a[1] + pt[1]) / 2];
                    const len = Math.hypot(pt[0] - a[0], pt[1] - a[1]);
                    return <text key={i} x={mid[0]} y={mid[1]} textAnchor="middle" dominantBaseline="central" fontSize={12 / k} fontWeight={700} fill="#0E2A4D" stroke="#fff" strokeWidth={4 / k} paintOrder="stroke">{dimFt(len)}</text>;
                  })}
                  {polyDraft.pts.map((pt, i) => (
                    <circle key={i} cx={pt[0]} cy={pt[1]} r={(i === 0 ? 9 : 6) / k} fill={i === 0 ? '#1483C2' : '#fff'} stroke="#1483C2" strokeWidth={2.5 / k} />
                  ))}
                </g>
              )}

              {isPoly && chScene && (
                <g style={{ pointerEvents: 'none' }}>
                  {polyDraft && polyDraft.pts.length > 0 && (() => {
                    const last = polyDraft.pts[polyDraft.pts.length - 1];
                    const mid: Pt = [(last[0] + chScene[0]) / 2, (last[1] + chScene[1]) / 2];
                    const len = Math.hypot(chScene[0] - last[0], chScene[1] - last[1]);
                    return (
                      <>
                        <line x1={last[0]} y1={last[1]} x2={chScene[0]} y2={chScene[1]} stroke="#1483C2" strokeWidth={2 / k} strokeDasharray={`${6 / k} ${5 / k}`} opacity={0.7} />
                        {len > 4 && <text x={mid[0]} y={mid[1]} textAnchor="middle" dominantBaseline="central" fontSize={13 / k} fontWeight={800} fill="#1483C2" stroke="#fff" strokeWidth={4.5 / k} paintOrder="stroke">{dimFt(len)}</text>}
                      </>
                    );
                  })()}
                  <circle cx={chScene[0]} cy={chScene[1]} r={6 / k} fill="#1483C2" fillOpacity={0.35} stroke="#1483C2" strokeWidth={2 / k} />
                </g>
              )}

              {/* drop ghost: a translucent preview of exactly what will be placed, where */}
              {active && isDroppable && (() => {
                const hit = hitRoom(footprints, blocks, active.scene[0], active.scene[1]);
                const kind = tool === 'equip' ? equipType : isOpening ? doorKind : tool;
                const openColor = doorKind === 'missing_wall' ? '#B45309' : '#1483C2';
                return (
                  <g style={{ pointerEvents: 'none' }} opacity={hit ? 0.8 : 0.3}>
                    {(kind === 'air_mover' || kind === 'dehumidifier' || kind === 'air_scrubber') && (
                      <g transform={`translate(${active.scene[0]},${active.scene[1]})`}>
                        <circle r={26} fill={EQUIP_META[kind as EquipType].fill} stroke={EQUIP_META[kind as EquipType].ring} strokeWidth={3} />
                        <g transform="scale(2)"><EquipIcon type={kind as EquipType} /></g>
                      </g>
                    )}
                    {kind === 'origin' && (
                      <g transform={`translate(${active.scene[0]},${active.scene[1]})`}>
                        <circle r={13} fill="#fff" stroke="#DC2626" strokeWidth={3} />
                        <line x1={-6} y1={-6} x2={6} y2={6} stroke="#DC2626" strokeWidth={3.5} strokeLinecap="round" />
                        <line x1={6} y1={-6} x2={-6} y2={6} stroke="#DC2626" strokeWidth={3.5} strokeLinecap="round" />
                      </g>
                    )}
                    {/* an opening previews ON the wall it will attach to, as in the room editor */}
                    {isOpening && (() => {
                      if (!hit) return <circle cx={active.scene[0]} cy={active.scene[1]} r={16} fill={openColor} fillOpacity={0.25} stroke={openColor} strokeWidth={3} />;
                      const fp2 = footprints[hit.roomId]; const sc = scenes[hit.roomId];
                      if (!fp2 || !sc) return null;
                      const lp = unplacePoint(active.scene, fp2, hit);
                      const near = nearestWallEdge(sc, lp[0], lp[1]);
                      if (!near || near.dist >= 45) return <circle cx={active.scene[0]} cy={active.scene[1]} r={16} fill={openColor} fillOpacity={0.2} stroke={openColor} strokeWidth={3} />;
                      const w = sc.walls.find(x => x.id === near.wallId); if (!w) return null;
                      const n = w.points.length;
                      const a = w.points[near.edge], b2 = w.points[(near.edge + 1) % n];
                      const ex = b2[0] - a[0], ey = b2[1] - a[1]; const len = Math.hypot(ex, ey) || 1;
                      const ux = ex / len, uy = ey / len;
                      const half = Math.min((OPENING_DEFAULT_FT[doorKind] * UNITS_PER_FT) / 2, len / 2);
                      const cx2 = a[0] + ux * near.t * len, cy2 = a[1] + uy * near.t * len;
                      return (
                        <g transform={blockTransform(fp2, hit)}>
                          <line x1={cx2 - ux * half} y1={cy2 - uy * half} x2={cx2 + ux * half} y2={cy2 + uy * half}
                                stroke={openColor} strokeWidth={12} strokeLinecap="round" opacity={0.7} />
                        </g>
                      );
                    })()}
                    {tool === 'wet' && <circle cx={active.scene[0]} cy={active.scene[1]} r={22} fill="#7DD3FC" fillOpacity={0.45} stroke="#0284c7" strokeWidth={3} />}
                  </g>
                );
              })()}
            </g>

            {isPoly && (
              <g style={{ pointerEvents: 'none' }}>
                <line x1={(size.w || 1) / 2 - 15} y1={(size.h || 1) / 2} x2={(size.w || 1) / 2 + 15} y2={(size.h || 1) / 2} stroke="#1483C2" strokeWidth={2} />
                <line x1={(size.w || 1) / 2} y1={(size.h || 1) / 2 - 15} x2={(size.w || 1) / 2} y2={(size.h || 1) / 2 + 15} stroke="#1483C2" strokeWidth={2} />
                <circle cx={(size.w || 1) / 2} cy={(size.h || 1) / 2} r={11} fill="none" stroke="#1483C2" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}

        {/* Legend / key for the plan glyphs. A dismissible overlay in the top-left, so it
            explains the door, window, cased opening and missing-wall symbols on demand
            without eating canvas the rest of the time. stopPropagation keeps a tap on the
            key from starting a pan or a placement on the canvas underneath. */}
        {showLegend && (
          <div className="absolute top-3 left-3 z-20 max-w-[92%]"
               onPointerDown={e => e.stopPropagation()}>
            <div className="relative">
              <FloorPlanLegend />
              <button onClick={() => setShowLegend(false)} aria-label="Close legend"
                      className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-navy text-white flex items-center justify-center shadow-soft active:scale-95">
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {rectDraft && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-navy/90 text-white text-[12px] font-bold px-3.5 py-1.5 rounded-full pointer-events-none z-10 whitespace-nowrap">
            {ftLabel(rw)} × {ftLabel(rh)} · {Math.round((rw * rh) / (UNITS_PER_FT * UNITS_PER_FT))} sq ft
          </div>
        )}

        <div className="absolute right-3 bottom-3 flex flex-col gap-2">
          {/* MAP-VIEW rotation, not room rotation. This turns the whole plan so it faces
              the way the tech is standing. It used to wear the same RotateCw icon as the
              room's own Rotate button, which is how "rotate the room" ended up spinning
              the entire map. It now reads as a compass (orient the map), and the room's
              Rotate keeps the rotate icon, so the two can no longer be confused. */}
          <button onClick={() => setView(v => ({ ...v, rot: normRot(v.rot + 90) }))} aria-label="Rotate the map view"
            className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95 text-navy"><Compass size={18} /></button>
          {view.rot !== 0 && (
            <button onClick={() => setView(v => ({ ...v, rot: 0 }))} aria-label="Reset the map to north"
              className="bg-navy text-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95">
              <Navigation size={16} style={{ transform: `rotate(${-view.rot}deg)` }} />
            </button>
          )}
          <button onClick={() => zoomBy(1.25)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Plus size={18} /></button>
          <button onClick={() => zoomBy(0.8)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Minus size={18} /></button>
        </div>

        {tool === 'space' && spaceMode === 'rect' && (
          <div className="absolute left-0 right-0 bottom-3 flex items-center justify-center px-3">
            <button onClick={() => setSpaceSizeSheet(true)}
              className="bg-gradient-to-br from-sky to-sky-deep text-white rounded-full px-6 py-3 text-sm font-extrabold shadow-lg active:scale-95 flex items-center gap-2">
              <Ruler size={16} /> Type exact size
            </button>
          </div>
        )}
        {isPoly && (
          <div className="absolute left-0 right-0 bottom-3 flex items-center justify-center gap-2 px-3">
            {polyDraft && polyDraft.pts.length > 0 && (
              <button onClick={undoPolyPoint} className="bg-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft active:scale-95">Undo</button>
            )}
            <button onClick={addPolyCorner} className="bg-gradient-to-br from-sky to-sky-deep text-white rounded-full px-6 py-3 text-sm font-extrabold shadow-lg active:scale-95">+ Add corner</button>
            {polyDraft && polyDraft.pts.length >= 3 && (
              <button onClick={closePoly} className="bg-navy text-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft active:scale-95">Close</button>
            )}
          </div>
        )}

        {tool === 'select' && selOpen && (
          <div className="absolute left-3 bottom-3 flex gap-2 items-center max-w-[70%]">
            <button onClick={measureSelectedOpening}
              className="bg-gradient-to-br from-sky to-sky-deep text-white rounded-full px-5 py-3 text-sm font-extrabold shadow-lg active:scale-95 flex items-center gap-2 min-w-0">
              <Ruler size={16} className="shrink-0" />
              <span className="truncate">{OPENING_LABEL[selOpen.op.kind]} {selOpenSize}</span>
            </button>
            <button onClick={deleteSelectedOpening}
              className="bg-red-600 text-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95 shrink-0">
              <Trash2 size={16} />
            </button>
          </div>
        )}

        {tool === 'select' && selFp && !selOpen && (
          <div className="absolute left-3 bottom-3 flex gap-2 flex-wrap max-w-[78%]">
            {/* Tap the size to change it. It rewrites the room's OWN sketch, so the plan and
                the room editor can never disagree about how big the room is. */}
            <button onClick={() => setRoomSizeSheet(selected)}
                    className="bg-gradient-to-br from-sky to-sky-deep text-white rounded-full px-4 py-2.5 text-sm font-bold shadow-lg flex items-center gap-1.5 active:scale-95">
              <Ruler size={16} />
              {selSize && selSize.drawn
                ? `${formatFeetInches(selSize.w)} \u00d7 ${formatFeetInches(selSize.l)}`
                : 'Set size'}
            </button>
            <button onClick={rotateSel} className="bg-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft flex items-center gap-1.5 active:scale-95"><RotateCw size={16} /> Rotate room</button>
            <button onClick={toggleAffected} className={`rounded-full px-4 py-2.5 text-sm font-bold shadow-soft flex items-center gap-1.5 active:scale-95 ${selAffected ? 'bg-white text-gray-600' : 'bg-sky text-white'}`}>
              {selAffected ? <><Trash2 size={16} /> Not affected</> : <><Check size={16} /> Mark affected</>}
            </button>
            <button onClick={openRoom} className="bg-navy text-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft flex items-center gap-1.5 active:scale-95">
              <DoorOpen size={16} /> {selFp.hasSketch ? 'Open room' : 'Sketch it'}
            </button>
          </div>
        )}
      </div>

      {tool === 'space' && (
        <div className="bg-white border-t border-gray-100 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 shrink-0">Shape</span>
            <div className="flex flex-1 bg-gray-100 rounded-full p-0.5">
              {([['rect', 'Rectangle'], ['poly', 'Custom']] as [SpaceMode, string][]).map(([m, l]) => (
                <button key={m} onClick={() => { setSpaceMode(m); setDraft(null); }}
                  className={`flex-1 py-1 rounded-full text-xs font-bold ${spaceMode === m ? 'bg-white shadow-sm text-sky' : 'text-gray-500'}`}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isOpening && (
        <div className="grid grid-cols-4 gap-1 px-2 py-2 bg-white border-t border-gray-100">
          {OPENING_ITEMS.map(it => {
            const on = activeKey === it.key;
            return (
              <button key={it.key}
                onPointerDown={e => onPaletteDown(e, it)} onPointerMove={onPaletteMove}
                onPointerUp={onPaletteUp} onPointerCancel={onPaletteCancel}
                style={{ touchAction: 'none' }}
                className={`flex flex-col items-center gap-1 py-1.5 rounded-2xl ${on ? 'bg-sky-soft ring-1 ring-sky/40' : 'active:bg-gray-50'}`}>
                <PlanGlyph kind={it.key} />
                <span className={`text-[10px] font-semibold leading-tight text-center ${on ? 'text-sky-deep' : 'text-gray-500'}`}>{it.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {isPlace && (
        <div className="grid grid-cols-4 gap-1 px-2 py-2 bg-white border-t border-gray-100">
          {PLACE_ITEMS.map(it => {
            const on = activeKey === it.key;
            return (
              <button key={it.key}
                onPointerDown={e => onPaletteDown(e, it)} onPointerMove={onPaletteMove}
                onPointerUp={onPaletteUp} onPointerCancel={onPaletteCancel}
                style={{ touchAction: 'none' }}
                className={`flex flex-col items-center gap-1 py-1.5 rounded-2xl ${on ? 'bg-sky-soft ring-1 ring-sky/40' : 'active:bg-gray-50'}`}>
                <PlanGlyph kind={it.key} />
                <span className={`text-[10px] font-semibold leading-tight text-center ${on ? 'text-sky-deep' : 'text-gray-500'}`}>{it.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="text-center text-[11px] font-medium text-white py-1.5 bg-navy/90">
        {tool === 'select' && (selOpen ? 'Tap the button to re-measure this opening, or the bin to remove it. It updates on both sides of the wall.' : selected ? (magnet ? 'Rotate room turns just this room. The compass at the bottom right turns the whole map.' : 'Snapping is off · Drag to position · Rotate room turns just this room') : 'Tap a room to select it, then tap its size to change it. Tap an OPENING to re-measure it.')}
        {tool === 'space' && (spaceMode === 'poly' ? 'Aim the crosshair at each corner, then tap Add corner. Draw an L-shaped hall if that is the shape.' : 'Tap TYPE EXACT SIZE and the space draws itself. Or drag a box from the anchor corner.')}
        {isOpening && `Drag the ${OPENING_LABEL[doorKind].toLowerCase()} onto a wall, then measure it. It mirrors onto a shared wall.`}
        {isPlace && 'Drag onto the map. The preview shows exactly where it lands, release to drop.'}
        {tool === 'wet' && 'Tap a room to mark its whole floor wet. Use the room sketch for partial areas.'}
      </div>

      <nav className="safe-bottom bg-white border-t border-gray-100 flex">
        <Tab t="select" icon={MousePointer2} label="Move" />
        <Tab t="space" icon={SquarePlus} label="Space" />
        <Tab t="door" icon={DoorOpen} label="Openings" on={isOpening} />
        <Tab t="equip" icon={MapPin} label="Place" on={isPlace} />
        <Tab t="wet" icon={Droplet} label="Water" />
      </nav>

      {/* Measure the opening. Two steps for a door, window, or cased opening. ONE for a
          missing wall, because a missing wall IS full ceiling height by definition and
          asking for a height would invite a wrong answer. */}
      {openSheet && openSheet.stage === 'width' && (
        <MeasureSheet
          title={`${OPENING_LABEL[openSheet.kind]} width`}
          subtitle="Measure across the wall, jamb to jamb."
          note={OPENING_DESC[openSheet.kind]}
          initialFt={openSheet.widthFt}
          min={0.5}
          max={Math.round(openSheet.edgeLenFt * 100) / 100}
          quick={WIDTH_QUICK[openSheet.kind].filter(q => q.ft <= openSheet.edgeLenFt)}
          step={openSheet.kind === 'missing_wall' ? undefined : { current: 1, total: 2 }}
          onCancel={() => setOpenSheet(null)}
          onSave={(ft) => {
            if (openSheet.kind === 'missing_wall') {
              commitOpening({ ...openSheet, widthFt: ft });   // height is the ceiling, by definition
              setOpenSheet(null);
            } else {
              setOpenSheet(s => (s ? { ...s, widthFt: ft, stage: 'height' } : s));
            }
          }}
        />
      )}

      {openSheet && openSheet.stage === 'height' && (() => {
        const ceil = ceilingFtFor(openSheet.roomId);
        const assumed = ceilingIsAssumed(openSheet.roomId);
        return (
          <MeasureSheet
            title={`${OPENING_LABEL[openSheet.kind]} height`}
            subtitle="Floor to the top of the opening."
            note={assumed
              ? `No ceiling height is set for this room or level, so the wall is assumed to be ${ASSUMED_CEILING_FT} ft. Set the real one on the level and the measurement sheet stops flagging it.`
              : `Wall area subtracts width times height, so this number lands on the drywall and paint lines. The wall here is ${ceil} ft.`}
            initialFt={openSheet.heightFt ?? OPENING_DEFAULT_HEIGHT_FT[openSheet.kind]}
            min={0.5}
            max={ceil}
            quick={HEIGHT_QUICK[openSheet.kind].filter(q => q.ft <= ceil)}
            step={{ current: 2, total: 2 }}
            onBack={() => setOpenSheet(s => (s ? { ...s, stage: 'width' } : s))}
            onCancel={() => setOpenSheet(null)}
            onSave={(ft) => { commitOpening(openSheet, ft); setOpenSheet(null); }}
          />
        );
      })()}

      {spaceSizeSheet && (
        <RoomSizeSheet
          title="Space size"
          subtitle="Type the two measurements and the space draws itself. You name it next."
          onCancel={() => setSpaceSizeSheet(false)}
          onCreate={createRectExact}
        />
      )}

      {roomSizeSheet && (() => {
        const sc = scenes[roomSizeSheet];
        const bb = sc ? outlineBBox(sc) : null;
        const name = roomName(roomSizeSheet);
        const drawn = !!bb;
        return (
          <RoomSizeSheet
            title={name}
            subtitle={drawn
              ? 'Changing the size rewrites this room\u2019s sketch, so the plan and the room editor stay in step. Doors, windows and equipment inside it move with the walls.'
              : 'This room has no sketch yet. Type its size and one is drawn for it.'}
            initialWidthFt={bb ? bb.w / UNITS_PER_FT : null}
            initialLengthFt={bb ? bb.h / UNITS_PER_FT : null}
            onCancel={() => setRoomSizeSheet(null)}
            onCreate={(w, l) => applyRoomSize(roomSizeSheet, w, l)}
          />
        );
      })()}

      {nameSheet && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8vh)' }}>
          <div className="absolute inset-0 bg-navy/30" onClick={() => { setNameSheet(null); setDraft(null); }} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
            <div className="font-display font-bold text-lg text-navy">Name this space</div>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
              It carries doors and shows how the building connects, but it is not scoped or scored until you mark it affected.
            </p>
            <input value={nameSheet.name} onChange={e => setNameSheet(s => s && ({ ...s, name: e.target.value }))}
              placeholder="Hallway" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') createSpace(nameSheet.points, nameSheet.name); }}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 mt-3 text-[16px] focus:outline-none focus:border-sky" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setNameSheet(null); setDraft(null); }} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
              <button onClick={() => createSpace(nameSheet.points, nameSheet.name)} disabled={saving} className="btn-primary flex-1 py-3 justify-center disabled:opacity-50">Add space</button>
            </div>
          </div>
        </div>
      )}

      {wetSheet && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8vh)' }}>
          <div className="absolute inset-0 bg-navy/30" onClick={() => setWetSheet(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
            <div className="font-display font-bold text-lg text-navy">Whole floor wet</div>
            <p className="text-xs text-gray-400 mt-0.5">Measured from this room's outline. For part of a floor, use the room's moisture map.</p>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Flooring</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {MATERIALS_BY_SURFACE.floor.map(m => (
                <button key={m} onClick={() => setWetSheet(s => s && ({ ...s, material: m }))}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-semibold ${wetSheet.material === m ? 'bg-sky text-white' : 'bg-sky-soft text-sky-deep'}`}>{m}</button>
              ))}
            </div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Flooring plan</label>
            <div className="flex bg-gray-100 rounded-full p-0.5 mt-1">
              {([['dry', 'Dry in place'], ['remove', 'Remove / tear out']] as [string, string][]).map(([val, lbl]) => (
                <button key={val} onClick={() => setWetSheet(s => s && ({ ...s, disposition: val as 'dry' | 'remove' }))}
                  className={`flex-1 py-1.5 rounded-full text-xs font-bold ${wetSheet.disposition === val ? 'bg-white shadow-sm text-sky' : 'text-gray-500'}`}>{lbl}</button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Dry in place bills water extraction. Remove bills flooring tear-out.</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setWetSheet(null)} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
              <button onClick={applyWet} className="btn-primary flex-1 py-3 justify-center">Mark wet</button>
            </div>
          </div>
        </div>
      )}

      {/* floating palette ghost while dragging outside the canvas */}
      {paletteGhost && !paletteGhost.over && (
        <div className="fixed z-[60] pointer-events-none -translate-x-1/2 -translate-y-1/2 opacity-80 drop-shadow-lg"
             style={{ left: paletteGhost.x, top: paletteGhost.y }}>
          <PlanGlyph kind={paletteGhost.kind} />
        </div>
      )}
    </div>
  );
}

// One place decides what counts as an opening, so the tool, the palette, the ghost, and
// the commit path can never disagree about whether missing_wall is one of them.
function isOpeningKind(t: string): boolean {
  return t === 'door' || t === 'window' || t === 'opening' || t === 'missing_wall';
}