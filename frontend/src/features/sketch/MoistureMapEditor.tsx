import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Undo2, Save, Move, Square, Droplet, Plus, Minus, Trash2, MapPin, Ruler, ArrowUpDown, TriangleAlert, RotateCw, Compass, Scissors } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SceneLayers, EquipIcon } from './SceneLayers';
import { RoomDimensions } from './RoomDimensions';
import { MeasureSheet } from './MeasureSheet';
import { RoomSizeSheet } from './RoomSizeSheet';
import { formatFeetInches } from '../../lib/feetInches';
import { viewTransform, screenToScene, panDelta, normRot, type View as VView } from './viewTransform';
import {
  type FloodCut,
  normalizeScene, uid, hitEquipment, hitPoint, hitWall, snapGrid, allReadingDates, todayISO, upsertReading, pointDisplay,
  sceneFloorSqFt, suggestEquipment, hitArrow, hitOpening, nearestWallEdge, wallById, ptsStr, floodCutStats, containmentStats, edgeLenFt, floodCutEnds, projectToEdgeFt,
  setEdgeLengthFt, polyEdgeLenFt, roomDimensions, roomBBoxFt, polygonArea,
  FLOOD_HEIGHTS, MATERIALS_BY_SURFACE, WET_SURFACES, OPENING_DEFAULT_FT, OPENING_DEFAULT_HEIGHT_FT, OPENING_LABEL, OPENING_DESC, SCENE_SIZE, UNITS_PER_FT, EQUIP_META,
  type Scene, type Pt, type EquipType, type OpeningKind
} from './sketchModel';

type Tool = 'move' | 'room' | 'wet' | 'equip' | 'reading' | 'arrow' | 'door' | 'floodcut' | 'containment' | 'origin';
type RoomMode = 'rect' | 'custom';
type GKind = 'idle' | 'pan' | 'dragEquip' | 'dragPoint' | 'handle' | 'wet' | 'place' | 'arrow' | 'startTap' | 'aimRotate' | 'containDraw' | 'floodTap' | 'containTap' | 'floodHandle' | 'floodMove';
interface SketchRow { id: string; canvas_json: any; }

// An opening being measured. It is NOT in the scene yet, and that is the point.
//
// This used to write the opening with OPENING_DEFAULT_FT and OPENING_DEFAULT_HEIGHT_FT
// the instant it was dropped, and only THEN ask for the real numbers. Cancel the sheet
// and a 2 ft 6 in x 6 ft 8 in door nobody measured stayed on the wall with heightFt set,
// which makes openingHeightFt return assumed:false. So roomDimensions printed no warning,
// the "Sizes assumed" chip never lit, and an invented deduction went out on a carrier
// document as a measured fact. Nothing is written now until both numbers are real.
interface OpeningDraft {
  wallId: string; edge: number; t: number; kind: OpeningKind;
  edgeLenFt: number; widthFt: number; heightFt?: number;
  step: 'width' | 'height';
  id?: string;   // set when RE-MEASURING an opening that is already on the wall
}

// ---- WALL BY WALL ROOM BUILDER -------------------------------------------
// A custom room is no longer drawn. It is BUILT: drop the first corner, then pick a
// direction and type that wall's length, over and over. Every wall starts exactly where
// the last one ended, so the corners are joined by construction and can never leave a
// gap. corners[0] is the starting corner; corners.length - 1 is the number of walls
// placed so far.
interface RoomBuild { corners: Pt[]; }

const PLACE_SET: Tool[] = ['equip', 'reading', 'origin'];
const GRID = 40;            // scene units per grid square (1 ft)
const INCH = UNITS_PER_FT / 12;   // 1 inch in scene units.
const clampK = (k: number) => Math.min(20, Math.max(0.05, k));
const OFF = 50;
function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
const WET_BRUSH = 48;
const READING_MATERIALS = ['Drywall', 'Wood / Framing', 'Subfloor', 'Concrete', 'Plaster', 'Carpet', 'Baseboard', 'Hardwood'];
const ftLabel = (u: number) => formatFeetInches(u / UNITS_PER_FT);
const fmtDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Undated';

const OPENING_KINDS: OpeningKind[] = ['door', 'window', 'opening', 'missing_wall'];

// A wall being aimed: a locked length pinned to the previous corner, its free end swung to
// any angle at all. The length only changes when the tech retypes it, never by dragging.
interface AimWall { lenU: number; angle: number; }   // angle in radians, scene space (0 = +x)

// ---- SPLITTING ONE POLYGON OUT INTO ITS OWN ROOM -------------------------
// A closet drawn as a second wall polygon in this sketch is invisible to the report and
// the Xactimate export, which only take the largest polygon. Splitting moves that polygon,
// and everything physically in it, into a brand new room.
//
// Ray-cast point-in-polygon, against the CLOSET polygon specifically (not hitWall, which
// would return whichever overlapping polygon comes first, and a nested closet sits inside
// the main room too).
function ptInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function wetCentroid(w: any): Pt {
  const pts: Pt[] = [...(w.points ?? []), ...((w.strokes ?? []).flat())];
  if (!pts.length) return [0, 0];
  let sx = 0, sy = 0; for (const p of pts) { sx += p[0]; sy += p[1]; }
  return [sx / pts.length, sy / pts.length];
}
function containCenter(c: any): Pt {
  if (c.x != null && c.y != null) return [c.x, c.y];
  if (c.from && c.to) return [(c.from[0] + c.to[0]) / 2, (c.from[1] + c.to[1]) / 2];
  return [0, 0];
}

// Split a scene in two around one wall polygon. Location decides readings, equipment and
// containments (point in the closet outline); wall attachment decides openings and flood
// cuts (their wallId). Arrows stay with the main room, since they show flow across the
// whole loss. Nothing is duplicated: every item lands in exactly one of the two scenes.
function partitionScene(scene: Scene, wallId: string): { closet: Scene; remain: Scene } | null {
  const closetWall = scene.walls.find(w => w.id === wallId);
  if (!closetWall) return null;
  const poly = closetWall.points;
  const inClo = (p: Pt) => ptInPoly(p, poly);

  const cWet = scene.wetAreas.filter(w => inClo(wetCentroid(w)));
  const cWetIds = new Set(cWet.map(w => w.id));
  const cPts = (scene.moisturePoints ?? []).filter(m => inClo([m.x, m.y]));
  const cPtIds = new Set(cPts.map(m => m.id));
  const cEq = scene.equipment.filter(e => inClo([e.x, e.y]));
  const cEqIds = new Set(cEq.map(e => e.id));
  const cOp = (scene.openings ?? []).filter(o => o.wallId === wallId);
  const cOpIds = new Set(cOp.map(o => o.id));
  const cFc = (scene.floodCuts ?? []).filter(f => f.wallId === wallId);
  const cCon = (scene.containments ?? []).filter(c => inClo(containCenter(c)));
  const cConIds = new Set(cCon.map(c => c.id));
  const originIn = !!(scene.originOfLoss && inClo(scene.originOfLoss));

  const closet = normalizeScene({
    walls: [closetWall],
    wetAreas: cWet,
    moisturePoints: cPts,
    equipment: cEq,
    openings: cOp,
    floodCuts: cFc,
    containments: cCon,
    arrows: [],
    originOfLoss: originIn ? scene.originOfLoss : undefined,
    classOfLoss: scene.classOfLoss
  } as any);

  const remain: Scene = {
    ...scene,
    walls: scene.walls.filter(w => w.id !== wallId),
    wetAreas: scene.wetAreas.filter(w => !cWetIds.has(w.id)),
    moisturePoints: (scene.moisturePoints ?? []).filter(m => !cPtIds.has(m.id)),
    equipment: scene.equipment.filter(e => !cEqIds.has(e.id)),
    openings: (scene.openings ?? []).filter(o => !cOpIds.has(o.id)),
    floodCuts: (scene.floodCuts ?? []).filter(f => f.wallId !== wallId),
    containments: (scene.containments ?? []).filter(c => !cConIds.has(c.id)),
    originOfLoss: originIn ? undefined : scene.originOfLoss
  };
  return { closet, remain };
}

function PlaceGlyph({ kind, size = 26 }: { kind: string; size?: number }) {
  if (kind === 'air_mover' || kind === 'dehumidifier' || kind === 'air_scrubber') {
    const m = EQUIP_META[kind as EquipType];
    return (
      <svg width={size} height={size} viewBox="-13 -13 26 26">
        <circle r={12} fill={m.fill} stroke={m.ring} strokeWidth={1.5} />
        <EquipIcon type={kind as EquipType} />
      </svg>
    );
  }
  if (kind === 'reading') return (
    <svg width={size} height={size} viewBox="-13 -13 26 26"><circle r={12} fill="#F26B3A" stroke="#d94f1e" strokeWidth={1.5} />
      <path d="M0 -6 C4 -0.8 5.4 1.2 5.4 3.6 A5.4 5.4 0 1 1 -5.4 3.6 C-5.4 1.2 -4 -0.8 0 -6 Z" fill="#fff" /></svg>
  );
  if (kind === 'arrow') return (
    <svg width={size} height={size} viewBox="-13 -13 26 26"><circle r={12} fill="#4F46E5" stroke="#3730a3" strokeWidth={1.5} />
      <g stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1={-4.5} y1={4.5} x2={4.5} y2={-4.5} /><polyline points="0,-4.5 4.5,-4.5 4.5,0" /></g></svg>
  );
  const oc = (inner: any, fill = '#475569', ring = '#334155') => (
    <svg width={size} height={size} viewBox="-13 -13 26 26"><circle r={12} fill={fill} stroke={ring} strokeWidth={1.5} />{inner}</svg>
  );
  if (kind === 'door') return oc(<g stroke="#fff" fill="none" strokeLinecap="round"><line x1={-5} y1={7} x2={-5} y2={-7} strokeWidth={2.6} /><path d="M-5 -7 A12 12 0 0 1 7 5" strokeWidth={1.6} strokeDasharray="2 2" /></g>);
  if (kind === 'window') return oc(<g stroke="#fff" strokeWidth={1.8} strokeLinecap="round" fill="none"><rect x={-6} y={-4.5} width={12} height={9} rx={1} /><line x1={0} y1={-4.5} x2={0} y2={4.5} /><line x1={-6} y1={0} x2={6} y2={0} /></g>);
  if (kind === 'missing_wall') return oc(<g stroke="#fff" strokeWidth={2.4} strokeLinecap="round"><line x1={-8} y1={0} x2={8} y2={0} strokeDasharray="3 3" /><line x1={-8} y1={-6} x2={-8} y2={6} /><line x1={8} y1={-6} x2={8} y2={6} /></g>, '#94a3b8', '#64748b');
  if (kind === 'origin') return oc(<g stroke="#fff" strokeWidth={3} strokeLinecap="round"><line x1={-5} y1={-5} x2={5} y2={5} /><line x1={5} y1={-5} x2={-5} y2={5} /></g>, '#DC2626', '#991B1B');
  return oc(<g stroke="#fff" strokeWidth={2.8} strokeLinecap="round"><line x1={-8} y1={0} x2={-3} y2={0} /><line x1={3} y1={0} x2={8} y2={0} /></g>);
}

// Moisture-map editor.
//
// ROOMS ARE MEASURED, NOT DRAWN. Dragging a box with a fingertip and correcting it
// afterwards is how a room ends up 11 ft 11 in because nobody went back to fix it. A
// rectangle is typed: width and length. A custom shape is built wall by wall: drop the
// first corner, then pick a direction and type that wall's length, and every wall starts
// where the last one ended so the corners are joined by construction.
//
// Ceiling height and opening heights are CAPTURED, not guessed, because wall area is
//   W = (perimeter x ceiling height) - SUM(opening width x opening height)
// and an assumed height is an assumed dollar amount on a paint or drywall line.
export function MoistureMapEditor({ sketch, roomId, roomName, claimId, orgId, structureId, onClose }:
  { sketch: SketchRow | null; roomId: string; roomName?: string; claimId: string; orgId: string; structureId?: string; onClose: (saved: boolean) => void }) {
  void claimId;
  const [scene, setScene] = useState<Scene>(() => normalizeScene(sketch?.canvas_json));
  const [history, setHistory] = useState<Scene[]>([]);
  const [tool, setTool] = useState<Tool>('room');
  const [equipType, setEquipType] = useState<EquipType>('air_mover');
  const [doorKind, setDoorKind] = useState<OpeningKind>('door');
  const [roomMode, setRoomMode] = useState<RoomMode>('rect');
  const [lastRoomKey, setLastRoomKey] = useState<string>('rect');
  const [lastScope, setLastScope] = useState<Tool>('floodcut');
  const [pendingWetId, setPendingWetId] = useState<string | null>(null);
  const [activeWetId, setActiveWetId] = useState<string | null>(null);
  const [pendingReading, setPendingReading] = useState<{ id?: string; x: number; y: number } | null>(null);
  const [pendingFlood, setPendingFlood] = useState<{ wallId: string; edge: number } | null>(null);
  const [selectedFlood, setSelectedFlood] = useState<{ wallId: string; edge: number } | null>(null);
  const [pendingContain, setPendingContain] = useState<{ id: string; isNew: boolean } | null>(null);
  const [rdgValue, setRdgValue] = useState('');
  const [rdgMaterial, setRdgMaterial] = useState<string | undefined>(undefined);
  const [rdgLabel, setRdgLabel] = useState('');
  const [lastPlace, setLastPlace] = useState<Tool>('equip');
  const [activeDate, setActiveDate] = useState<string>(todayISO());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<VView>({ tx: 0, ty: 0, k: 1, rot: 0 });
  const [draft, setDraft] = useState<{ kind: 'wet'; pts: Pt[] } | { kind: 'arrow'; from: Pt; to: Pt } | null>(null);
  const [active, setActive] = useState<{ scene: Pt; px: Pt } | null>(null);
  const [guide, setGuide] = useState<{ x?: number; y?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [paletteGhost, setPaletteGhost] = useState<{ kind: string; x: number; y: number; over: boolean } | null>(null);

  // ---- CUSTOM ROOM BUILDER STATE ----
  // corners: the joints placed so far, starting corner first, all visible.
  // aim: the wall currently being pointed (locked length, free angle) off the last corner.
  // lenSheet: open when typing / retyping the current wall's length.
  const [build, setBuild] = useState<RoomBuild | null>(null);
  const [aim, setAim] = useState<AimWall | null>(null);
  const [lenSheet, setLenSheet] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);   // walls miss the start: warn before closing

  // ---- MEASUREMENT STATE ----
  const [ceilingFt, setCeilingFt] = useState<number | null>(null);
  const [structureCeilingFt, setStructureCeilingFt] = useState<number | null>(null);
  const [selEdge, setSelEdge] = useState<{ wallId: string; edge: number } | null>(null);
  const [edgeSheet, setEdgeSheet] = useState<{ wallId: string; edge: number; currentFt: number } | null>(null);
  const [ceilSheet, setCeilSheet] = useState(false);
  const [sizeSheet, setSizeSheet] = useState(false);
  const [openingSheet, setOpeningSheet] = useState<OpeningDraft | null>(null);
  const [showDims, setShowDims] = useState(false);
  // Wall lengths are drawn on the sketch in EVERY tool by default, not just Move, so a tech
  // reads each wall without switching modes. The ruler button toggles them off when the
  // canvas is busy. On by default, because the numbers are the point of the sketch.
  const [showWalls, setShowWalls] = useState(true);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  // Splitting a second polygon (a closet drawn in this sketch) out into its own room.
  const [resolvedStructureId, setResolvedStructureId] = useState<string | null>(structureId ?? null);
  const [splitName, setSplitName] = useState<{ wallId: string; name: string } | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [splitDone, setSplitDone] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  // Any edit at all marks the sketch dirty. Closing without saving is how a tech loses
  // an hour of work in a wet house, so we ask rather than silently discard.
  const [dirty, setDirty] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const editSnapped = useRef(false);
  const viewRef = useRef(view); viewRef.current = view;
  const inited = useRef(false);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const g = useRef<{ kind: GKind; downPx: Pt; lastPx: Pt; moved: boolean; id?: string; idx?: number; editId?: string; wallTap?: string; openingTap?: string; edgeTap?: { wallId: string; edge: number }; downScene?: Pt; grab?: Pt; floodEdge?: { wallId: string; edge: number }; floodWhich?: 'start' | 'end'; floodGrab?: number }>(
    { kind: 'idle', downPx: [0, 0], lastPx: [0, 0], moved: false });
  const pdrag = useRef<{ id: number; kind: string; startX: number; startY: number; dragging: boolean } | null>(null);

  // Ceiling height: the ROOM overrides the STRUCTURE default. Nothing can compute wall
  // area without one, so it is loaded up front and shown in the header.
  useEffect(() => {
    (async () => {
      const { data: room } = await supabase.from('resto_rooms').select('height_ft, structure_id').eq('id', roomId).maybeSingle();
      const sid = structureId || (room as any)?.structure_id;
      if (sid) setResolvedStructureId(sid);
      let structDefault: number | null = null;
      if (sid) {
        const { data: st } = await supabase.from('resto_structures').select('default_ceiling_height_ft').eq('id', sid).maybeSingle();
        const v = Number((st as any)?.default_ceiling_height_ft);
        structDefault = v > 0 ? v : null;
      }
      const rv = Number((room as any)?.height_ft);
      setStructureCeilingFt(structDefault);
      setCeilingFt(rv > 0 ? rv : structDefault);
    })();
  }, [roomId, structureId]);

  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (inited.current || !size.w || !size.h) return;
    const k = (Math.min(size.w, size.h) * 0.9) / SCENE_SIZE;
    setView({ k, rot: 0, tx: (size.w - SCENE_SIZE * k) / 2, ty: (size.h - SCENE_SIZE * k) / 2 });
    inited.current = true;
  }, [size]);

  function toPixel(cx: number, cy: number): Pt {
    const svg = svgRef.current; const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return [0, 0];
    const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
    const r = p.matrixTransform(ctm.inverse());
    return [r.x, r.y];
  }
  // Un-rotates as well as un-scales. Without this, every tap lands somewhere the tech
  // never touched the moment the canvas is turned.
  function pxToScene(p: Pt): Pt { return screenToScene(p, viewRef.current, size.w, size.h); }

  // Snap to the INCH, and to any existing corner. A typed value always overrides it.
  function snapPoint(raw: Pt, exclude?: { id: string; idx: number }): { p: Pt; gx?: number; gy?: number } {
    const thr = 8 / viewRef.current.k;
    let best: Pt | null = null, bd = thr;
    for (const w of scene.walls) for (let i = 0; i < w.points.length; i++) {
      if (exclude && w.id === exclude.id && i === exclude.idx) continue;
      const d = Math.hypot(w.points[i][0] - raw[0], w.points[i][1] - raw[1]);
      if (d < bd) { bd = d; best = w.points[i]; }
    }
    if (best) return { p: [best[0], best[1]], gx: best[0], gy: best[1] };
    let sx = raw[0], sy = raw[1], gx: number | undefined, gy: number | undefined, dx = thr, dy = thr;
    for (const w of scene.walls) for (let i = 0; i < w.points.length; i++) {
      if (exclude && w.id === exclude.id && i === exclude.idx) continue;
      const [cx, cy] = w.points[i];
      if (Math.abs(cx - raw[0]) < dx) { dx = Math.abs(cx - raw[0]); sx = cx; gx = cx; }
      if (Math.abs(cy - raw[1]) < dy) { dy = Math.abs(cy - raw[1]); sy = cy; gy = cy; }
    }
    if (gx === undefined) sx = snapGrid(raw[0], INCH);
    if (gy === undefined) sy = snapGrid(raw[1], INCH);
    return { p: [sx, sy], gx, gy };
  }
  function hitHandle(s: Pt): { id: string; idx: number } | null {
    const r = 18 / viewRef.current.k;
    for (const w of scene.walls) for (let i = 0; i < w.points.length; i++)
      if (Math.hypot(w.points[i][0] - s[0], w.points[i][1] - s[1]) < r) return { id: w.id, idx: i };
    return null;
  }
  // Which wall EDGE was tapped? This is how a tech reaches a measurement.
  function hitEdge(s: Pt): { wallId: string; edge: number } | null {
    const thr = 22 / viewRef.current.k;
    for (const w of scene.walls) {
      const n = w.points.length;
      for (let i = 0; i < n; i++) {
        const d = distToSeg(s, w.points[i], w.points[(i + 1) % n]);
        if (d < thr) return { wallId: w.id, edge: i };
      }
    }
    return null;
  }

  function snapshot() { setHistory(h => [...h.slice(-29), scene]); setDirty(true); }
  function undo() { setHistory(h => { if (!h.length) return h; setScene(h[h.length - 1]); setSelectedId(null); setSelEdge(null); return h.slice(0, -1); }); }

  // Is this point inside a room already on the map? This is what stops a room being placed
  // inside another room: hitWall is a point-in-polygon test against every wall outline.
  const pointInAnyRoom = (p: Pt) => !!hitWall(scene, p[0], p[1]);
  // Open the editor for an opening already on a wall. Tapping a door, window, opening, or
  // missing wall lands here so its type and size can be changed, or it can be removed.
  function openOpeningEditor(id: string) { editSnapped.current = false; setSelectedId(id); setSelEdge(null); setEditOpen(id); }

  // ---- TYPE AN EXACT WALL LENGTH -------------------------------------------
  function applyEdgeLength(ft: number) {
    if (!edgeSheet) return;
    const w = scene.walls.find(x => x.id === edgeSheet.wallId);
    if (!w) { setEdgeSheet(null); return; }
    const res = setEdgeLengthFt(w.points, edgeSheet.edge, ft);
    if (!res) { setEdgeSheet(null); return; }
    snapshot();
    setScene(sc => ({ ...sc, walls: sc.walls.map(x => x.id === edgeSheet.wallId ? { ...x, points: res.points } : x) }));
    setEdgeSheet(null);
  }

  async function applyCeiling(ft: number) {
    setCeilingFt(ft);
    setCeilSheet(false);
    await supabase.from('resto_rooms').update({ height_ft: ft }).eq('id', roomId);
  }

  // ---- gestures ------------------------------------------------------------
  function onDown(e: React.PointerEvent) {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const pa = toPixel(a.x, a.y), pb = toPixel(b.x, b.y);
      pinch.current = { dist: Math.hypot(pa[0] - pb[0], pa[1] - pb[1]), cx: (pa[0] + pb[0]) / 2, cy: (pa[1] + pb[1]) / 2 };
      g.current.kind = 'idle'; setDraft(null); setActive(null); setGuide(null);
      return;
    }
    const px = toPixel(e.clientX, e.clientY); const s = pxToScene(px);
    const pxO = toPixel(e.clientX - OFF, e.clientY - OFF); const sO = pxToScene(pxO);
    g.current.downPx = px; g.current.lastPx = px; g.current.moved = false; g.current.downScene = sO; g.current.grab = undefined;
    g.current.edgeTap = undefined;

    if (tool === 'move') {
      const h = hitHandle(s);
      const ep = h ? null : hitEquipment(scene, s[0], s[1]);
      const mp = h || ep ? null : hitPoint(scene, s[0], s[1]);
      if (h) { snapshot(); g.current.kind = 'handle'; g.current.id = h.id; g.current.idx = h.idx; setSelectedId(null); setSelEdge(null); const c = scene.walls.find(w => w.id === h.id)!.points[h.idx]; g.current.grab = [c[0] - sO[0], c[1] - sO[1]]; showActive([c[0], c[1]], pxO, { id: h.id, idx: h.idx }); }
      else if (ep) { snapshot(); setSelectedId(ep.id); setSelEdge(null); g.current.kind = 'dragEquip'; g.current.id = ep.id; g.current.grab = [ep.x - sO[0], ep.y - sO[1]]; showActive([ep.x, ep.y], pxO); }
      else if (mp) { snapshot(); setSelectedId(mp.id); setSelEdge(null); g.current.kind = 'dragPoint'; g.current.id = mp.id; g.current.grab = [mp.x - sO[0], mp.y - sO[1]]; showActive([mp.x, mp.y], pxO); }
      else {
        const opn = hitOpening(scene, s[0], s[1]);
        const ar = opn ? null : hitArrow(scene, s[0], s[1]);
        if (opn) { setSelectedId(opn.id); setSelEdge(null); g.current.kind = 'pan'; g.current.openingTap = opn.id; }
        else if (ar) { setSelectedId(ar.id); setSelEdge(null); g.current.kind = 'pan'; }
        else {
          // Tap a wall EDGE to select it and reveal its measurement.
          const ed = hitEdge(s);
          if (ed) { g.current.edgeTap = ed; g.current.kind = 'pan'; }
          else { const w = hitWall(scene, s[0], s[1]); g.current.wallTap = w?.id; setSelectedId(w?.id ?? null); setSelEdge(null); g.current.kind = 'pan'; }
        }
      }
    } else if (tool === 'room') {
      // A rectangle is typed, never dragged. A custom room drops its first corner with one
      // tap, then each wall is a LOCKED length pinned to the last corner whose FREE END is
      // dragged to aim it any direction. Length only changes by retyping.
      if (roomMode === 'custom' && !build) {
        g.current.kind = 'startTap';
      } else if (roomMode === 'custom' && build && aim) {
        // Grabbing anywhere near the aimed segment or its free end rotates it. The pivot is
        // the last placed corner; the length is fixed, so only the angle moves.
        g.current.kind = 'aimRotate';
      } else {
        g.current.kind = 'pan';
      }
    } else if (tool === 'wet') {
      g.current.kind = 'wet'; setDraft({ kind: 'wet', pts: [s] }); setActive({ scene: s, px }); setGuide(null);
    } else if (tool === 'arrow') {
      const { p } = snapPoint(sO); g.current.kind = 'arrow'; setDraft({ kind: 'arrow', from: p, to: p }); showActive(sO, pxO);
    } else if (tool === 'floodcut') {
      const kNow = viewRef.current.k, HIT = 30 / kNow;
      if (selectedFlood) {
        const fc = (scene.floodCuts ?? []).find(f => f.wallId === selectedFlood.wallId && f.edge === selectedFlood.edge);
        const ends = fc ? floodCutEnds(scene, fc) : null;
        if (ends && fc) {
          const dS = Math.hypot(s[0] - ends.start[0], s[1] - ends.start[1]);
          const dE = Math.hypot(s[0] - ends.end[0], s[1] - ends.end[1]);
          if (Math.min(dS, dE) < HIT) { snapshot(); g.current.kind = 'floodHandle'; g.current.floodWhich = dS <= dE ? 'start' : 'end'; showActive(sO, pxO); }
          else if (distToSeg(s, ends.start, ends.end) < 22 / kNow) { snapshot(); g.current.kind = 'floodMove'; g.current.floodGrab = projectToEdgeFt(scene, fc.wallId, fc.edge, s) - (fc.startFt ?? 0); showActive(sO, pxO); }
        }
      }
      if (g.current.kind !== 'floodHandle' && g.current.kind !== 'floodMove') {
        g.current.kind = 'floodTap';
        const near = nearestWallEdge(scene, s[0], s[1]);
        g.current.floodEdge = near && near.dist < 45 ? { wallId: near.wallId, edge: near.edge } : undefined;
      }
    } else if (tool === 'containment') {
      g.current.kind = 'containTap'; g.current.downScene = s;
    } else {
      g.current.kind = 'place';
      g.current.editId = tool === 'reading' ? hitPoint(scene, sO[0], sO[1])?.id : undefined;
      showActive(sO, pxO);
    }
  }

  function showActive(rawScene: Pt, px: Pt, exclude?: { id: string; idx: number }) {
    const { p, gx, gy } = snapPoint(rawScene, exclude);
    setActive({ scene: p, px }); setGuide(gx != null || gy != null ? { x: gx, y: gy } : null);
    return p;
  }

  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) { doPinch(); return; }
    const px = toPixel(e.clientX, e.clientY);
    const dx = px[0] - g.current.lastPx[0], dy = px[1] - g.current.lastPx[1];
    if (!g.current.moved && Math.hypot(px[0] - g.current.downPx[0], px[1] - g.current.downPx[1]) > 4) g.current.moved = true;
    const pxO = toPixel(e.clientX - OFF, e.clientY - OFF); const sO = pxToScene(pxO);
    const gb = g.current.grab;

    if (g.current.kind === 'pan') { const [pdx, pdy] = panDelta([dx, dy], viewRef.current); setView(v => ({ ...v, tx: v.tx + pdx, ty: v.ty + pdy })); }
    else if (g.current.kind === 'aimRotate') {
      // Swing the aimed wall to point at the finger. The pivot is the last corner and the
      // length is locked, so ONLY the angle changes. Totally free: no angle snapping.
      const anchor = buildEnd;
      if (anchor && aim) {
        const sFinger = pxToScene(px);
        const ang = Math.atan2(sFinger[1] - anchor[1], sFinger[0] - anchor[0]);
        setAim({ lenU: aim.lenU, angle: ang });
      }
    }
    else if (g.current.kind === 'arrow') { const p = showActive(sO, pxO); setDraft(d => (d && d.kind === 'arrow' ? { ...d, to: p } : d)); }
    else if (g.current.kind === 'handle' && g.current.id != null) {
      const t: Pt = gb ? [sO[0] + gb[0], sO[1] + gb[1]] : sO;
      const p = showActive(t, pxO, { id: g.current.id, idx: g.current.idx! }); const id = g.current.id, idx = g.current.idx!;
      setScene(sc => ({ ...sc, walls: sc.walls.map(w => w.id === id ? { ...w, points: w.points.map((q, i) => i === idx ? p : q) } : w) }));
    } else if (g.current.kind === 'dragEquip' && g.current.id) {
      const t: Pt = gb ? [sO[0] + gb[0], sO[1] + gb[1]] : sO;
      const p = showActive(t, pxO); const id = g.current.id;
      setScene(sc => ({ ...sc, equipment: sc.equipment.map(q => q.id === id ? { ...q, x: p[0], y: p[1] } : q) }));
    } else if (g.current.kind === 'dragPoint' && g.current.id) {
      const t: Pt = gb ? [sO[0] + gb[0], sO[1] + gb[1]] : sO;
      const p = showActive(t, pxO); const id = g.current.id;
      setScene(sc => ({ ...sc, moisturePoints: (sc.moisturePoints ?? []).map(q => q.id === id ? { ...q, x: p[0], y: p[1] } : q) }));
    } else if (g.current.kind === 'place') { showActive(sO, pxO); }
    else if (g.current.kind === 'wet') {
      const fp = pxToScene(px);
      setActive({ scene: fp, px });
      setDraft(d => {
        if (!d || d.kind !== 'wet') return d;
        const last = d.pts[d.pts.length - 1];
        if (last && Math.hypot(fp[0] - last[0], fp[1] - last[1]) < 6) return d;
        return { ...d, pts: [...d.pts, fp] };
      });
    }
    else if (g.current.kind === 'startTap' || g.current.kind === 'floodTap' || g.current.kind === 'containTap') { if (g.current.moved) { g.current.kind = 'pan'; const [pdx, pdy] = panDelta([dx, dy], viewRef.current); setView(v => ({ ...v, tx: v.tx + pdx, ty: v.ty + pdy })); } }
    else if (g.current.kind === 'floodHandle' && selectedFlood) {
      showActive(sO, pxO);
      const fc = (scene.floodCuts ?? []).find(f => f.wallId === selectedFlood.wallId && f.edge === selectedFlood.edge);
      if (fc) {
        const full = edgeLenFt(scene, fc.wallId, fc.edge);
        const proj = Math.round(projectToEdgeFt(scene, fc.wallId, fc.edge, sO) * 12) / 12;
        const start = fc.startFt ?? 0;
        const end = start + (fc.lengthFt != null ? Math.min(fc.lengthFt, full - start) : full - start);
        if (g.current.floodWhich === 'start') { const ns = Math.max(0, Math.min(proj, end - 0.25)); updateFlood(selectedFlood, { startFt: ns, lengthFt: end - ns }); }
        else { const ne = Math.max(start + 0.25, Math.min(proj, full)); updateFlood(selectedFlood, { lengthFt: ne - start }); }
      }
    }
    else if (g.current.kind === 'floodMove' && selectedFlood) {
      showActive(sO, pxO);
      const fc = (scene.floodCuts ?? []).find(f => f.wallId === selectedFlood.wallId && f.edge === selectedFlood.edge);
      if (fc) {
        const full = edgeLenFt(scene, fc.wallId, fc.edge);
        const length = fc.lengthFt != null ? Math.min(fc.lengthFt, full) : full;
        const proj = Math.round(projectToEdgeFt(scene, fc.wallId, fc.edge, sO) * 12) / 12;
        const ns = Math.max(0, Math.min(proj - (g.current.floodGrab ?? 0), full - length));
        updateFlood(selectedFlood, { startFt: ns, lengthFt: length });
      }
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

    if (g.current.kind === 'wet' && draft?.kind === 'wet') {
      if (g.current.moved && draft.pts.length >= 1) {
        const stroke = draft.pts;
        if (activeWetId) {
          setScene(sc => ({ ...sc, wetAreas: sc.wetAreas.map(w => (w.id === activeWetId ? { ...w, strokes: [...(w.strokes ?? []), stroke] } : w)) }));
        } else {
          snapshot(); const id = uid();
          setScene(sc => ({ ...sc, wetAreas: [...sc.wetAreas, { id, points: [], brush: WET_BRUSH, strokes: [stroke], surface: 'floor' as const }] }));
          setActiveWetId(id);
        }
      }
      setDraft(null);
    } else if (g.current.kind === 'arrow' && draft?.kind === 'arrow') {
      const { from, to } = draft;
      if (Math.hypot(to[0] - from[0], to[1] - from[1]) >= GRID) { snapshot(); setScene(sc => ({ ...sc, arrows: [...(sc.arrows ?? []), { id: uid(), from, to }] })); }
      setDraft(null);
    } else if (g.current.kind === 'startTap' && !g.current.moved && g.current.downScene) {
      // THE ONE TAP a custom room takes: where its first corner goes. It snaps to the inch
      // and to any corner already on the map, so two rooms meet exactly. The length sheet
      // opens right away for the first wall.
      const { p } = snapPoint(g.current.downScene);
      if (!pointInAnyRoom(p)) { setBuild({ corners: [p] }); setAim(null); setLenSheet(true); }
    } else if (g.current.kind === 'aimRotate') {
      // Aimed wall is live in `aim`; nothing to commit on release, it just stopped moving.
    } else if (g.current.kind === 'floodTap' && !g.current.moved) {
      const fe = g.current.floodEdge;
      if (fe) {
        const exists = (scene.floodCuts ?? []).some(f => f.wallId === fe.wallId && f.edge === fe.edge);
        if (!exists) { snapshot(); setScene(sc => ({ ...sc, floodCuts: [...(sc.floodCuts ?? []), { wallId: fe.wallId, edge: fe.edge, heightFt: 2 }] })); }
        setSelectedFlood({ wallId: fe.wallId, edge: fe.edge });
        setPendingFlood({ wallId: fe.wallId, edge: fe.edge });
      } else { setSelectedFlood(null); }
    } else if (g.current.kind === 'containTap' && !g.current.moved && g.current.downScene) {
      const pt = g.current.downScene, id = uid();
      snapshot(); setScene(sc => ({ ...sc, containments: [...(sc.containments ?? []), { id, x: pt[0], y: pt[1], widthFt: 3, heightFt: 8 }] }));
      setPendingContain({ id, isNew: true });
    } else if (g.current.kind === 'pan' && !g.current.moved && g.current.openingTap) {
      // TAP AN OPENING to edit it: change its type, width, height, or remove it.
      openOpeningEditor(g.current.openingTap);
    } else if (g.current.kind === 'pan' && !g.current.moved && g.current.edgeTap) {
      // TAP A WALL to select it. Its exact length appears, tappable to type.
      setSelEdge(g.current.edgeTap);
      setSelectedId(null);
    } else if (g.current.kind === 'pan' && !g.current.moved && g.current.wallTap) {
      // The polygon is now SELECTED (set in onDown). Its action bar at the bottom offers
      // its material and, when this sketch holds more than one room outline, splitting it
      // into its own room.
      setSelectedId(g.current.wallTap);
    } else if (g.current.kind === 'place' && active) {
      commitPlace(active.scene, g.current.editId);
    }
    g.current.kind = 'idle'; g.current.id = undefined; g.current.idx = undefined; g.current.editId = undefined; g.current.wallTap = undefined; g.current.openingTap = undefined; g.current.edgeTap = undefined; g.current.downScene = undefined;
    setActive(null); setGuide(null);
  }

  function doPinch() {
    const [a, b] = [...pointers.current.values()];
    const pa = toPixel(a.x, a.y), pb = toPixel(b.x, b.y);
    const dist = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
    const cx = (pa[0] + pb[0]) / 2, cy = (pa[1] + pb[1]) / 2;
    const pv = pinch.current!; const v = viewRef.current;
    const k = clampK(v.k * (dist / (pv.dist || dist))); const f = k / v.k;
    let tx = cx - (cx - v.tx) * f, ty = cy - (cy - v.ty) * f;
    tx += cx - pv.cx; ty += cy - pv.cy;
    setView(vv => ({ ...vv, tx, ty, k })); pinch.current = { dist, cx, cy };
  }

  function deleteSelected() {
    if (!selectedId) return; snapshot();
    setScene(sc => ({ ...sc, equipment: sc.equipment.filter(e => e.id !== selectedId), moisturePoints: (sc.moisturePoints ?? []).filter(m => m.id !== selectedId), arrows: (sc.arrows ?? []).filter(a => a.id !== selectedId), openings: (sc.openings ?? []).filter(o => o.id !== selectedId) }));
    setSelectedId(null);
  }
  const updateFlood = (sel: { wallId: string; edge: number }, patch: Partial<FloodCut>) =>
    setScene(sc => ({ ...sc, floodCuts: (sc.floodCuts ?? []).map(f => (f.wallId === sel.wallId && f.edge === sel.edge ? { ...f, ...patch } : f)) }));
  function finishWet() { if (!activeWetId) return; setPendingWetId(activeWetId); setActiveWetId(null); }
  function saveReading() {
    if (!pendingReading) return;
    const v = rdgValue.trim();
    if (!v) { setPendingReading(null); return; }
    snapshot();
    const mat = rdgMaterial, lbl = rdgLabel.trim() || undefined;
    if (pendingReading.id) {
      const id = pendingReading.id;
      setScene(sc => ({ ...sc, moisturePoints: (sc.moisturePoints ?? []).map(m => (m.id === id ? { ...upsertReading(m, activeDate, v), material: mat, label: lbl } : m)) }));
    } else {
      const { x, y } = pendingReading;
      setScene(sc => ({ ...sc, moisturePoints: [...(sc.moisturePoints ?? []), { id: uid(), x, y, readings: [{ date: activeDate, value: v }], material: mat, label: lbl }] }));
    }
    setPendingReading(null);
  }
  function undoWetStroke() {
    if (!activeWetId) return;
    setScene(sc => {
      const w = sc.wetAreas.find(x => x.id === activeWetId);
      if (!w) return sc;
      const strokes = (w.strokes ?? []).slice(0, -1);
      if (strokes.length === 0) { setActiveWetId(null); return { ...sc, wetAreas: sc.wetAreas.filter(x => x.id !== activeWetId) }; }
      return { ...sc, wetAreas: sc.wetAreas.map(x => (x.id === activeWetId ? { ...x, strokes } : x)) };
    });
  }

  // ---- CUSTOM ROOM: ANCHOR + AIMED WALL ------------------------------------
  //
  // Drop the first corner. Then each wall is a LOCKED length pinned to the last corner,
  // and the tech drags its free end to point it any direction (fully free, no snapping).
  // Length only changes by retyping it. "Set corner" plants the free end and starts the
  // next wall. Dragging the free end onto the starting corner, or "Close room", finishes.
  const buildCorners = build?.corners ?? [];
  const buildEnd: Pt | null = buildCorners.length ? buildCorners[buildCorners.length - 1] : null;
  const startCorner: Pt | null = buildCorners.length ? buildCorners[0] : null;
  // The raw free end of the wall being aimed, before any snap to the start corner.
  const aimEndRaw: Pt | null = buildEnd && aim
    ? [buildEnd[0] + Math.cos(aim.angle) * aim.lenU, buildEnd[1] + Math.sin(aim.angle) * aim.lenU]
    : null;
  // Is the aimed free end close enough to the start corner to close onto it? Snap reach is
  // generous (a fingertip), and the wall must be the fourth or later so a room has 3+ sides.
  const aimClosesRoom = !!(aimEndRaw && startCorner && buildCorners.length >= 3
    && Math.hypot(aimEndRaw[0] - startCorner[0], aimEndRaw[1] - startCorner[1]) < 26 / view.k);
  // The free end the tech actually sees: SNAPPED to the start corner when it is in reach, so
  // the last wall lands exactly on the origin and the room truly closes, no floating gap.
  const aimEnd: Pt | null = aimClosesRoom && startCorner ? startCorner : aimEndRaw;

  // Type / retype the current wall's length. First wall starts the aim pointing right;
  // retyping an existing aim keeps its angle and only swaps the length.
  function applyWallLength(ft: number) {
    const lenU = ft * UNITS_PER_FT;
    setAim(a => ({ lenU, angle: a ? a.angle : 0 }));
    setLenSheet(false);
  }
  // Plant the aimed wall's free end as a real corner and begin the next wall. If the tech
  // aimed it onto the start corner, that plants the closing wall and finishes the room.
  function setCorner() {
    if (!buildEnd || !aim || !aimEnd) return;
    if (aimClosesRoom) { commitRoom(buildCorners); return; }   // last wall lands on start: close clean
    setBuild({ corners: [...buildCorners, aimEnd] });
    setAim(null);
    setLenSheet(true);   // straight into the next wall's length
  }
  function undoWall() {
    if (aim) { setAim(null); return; }                 // drop the wall being aimed first
    if (buildCorners.length <= 1) { setBuild(null); setLenSheet(false); return; }
    setBuild({ corners: buildCorners.slice(0, -1) });
    setAim(null);
  }
  // How far the placed walls miss the start corner by, in feet. This is the honest number:
  // if it is more than an inch or so, the typed lengths do not actually meet and the tech
  // should know before it goes on a carrier document.
  const closeGapFt: number = buildEnd && startCorner
    ? Math.hypot(buildEnd[0] - startCorner[0], buildEnd[1] - startCorner[1]) / UNITS_PER_FT
    : 0;
  // Close the room from the last PLACED corner. If the walls already meet the start (within
  // an inch) it just closes. If they miss, we ask first and name the gap, because closing
  // anyway means the closing wall is whatever length reaches the start, not what was typed.
  function requestClose() {
    if (aim) { setAim(null); }              // drop any half-aimed wall; we close from placed corners
    if (buildCorners.length < 3) return;
    if (closeGapFt <= 1 / 12 + 1e-6) { commitRoom(buildCorners); return; }
    setConfirmClose(true);
  }
  function commitRoom(pts: Pt[]) {
    if (pts.length < 3 || polygonArea(pts) < UNITS_PER_FT * UNITS_PER_FT * 0.25) { setBuild(null); setAim(null); setLenSheet(false); setConfirmClose(false); return; }
    snapshot();
    setScene(sc => ({ ...sc, walls: [...sc.walls, { id: uid(), points: pts }] }));
    setBuild(null); setAim(null); setLenSheet(false); setConfirmClose(false);
    selectTool('move');
  }
  // The outline as it would close right now, for the fill/area preview.
  const closePreview: Pt[] | null = (() => {
    if (!build) return null;
    if (aimEnd && !aimClosesRoom) return [...buildCorners, aimEnd];
    return buildCorners;
  })();
  const buildAreaSqFt = closePreview && closePreview.length >= 3
    ? Math.round(polygonArea(closePreview) / (UNITS_PER_FT * UNITS_PER_FT)) : 0;
  const aimLenFt = aim ? aim.lenU / UNITS_PER_FT : 0;

  // TYPE THE ROOM, DO NOT DRAW IT.
  //
  // The rectangle lands centred on what the tech is looking at, with its ORIGIN snapped to
  // the inch rather than its size, so the width and length stay exactly what was typed.
  // Then we drop into Move, where every wall shows its length and can be retyped.
  function createRectExact(widthFt: number, lengthFt: number) {
    const w = widthFt * UNITS_PER_FT, h = lengthFt * UNITS_PER_FT;
    const c = size.w ? pxToScene([size.w / 2, size.h / 2]) : ([SCENE_SIZE / 2, SCENE_SIZE / 2] as Pt);
    if (pointInAnyRoom(c)) { setSizeSheet(false); return; }
    const x = snapGrid(c[0] - w / 2, INCH), y = snapGrid(c[1] - h / 2, INCH);
    const pts: Pt[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    snapshot();
    setScene(sc => ({ ...sc, walls: [...sc.walls, { id: uid(), points: pts }] }));
    setSizeSheet(false);
    selectTool('move');
  }

  // Placing an opening OPENS THE MEASUREMENT SHEET. It does not write anything yet.
  function commitPlace(p: Pt, editId?: string) {
    if (tool === 'origin') {
      snapshot();
      setScene(sc => ({ ...sc, originOfLoss: p }));
    } else if (tool === 'equip') {
      snapshot();
      setScene(sc => ({ ...sc, equipment: [...sc.equipment, { id: uid(), type: equipType, x: p[0], y: p[1] }] }));
    } else if (tool === 'door') {
      // Tapping an opening that is already on the wall EDITS it, rather than dropping a
      // second one on top of it.
      const existing = hitOpening(scene, p[0], p[1]);
      if (existing) { openOpeningEditor(existing.id); return; }
      const near = nearestWallEdge(scene, p[0], p[1]);
      if (near && near.dist < 45 && near.edgeLen > UNITS_PER_FT) {
        setOpeningSheet({
          wallId: near.wallId, edge: near.edge, t: near.t, kind: doorKind,
          edgeLenFt: near.edgeLen / UNITS_PER_FT,
          widthFt: OPENING_DEFAULT_FT[doorKind],
          step: 'width'
        });
      }
    } else if (tool === 'reading') {
      const cur = editId ? (scene.moisturePoints ?? []).find(m => m.id === editId) : null;
      setRdgValue(cur ? pointDisplay(cur, activeDate) : '');
      setRdgMaterial(cur?.material);
      setRdgLabel(cur?.label ?? '');
      setPendingReading(editId ? { id: editId, x: p[0], y: p[1] } : { x: p[0], y: p[1] });
    }
  }

  // The opening only enters the scene once its numbers are real. heightFt stays undefined
  // for a missing wall, which is correct: openingHeightFt gives it the FULL ceiling height
  // by definition, and calls it measured rather than assumed.
  function commitOpening(d: OpeningDraft, heightFt?: number) {
    snapshot();
    setScene(sc => {
      const clampT = (o: { wallId: string; edge: number; t: number }) => {
        const w = sc.walls.find(x => x.id === o.wallId);
        if (!w) return o.t;
        const n = w.points.length;
        const a = w.points[o.edge], b = w.points[(o.edge + 1) % n];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const halfFrac = Math.min(0.45, (d.widthFt * UNITS_PER_FT / 2) / len);
        return Math.max(halfFrac, Math.min(1 - halfFrac, o.t));
      };
      if (d.id) {
        return {
          ...sc,
          openings: (sc.openings ?? []).map(o => o.id === d.id
            ? { ...o, widthFt: d.widthFt, heightFt, t: clampT(o) }
            : o)
        };
      }
      const next = { id: uid(), wallId: d.wallId, edge: d.edge, t: d.t, widthFt: d.widthFt, heightFt, kind: d.kind };
      return { ...sc, openings: [...(sc.openings ?? []), { ...next, t: clampT(next) }] };
    });
  }

  function pointInWrap(x: number, y: number) {
    const el = wrapRef.current; if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  function onPaletteDown(e: React.PointerEvent, item: { key: string; droppable: boolean; onSelect: () => void }) {
    item.onSelect();
    if (!item.droppable) return;
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
      const { p, gx, gy } = snapPoint(pxToScene(opx));
      setActive({ scene: p, px: opx });
      setGuide(gx != null || gy != null ? { x: gx, y: gy } : null);
    } else { setActive(null); setGuide(null); }
    setPaletteGhost({ kind: d.kind, x: e.clientX, y: e.clientY, over });
  }
  function onPaletteUp(e: React.PointerEvent) {
    const d = pdrag.current; if (!d || e.pointerId !== d.id) return;
    if (d.dragging && pointInWrap(e.clientX, e.clientY)) {
      const { p } = snapPoint(pxToScene(toPixel(e.clientX - OFF, e.clientY - OFF)));
      commitPlace(p);
    }
    pdrag.current = null; setPaletteGhost(null); setActive(null); setGuide(null);
  }
  function onPaletteCancel() { pdrag.current = null; setPaletteGhost(null); setActive(null); setGuide(null); }
  function zoomBy(factor: number) {
    const v = viewRef.current; const cx = size.w / 2, cy = size.h / 2;
    const k = clampK(v.k * factor); const f = k / v.k;
    setView(vv => ({ ...vv, k, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f }));
  }
  function onWheel(e: React.WheelEvent) {
    const v = viewRef.current;
    if (e.ctrlKey || e.metaKey) { const [fx, fy] = toPixel(e.clientX, e.clientY); const k = clampK(v.k * Math.pow(2, -e.deltaY * 0.01)); const f = k / v.k; setView({ ...v, k, tx: fx - (fx - v.tx) * f, ty: fy - (fy - v.ty) * f }); }
    else { const [pdx, pdy] = panDelta([-e.deltaX, -e.deltaY], v); setView({ ...v, tx: v.tx + pdx, ty: v.ty + pdy }); }
  }

  // Saving writes the room's real DIMENSIONS back to resto_rooms.
  async function save() {
    setSaving(true);
    try {
      if (sketch?.id) await supabase.from('resto_sketches').update({ canvas_json: scene as any }).eq('id', sketch.id);
      else await supabase.from('resto_sketches').insert({ org_id: orgId, room_id: roomId, type: 'moisture_map', canvas_json: scene as any });

      const bbox = roomBBoxFt(scene);
      const patch: any = {};
      if (bbox.widthFt > 0) patch.width_ft = bbox.widthFt;
      if (bbox.lengthFt > 0) patch.length_ft = bbox.lengthFt;
      if (ceilingFt && ceilingFt > 0) patch.height_ft = ceilingFt;
      if (Object.keys(patch).length) await supabase.from('resto_rooms').update(patch).eq('id', roomId);

      onClose(true);
    } finally { setSaving(false); }
  }

  const k = view.k;
  const vMinX = -view.tx / k, vMinY = -view.ty / k, vMaxX = (size.w - view.tx) / k, vMaxY = (size.h - view.ty) / k;
  const gxs: number[] = [], gys: number[] = [];
  if (k > 0.015) {
    for (let x = Math.floor(vMinX / GRID) * GRID; x <= vMaxX; x += GRID) gxs.push(x);
    for (let y = Math.floor(vMinY / GRID) * GRID; y <= vMaxY; y += GRID) gys.push(y);
  }
  const isCustom = tool === 'room' && roomMode === 'custom';
  const placedWalls = Math.max(0, buildCorners.length - 1);
  const drawReadout = build
    ? (aim
      ? `Aim this ${ftLabel(aim.lenU)} wall, then Set corner${buildAreaSqFt > 0 ? ` \u00b7 about ${buildAreaSqFt} sq ft` : ''}`
      : placedWalls === 0
        ? 'Type the first wall\u2019s length'
        : `${placedWalls} wall${placedWalls === 1 ? '' : 's'} placed${buildAreaSqFt > 0 ? ` \u00b7 about ${buildAreaSqFt} sq ft` : ''}`)
    : null;
  const fingerScene = active && tool !== 'room' && tool !== 'wet' ? pxToScene([active.px[0] + OFF, active.px[1] + OFF]) : null;
  const counts = {
    am: scene.equipment.filter(e => e.type === 'air_mover').length,
    dh: scene.equipment.filter(e => e.type === 'dehumidifier').length,
    as: scene.equipment.filter(e => e.type === 'air_scrubber').length,
    mp: (scene.moisturePoints ?? []).length
  };
  const cls = scene.classOfLoss ?? 2;
  const floorSqFt = Math.round(sceneFloorSqFt(scene));
  const sug = suggestEquipment(floorSqFt, cls);
  const dims = roomDimensions(scene, ceilingFt);

  const isPlace = PLACE_SET.includes(tool);
  const selectTool = (t: Tool) => {
    setTool(t);
    if (PLACE_SET.includes(t)) setLastPlace(t);
    if (t === 'floodcut' || t === 'containment') setLastScope(t);
    if (activeWetId && t !== 'wet') { setPendingWetId(activeWetId); setActiveWetId(null); }
    if (t !== 'floodcut') setSelectedFlood(null);
    if (t !== 'room') { setBuild(null); setAim(null); setLenSheet(false); setConfirmClose(false); }
    setSelectedId(null); setSelEdge(null); setDraft(null); setActive(null); setGuide(null);
  };

  const activeKey = tool === 'equip' ? equipType : tool === 'door' ? doorKind : tool;
  const PLACE_ITEMS: { key: string; label: string; droppable: boolean; onSelect: () => void }[] = [
    { key: 'air_mover', label: 'Air Mover', droppable: true, onSelect: () => { setEquipType('air_mover'); selectTool('equip'); } },
    { key: 'dehumidifier', label: 'Dehumidifier', droppable: true, onSelect: () => { setEquipType('dehumidifier'); selectTool('equip'); } },
    { key: 'air_scrubber', label: 'Air Scrubber', droppable: true, onSelect: () => { setEquipType('air_scrubber'); selectTool('equip'); } },
    { key: 'reading', label: 'Moisture Reading', droppable: true, onSelect: () => selectTool('reading') },
    { key: 'origin', label: 'Origin (X)', droppable: true, onSelect: () => selectTool('origin') }
  ];

  const isRoom = tool === 'room' || tool === 'door';
  const isScope = tool === 'floodcut' || tool === 'containment';
  const fcStats = floodCutStats(scene);
  const cStats = containmentStats(scene);
  const OPENING_ITEMS: { key: string; label: string; droppable: boolean; onSelect: () => void }[] = OPENING_KINDS.map(kd => ({
    key: kd, label: OPENING_LABEL[kd], droppable: true, onSelect: () => { setDoorKind(kd); selectTool('door'); }
  }));
  const activeRoomKey = tool === 'door' ? doorKind : tool === 'room' ? roomMode : '';
  function pickRoom(key: string) {
    setLastRoomKey(key);
    if (key === 'rect') { setRoomMode('rect'); selectTool('room'); setBuild(null); setAim(null); setLenSheet(false); setSizeSheet(true); }
    else if (key === 'custom') { setRoomMode('custom'); selectTool('room'); }
    else { setDoorKind(key as OpeningKind); selectTool('door'); }
  }

  // the selected wall's exact length, so a tech can tap it and type the real number
  const selEdgeWall = selEdge ? scene.walls.find(w => w.id === selEdge.wallId) : null;
  const selEdgeLenFt = selEdgeWall && selEdge ? polyEdgeLenFt(selEdgeWall.points, selEdge.edge) : 0;
  const selEdgeMid: Pt | null = selEdgeWall && selEdge ? (() => {
    const n = selEdgeWall.points.length;
    const a = selEdgeWall.points[selEdge.edge], b = selEdgeWall.points[(selEdge.edge + 1) % n];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  })() : null;

  // An opening already on the wall, selected in Move mode.
  const selOpen = selectedId ? (scene.openings ?? []).find(o => o.id === selectedId) ?? null : null;
  // A whole room outline selected by tapping inside it (not an edge, not an opening).
  const selWall = selectedId ? scene.walls.find(w => w.id === selectedId) ?? null : null;

  // Tag a room outline's material.
  function setMaterial(wallId: string) {
    const cur = scene.walls.find(w => w.id === wallId);
    const mat = prompt('Material for this area (e.g. Drywall, Carpet, Subfloor)', cur?.material ?? '');
    if (mat != null) { snapshot(); const m = mat.trim(); setScene(sc => ({ ...sc, walls: sc.walls.map(w => w.id === wallId ? { ...w, material: m || undefined } : w) })); }
  }

  // Promote one wall polygon (the closet) into its own resto_rooms row with its own sketch,
  // and remove it from this one. New room + sketch are created FIRST, so a failure never
  // strips the closet out of this map with nowhere for it to go.
  async function splitOutRoom(wallId: string, rawName: string) {
    const sid = resolvedStructureId;
    if (!sid) { alert('Could not find the structure for this room, so the closet cannot be split out. Open the room from the structure and try again.'); return; }
    const parts = partitionScene(scene, wallId);
    if (!parts) { setSplitName(null); return; }
    const name = rawName.trim() || 'Closet';
    setSplitting(true);
    try {
      const { data: sib } = await supabase.from('resto_rooms')
        .select('sort_order').eq('structure_id', sid).order('sort_order', { ascending: false }).limit(1);
      const nextSort = (Number((sib as any)?.[0]?.sort_order) || 0) + 1;

      const cb = roomBBoxFt(parts.closet);
      const { data: room, error: rErr } = await supabase.from('resto_rooms')
        .insert({
          org_id: orgId, structure_id: sid, name, sort_order: nextSort, affected: true,
          width_ft: cb.widthFt > 0 ? Math.round(cb.widthFt * 10) / 10 : null,
          length_ft: cb.lengthFt > 0 ? Math.round(cb.lengthFt * 10) / 10 : null,
          height_ft: ceilingFt && ceilingFt > 0 ? ceilingFt : null
        })
        .select('id').single();
      if (rErr || !room) throw new Error('Could not create the room: ' + (rErr?.message ?? 'no row came back'));
      const newRoomId = (room as any).id;

      const { error: skErr } = await supabase.from('resto_sketches')
        .insert({ org_id: orgId, room_id: newRoomId, type: 'moisture_map', canvas_json: parts.closet as any });
      if (skErr) throw new Error('Could not create the new room sketch: ' + skErr.message);

      // Only now remove the closet from THIS sketch.
      if (sketch?.id) {
        const { error: uErr } = await supabase.from('resto_sketches')
          .update({ canvas_json: parts.remain as any }).eq('id', sketch.id);
        if (uErr) throw new Error(`"${name}" was created, but removing it from this map failed: ${uErr.message}. You can delete the extra outline here by hand.`);
      } else {
        const { error: iErr } = await supabase.from('resto_sketches')
          .insert({ org_id: orgId, room_id: roomId, type: 'moisture_map', canvas_json: parts.remain as any });
        if (iErr) throw new Error(`"${name}" was created, but saving this map failed: ${iErr.message}.`);
      }

      const rb = roomBBoxFt(parts.remain);
      if (rb.widthFt > 0 && rb.lengthFt > 0) {
        await supabase.from('resto_rooms')
          .update({ width_ft: Math.round(rb.widthFt * 10) / 10, length_ft: Math.round(rb.lengthFt * 10) / 10 })
          .eq('id', roomId);
      }

      setScene(parts.remain);
      setHistory([]);
      setDirty(false);
      setSelectedId(null);
      setSplitName(null);
      setSplitDone(name);
    } catch (e: any) {
      alert(e?.message ?? 'Could not split the room.');
    } finally {
      setSplitting(false);
    }
  }
  const selOpenSize = !selOpen ? ''
    : selOpen.kind === 'missing_wall' ? `${formatFeetInches(selOpen.widthFt)} wide, full height`
    : selOpen.heightFt ? `${formatFeetInches(selOpen.widthFt)} \u00d7 ${formatFeetInches(selOpen.heightFt)}`
    : `${formatFeetInches(selOpen.widthFt)}, height not measured`;

  const content = (
    <>
      <g stroke="#DCE6F1" vectorEffect="non-scaling-stroke" strokeWidth={1}>
        {gxs.map(x => <line key={'gx' + x} x1={x} y1={vMinY} x2={x} y2={vMaxY} />)}
        {gys.map(y => <line key={'gy' + y} x1={vMinX} y1={y} x2={vMaxX} y2={y} />)}
      </g>
      {guide?.x != null && <line x1={guide.x} y1={vMinY} x2={guide.x} y2={vMaxY} stroke="#F26B3A" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="5 4" />}
      {guide?.y != null && <line x1={vMinX} y1={guide.y} x2={vMaxX} y2={guide.y} stroke="#F26B3A" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="5 4" />}

      {draft?.kind === 'arrow' && (() => {
        const [x1, y1] = draft.from, [x2, y2] = draft.to;
        const ang = Math.atan2(y2 - y1, x2 - x1), hl = 34, hw = 15;
        const bx = x2 - hl * Math.cos(ang), by = y2 - hl * Math.sin(ang);
        return (
          <g stroke="#4F46E5" fill="#4F46E5">
            <line x1={x1} y1={y1} x2={bx} y2={by} strokeWidth={5} strokeLinecap="round" />
            <polygon stroke="none" points={`${x2},${y2} ${bx - hw * Math.sin(ang)},${by + hw * Math.cos(ang)} ${bx + hw * Math.sin(ang)},${by - hw * Math.cos(ang)}`} />
          </g>
        );
      })()}
      <SceneLayers scene={scene} selectedId={selectedId} activeDate={activeDate} rot={view.rot} />

      {/* THE CUSTOM ROOM BEING BUILT. Placed walls are solid. The wall being aimed is a
          live segment off the last corner: locked length, free end dragged to any angle.
          The starting corner is always visible so the tech can aim back at it to close. */}
      {build && (
        <g>
          {/* faint fill of the shape as it would close right now */}
          {closePreview && closePreview.length >= 3 && (
            <polygon points={ptsStr(closePreview)} fill="#1483C2" fillOpacity={0.07} stroke="none" style={{ pointerEvents: 'none' }} />
          )}
          {/* the closing edge, dashed, from the aimed/last corner back to the start */}
          {closePreview && closePreview.length >= 3 && (
            <polyline points={ptsStr([closePreview[closePreview.length - 1], closePreview[0]])}
                      fill="none" stroke="#1483C2" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeDasharray="7 6" opacity={0.5} style={{ pointerEvents: 'none' }} />
          )}
          {/* walls already placed */}
          {buildCorners.length >= 2 && (
            <polyline points={ptsStr(buildCorners)} fill="none" stroke="#1483C2" strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" style={{ pointerEvents: 'none' }} />
          )}
          {buildCorners.slice(1).map((pt, i) => {
            const a = buildCorners[i];
            const mid: Pt = [(a[0] + pt[0]) / 2, (a[1] + pt[1]) / 2];
            const len = Math.hypot(pt[0] - a[0], pt[1] - a[1]);
            return (
              <text key={'bl' + i} x={mid[0]} y={mid[1]} style={{ pointerEvents: 'none' }}
                    transform={view.rot ? `rotate(${-view.rot} ${mid[0]} ${mid[1]})` : undefined}
                    textAnchor="middle" dominantBaseline="central" fontSize={13 / k} fontWeight={800}
                    fill="#0E2A4D" stroke="#fff" strokeWidth={4.5 / k} paintOrder="stroke">{ftLabel(len)}</text>
            );
          })}
          {/* the LIVE aimed wall: pinned at buildEnd, free end at aimEnd */}
          {buildEnd && aimEnd && (
            <g>
              <line x1={buildEnd[0]} y1={buildEnd[1]} x2={aimEnd[0]} y2={aimEnd[1]}
                    stroke={aimClosesRoom ? '#16A34A' : '#F26B3A'} strokeWidth={5} vectorEffect="non-scaling-stroke" strokeLinecap="round" style={{ pointerEvents: 'none' }} />
              {(() => {
                const mid: Pt = [(buildEnd[0] + aimEnd[0]) / 2, (buildEnd[1] + aimEnd[1]) / 2];
                const len = Math.hypot(aimEnd[0] - buildEnd[0], aimEnd[1] - buildEnd[1]);
                return (
                  <text x={mid[0]} y={mid[1]} style={{ pointerEvents: 'none' }}
                        transform={view.rot ? `rotate(${-view.rot} ${mid[0]} ${mid[1]})` : undefined}
                        textAnchor="middle" dominantBaseline="central" fontSize={14 / k} fontWeight={900}
                        fill={aimClosesRoom ? '#16A34A' : '#C2410C'} stroke="#fff" strokeWidth={4.5 / k} paintOrder="stroke">{ftLabel(len)}</text>
                );
              })()}
              {/* the DRAG HANDLE: the free end. This is the only thing you grab to aim. */}
              <circle cx={aimEnd[0]} cy={aimEnd[1]} r={16 / k} fill={aimClosesRoom ? '#16A34A' : '#F26B3A'} fillOpacity={0.18} stroke={aimClosesRoom ? '#16A34A' : '#F26B3A'} strokeWidth={2.5 / k} />
              <circle cx={aimEnd[0]} cy={aimEnd[1]} r={7 / k} fill={aimClosesRoom ? '#16A34A' : '#F26B3A'} stroke="#fff" strokeWidth={2.5 / k} />
            </g>
          )}
          {/* every joint, with the START corner drawn larger and ringed so it is obvious */}
          {buildCorners.map((pt, i) => (
            <g key={'bc' + i} style={{ pointerEvents: 'none' }}>
              {i === 0 && <circle cx={pt[0]} cy={pt[1]} r={13 / k} fill="none" stroke="#1483C2" strokeWidth={2 / k} strokeDasharray={`${3 / k} ${3 / k}`} />}
              <circle cx={pt[0]} cy={pt[1]} r={(i === 0 ? 8 : 5.5) / k}
                      fill={i === 0 ? '#1483C2' : '#fff'} stroke="#1483C2" strokeWidth={2.5 / k} />
            </g>
          ))}
        </g>
      )}

      {/* EVERY WALL SHOWS ITS EXACT LENGTH, in every tool. */}
      {showWalls && scene.walls.map(w => w.points.map((_pt, ei) => {
        const n = w.points.length;
        const a = w.points[ei], b = w.points[(ei + 1) % n];
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const len = polyEdgeLenFt(w.points, ei);
        if (len < 0.3) return null;
        const on = selEdge?.wallId === w.id && selEdge.edge === ei;
        return (
          <g key={w.id + '-len-' + ei} style={{ pointerEvents: 'none' }}>
            {on && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#1483C2" strokeWidth={7 / k} strokeLinecap="round" opacity={0.55} />}
            <text x={mid[0]} y={mid[1]} transform={view.rot ? `rotate(${-view.rot} ${mid[0]} ${mid[1]})` : undefined}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={(on ? 15 : 12) / k} fontWeight={on ? 900 : 700}
                  fill={on ? '#1483C2' : '#475569'} stroke="#fff" strokeWidth={4.5 / k} paintOrder="stroke">
              {formatFeetInches(len)}
            </text>
          </g>
        );
      }))}

      {/* OPENINGS SHOW THEIR SIZE, off the wall line so they do not collide with the wall
          length. An opening still missing a height reads amber with "h?" so it gets measured. */}
      {showWalls && (scene.openings ?? []).map(o => {
        const w = scene.walls.find(x => x.id === o.wallId);
        if (!w) return null;
        const n = w.points.length;
        const a = w.points[o.edge], b = w.points[(o.edge + 1) % n];
        const ex = b[0] - a[0], ey = b[1] - a[1]; const len = Math.hypot(ex, ey) || 1;
        const t = o.t ?? 0.5;
        const cx = a[0] + ex * t, cy = a[1] + ey * t;
        const nx = -ey / len, ny = ex / len;   // perpendicular, to push the label off the wall
        const off = 15 / k;
        const lx = cx + nx * off, ly = cy + ny * off;
        const measured = o.kind === 'missing_wall' || o.heightFt != null;
        const label = o.kind === 'missing_wall'
          ? formatFeetInches(o.widthFt)
          : o.heightFt != null
            ? `${formatFeetInches(o.widthFt)} \u00d7 ${formatFeetInches(o.heightFt)}`
            : `${formatFeetInches(o.widthFt)}, h?`;
        const on = selectedId === o.id;
        return (
          <text key={o.id + '-size'} x={lx} y={ly}
                transform={view.rot ? `rotate(${-view.rot} ${lx} ${ly})` : undefined}
                textAnchor="middle" dominantBaseline="central"
                fontSize={(on ? 13 : 11) / k} fontWeight={on ? 900 : 700}
                fill={on ? '#1483C2' : measured ? '#0369a1' : '#b45309'}
                stroke="#fff" strokeWidth={4 / k} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
            {label}
          </text>
        );
      })}

      {draft?.kind === 'wet' && draft.pts.length > 0 && (
        draft.pts.length === 1
          ? <circle cx={draft.pts[0][0]} cy={draft.pts[0][1]} r={WET_BRUSH / 2} fill="#7DD3FC" fillOpacity={0.55} />
          : <polyline points={ptsStr(draft.pts)} fill="none" stroke="#7DD3FC" strokeOpacity={0.55} strokeWidth={WET_BRUSH} strokeLinecap="round" strokeLinejoin="round" />
      )}

      {tool === 'floodcut' && selectedFlood && (() => {
        const fc = (scene.floodCuts ?? []).find(f => f.wallId === selectedFlood.wallId && f.edge === selectedFlood.edge);
        const ends = fc ? floodCutEnds(scene, fc) : null;
        if (!ends) return null;
        return (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={ends.start[0]} y1={ends.start[1]} x2={ends.end[0]} y2={ends.end[1]} stroke="#F59E0B" strokeWidth={3} vectorEffect="non-scaling-stroke" opacity={0.5} />
            {[ends.start, ends.end].map((pt, i) => (
              <g key={i}>
                <circle cx={pt[0]} cy={pt[1]} r={13 / k} fill="#fff" stroke="#F59E0B" strokeWidth={3} vectorEffect="non-scaling-stroke" />
                <circle cx={pt[0]} cy={pt[1]} r={4.5 / k} fill="#F59E0B" />
              </g>
            ))}
          </g>
        );
      })()}
      {tool === 'wet' && active && (
        <circle cx={active.scene[0]} cy={active.scene[1]} r={WET_BRUSH / 2} fill="#7DD3FC" fillOpacity={0.25} stroke="#0284c7" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      )}
      {fingerScene && (
        <g style={{ pointerEvents: 'none' }}>
          <line x1={fingerScene[0]} y1={fingerScene[1]} x2={active!.scene[0]} y2={active!.scene[1]} stroke="#1483C2" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeDasharray="4 3" opacity={0.55} />
          <circle cx={fingerScene[0]} cy={fingerScene[1]} r={9 / k} fill="#1483C2" fillOpacity={0.18} stroke="#1483C2" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </g>
      )}

      {active && tool === 'equip' && (
        <g transform={`translate(${active.scene[0]},${active.scene[1]})`} opacity={0.5} style={{ pointerEvents: 'none' }}>
          <circle r={26} fill={EQUIP_META[equipType].fill} stroke={EQUIP_META[equipType].ring} strokeWidth={3} />
          <g transform="scale(2)"><EquipIcon type={equipType} /></g>
        </g>
      )}
      {active && tool === 'reading' && (
        <g transform={`translate(${active.scene[0]},${active.scene[1]})`} opacity={0.55} style={{ pointerEvents: 'none' }}>
          <path d="M0 -30 C 17 -8 22 2 22 10 A22 22 0 1 1 -22 10 C -22 2 -17 -8 0 -30 Z" fill="#F26B3A" />
        </g>
      )}
      {active && tool === 'door' && (() => {
        const near = nearestWallEdge(scene, active.scene[0], active.scene[1]);
        if (!near || near.dist >= 45) return null;
        const w = wallById(scene, near.wallId); if (!w) return null;
        const n = w.points.length;
        const a = w.points[near.edge], b = w.points[(near.edge + 1) % n];
        const ex = b[0] - a[0], ey = b[1] - a[1]; const len = Math.hypot(ex, ey) || 1;
        const ux = ex / len, uy = ey / len;
        const half = Math.min((OPENING_DEFAULT_FT[doorKind] * UNITS_PER_FT) / 2, len / 2);
        const cx = a[0] + ux * near.t * len, cy = a[1] + uy * near.t * len;
        return <line x1={cx - ux * half} y1={cy - uy * half} x2={cx + ux * half} y2={cy + uy * half}
                     stroke={doorKind === 'missing_wall' ? '#94a3b8' : '#1483C2'} strokeWidth={12} strokeLinecap="round" opacity={0.6} style={{ pointerEvents: 'none' }} />;
      })()}
    </>
  );

  const Tab = ({ t, icon: Icon, label }: { t: Tool; icon: any; label: string }) => (
    <button onClick={() => selectTool(t)}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${tool === t ? 'text-sky' : 'text-gray-400'}`}>
      <Icon size={20} strokeWidth={tool === t ? 2.6 : 2} /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#F4F7FB] flex flex-col select-none">
      <div className="safe-top bg-white border-b border-gray-100 flex items-center px-2 pb-2 gap-1">
        <button onClick={() => (dirty ? setConfirmExit(true) : onClose(false))} className="p-2 rounded-xl active:bg-gray-100"><X size={22} /></button>
        <div className="flex-1 text-center px-1 min-w-0">
          <div className="font-display font-bold text-[15px] truncate">{roomName || 'Moisture Map'}</div>
          {roomName && <div className="text-[10px] font-semibold text-gray-400 -mt-0.5">Moisture Map</div>}
        </div>
        <button onClick={undo} disabled={!history.length} className="p-2 rounded-xl active:bg-gray-100 disabled:opacity-30"><Undo2 size={20} /></button>
        <button onClick={save} disabled={saving} className="ml-1 btn-primary py-2 px-4 text-sm disabled:opacity-50"><Save size={16} /> Save</button>
      </div>

      {/* MEASUREMENTS: the numbers that pay for the job. */}
      <button onClick={() => setShowDims(true)}
        className="flex items-center gap-3 px-3 py-2.5 bg-white border-b border-gray-100 active:bg-gray-50 text-left w-full">
        <div className="w-9 h-9 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0"><Ruler size={17} /></div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[13px] text-navy">Measurements</div>
          <div className="text-[11px] text-gray-500 leading-snug tabular-nums truncate">
            {dims.F > 0
              ? <>Floor {dims.F} sq ft &middot; Walls {dims.W} sq ft &middot; Baseboard {dims.baseboardLF} ft</>
              : 'Add the room to see its measurements'}
          </div>
        </div>
        {(!ceilingFt || dims.openings.some(o => o.assumedHeight)) && (
          <span className="chip bg-amber-100 text-amber-700 shrink-0">
            <TriangleAlert size={11} /> {!ceilingFt ? 'No ceiling height' : 'Sizes assumed'}
          </span>
        )}
      </button>

      {/* ceiling height sits on its own row: nothing below can be computed without it */}
      <button onClick={() => setCeilSheet(true)}
        className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-gray-100 active:bg-gray-50 w-full">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500"><ArrowUpDown size={13} /> Ceiling height</span>
        <span className={`text-[13px] font-bold ${ceilingFt ? 'text-navy' : 'text-amber-700'}`}>
          {ceilingFt ? formatFeetInches(ceilingFt) : 'Tap to measure'}
        </span>
      </button>

      <div className="flex items-center justify-around px-3 py-2 bg-white/70 text-[13px] font-bold text-gray-600">
        {([['air_mover', counts.am], ['dehumidifier', counts.dh], ['air_scrubber', counts.as], ['reading', counts.mp]] as [string, number][]).map(([kk, n]) => (
          <span key={kk} className="flex items-center gap-1.5"><PlaceGlyph kind={kk} size={20} /> {n}</span>
        ))}
      </div>

      {(() => {
        const dates = Array.from(new Set([...allReadingDates(scene), todayISO(), activeDate])).sort();
        return (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-b border-gray-100 overflow-x-auto">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 shrink-0">Visit</span>
            {dates.map(d => (
              <button key={d} onClick={() => setActiveDate(d)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${d === activeDate ? 'bg-gradient-to-br from-sky to-sky-deep text-white' : 'bg-gray-100 text-gray-500'}`}>
                {fmtDate(d)}
              </button>
            ))}
            <label className="shrink-0 w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center relative">
              <Plus size={14} />
              <input type="date" value={activeDate} onChange={e => e.target.value && setActiveDate(e.target.value)} className="absolute inset-0 opacity-0" />
            </label>
          </div>
        );
      })()}

      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-b border-gray-100 overflow-x-auto text-[11px]">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 shrink-0">S500</span>
        {floorSqFt > 0 && (
          <span className={`shrink-0 chip ${counts.am < sug.airMovers ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'}`}>Air Movers {counts.am}/{sug.airMovers}</span>
        )}
        {floorSqFt > 0 && (
          <span className={`shrink-0 chip ${counts.dh < sug.dehus ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'}`}>Dehumidifiers {counts.dh}/{sug.dehus}</span>
        )}
      </div>

      <div ref={wrapRef} className="flex-1 relative overflow-hidden">
        <svg ref={svgRef} className="w-full h-full touch-none" viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
             onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
          <rect x={0} y={0} width={size.w} height={size.h} fill="#F4F7FB" />
          <g transform={viewTransform(view, size.w, size.h)}>
            {content}
            {tool === 'move' && scene.walls.flatMap(w => w.points.map((pt, i) => (
              <circle key={w.id + '-' + i} cx={pt[0]} cy={pt[1]} r={7 / k} fill="#fff" stroke="#0E2A4D" strokeWidth={2 / k} />
            )))}
          </g>
        </svg>

        {drawReadout && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-navy/90 text-white text-[12px] font-bold px-3.5 py-1.5 rounded-full pointer-events-none z-10 whitespace-nowrap">
            {drawReadout}
          </div>
        )}

        <div className="absolute right-3 bottom-3 flex flex-col gap-2">
          <button onClick={() => setShowWalls(v => !v)} aria-label="Show measurements"
            className={`rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95 ${showWalls ? 'bg-navy text-white' : 'bg-white text-navy'}`}><Ruler size={18} /></button>
          {/* Turn the plan to face the way you are standing. The direction pad turns with it. */}
          <button onClick={() => setView(v => ({ ...v, rot: normRot(v.rot + 90) }))}
            className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95 text-navy"><RotateCw size={18} /></button>
          {view.rot !== 0 && (
            <button onClick={() => setView(v => ({ ...v, rot: 0 }))}
              className="bg-navy text-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95">
              <Compass size={18} style={{ transform: `rotate(${-view.rot}deg)` }} />
            </button>
          )}
          <button onClick={() => zoomBy(1.25)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Plus size={18} /></button>
          <button onClick={() => zoomBy(0.8)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Minus size={18} /></button>
        </div>

        {/* TAP A WALL, TYPE ITS EXACT LENGTH. */}
        {tool === 'move' && selEdge && selEdgeMid && (
          <div className="absolute left-0 right-0 bottom-3 flex items-center justify-center gap-2 px-3">
            <button onClick={() => setEdgeSheet({ wallId: selEdge.wallId, edge: selEdge.edge, currentFt: selEdgeLenFt })}
              className="bg-gradient-to-br from-sky to-sky-deep text-white rounded-full px-6 py-3 text-sm font-extrabold shadow-lg active:scale-95 flex items-center gap-2">
              <Ruler size={16} /> Wall is {formatFeetInches(selEdgeLenFt)} &middot; tap to set exactly
            </button>
          </div>
        )}
        {tool === 'move' && !selEdge && selOpen && (
          <div className="absolute left-0 right-0 bottom-3 flex items-center justify-center gap-2 px-3">
            <button onClick={() => openOpeningEditor(selOpen.id)}
              className="bg-gradient-to-br from-sky to-sky-deep text-white rounded-full px-5 py-3 text-sm font-extrabold shadow-lg active:scale-95 flex items-center gap-2 min-w-0">
              <Ruler size={16} className="shrink-0" />
              <span className="truncate">{OPENING_LABEL[selOpen.kind]} {selOpenSize}</span>
            </button>
            <button onClick={deleteSelected}
              className="bg-red-600 text-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95 shrink-0">
              <Trash2 size={16} />
            </button>
          </div>
        )}
        {tool === 'move' && !selEdge && !selOpen && selWall && (
          <div className="absolute left-0 right-0 bottom-3 flex items-center justify-center gap-2 px-3">
            <button onClick={() => setMaterial(selWall.id)}
              className="bg-white text-navy rounded-full px-4 py-3 text-sm font-bold shadow-lg active:scale-95 flex items-center gap-2 min-w-0">
              <span className="truncate">{selWall.material ? selWall.material : 'Set material'}</span>
            </button>
            {scene.walls.length >= 2 && (
              <button onClick={() => setSplitName({ wallId: selWall.id, name: 'Closet' })}
                className="bg-gradient-to-br from-sky to-sky-deep text-white rounded-full px-5 py-3 text-sm font-extrabold shadow-lg active:scale-95 flex items-center gap-2 shrink-0">
                <Scissors size={16} /> Make separate room
              </button>
            )}
          </div>
        )}
        {tool === 'move' && !selEdge && selectedId && !selOpen && !selWall && (
          <button onClick={deleteSelected} className="absolute left-3 bottom-3 bg-red-600 text-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft flex items-center gap-1.5 active:scale-95"><Trash2 size={16} /> Delete</button>
        )}
        {tool === 'wet' && activeWetId && (
          <div className="absolute left-0 right-0 bottom-3 flex items-center justify-center gap-2 px-3">
            <button onClick={undoWetStroke} className="bg-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft active:scale-95">Undo stroke</button>
            <button onClick={finishWet} className="bg-gradient-to-br from-sky to-sky-deep text-white rounded-full px-7 py-3 text-sm font-extrabold shadow-lg active:scale-95">Done</button>
          </div>
        )}
        {tool === 'room' && roomMode === 'rect' && (
          <div className="absolute left-0 right-0 bottom-3 flex items-center justify-center px-3">
            <button onClick={() => setSizeSheet(true)}
              className="bg-gradient-to-br from-sky to-sky-deep text-white rounded-full px-6 py-3 text-sm font-extrabold shadow-lg active:scale-95 flex items-center gap-2">
              <Ruler size={16} /> Type width and length
            </button>
          </div>
        )}
        {isCustom && !build && (
          <div className="absolute left-0 right-0 bottom-3 flex items-center justify-center px-3">
            <div className="bg-navy/90 text-white rounded-full px-5 py-3 text-sm font-bold shadow-lg text-center">
              Tap the map where the room{'\u2019'}s first corner goes
            </div>
          </div>
        )}
      </div>

      {/* ---- AIM CONTROLS: length is typed, angle is dragged, corner is set ---- */}
      {isCustom && build && (
        <div className="bg-white border-t border-gray-100 px-3 pt-2 pb-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
              Wall {buildCorners.length}
            </span>
            <span className="text-[11px] font-semibold text-gray-500">
              {aim ? (aimClosesRoom ? 'On the start corner. Tap Close room.' : 'Drag the orange dot to aim it. Bring it onto the start corner to close.') : 'Type this wall\u2019s length.'}
            </span>
          </div>
          {aim ? (
            <>
              <button onClick={() => setLenSheet(true)}
                className="w-full mt-1.5 flex items-center justify-center gap-2 rounded-xl bg-sky-soft text-sky-deep py-2.5 text-sm font-extrabold active:bg-sky/20">
                <Ruler size={16} /> {ftLabel(aim.lenU)} &middot; tap to change length
              </button>
              <div className="flex gap-2 mt-2">
                <button onClick={undoWall}
                  className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm font-bold text-gray-600 active:bg-gray-50">
                  {placedWalls === 0 ? 'Cancel' : 'Back'}
                </button>
                <button onClick={setCorner}
                  className={`flex-1 py-2.5 rounded-xl justify-center text-sm font-extrabold text-white active:scale-95 ${aimClosesRoom ? 'bg-green-600' : 'bg-gradient-to-br from-sky to-sky-deep'}`}>
                  {aimClosesRoom ? 'Close room' : 'Set corner'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-2 mt-1.5">
              <button onClick={undoWall}
                className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm font-bold text-gray-600 active:bg-gray-50">
                {placedWalls === 0 ? 'Cancel' : 'Undo last wall'}
              </button>
              <button onClick={() => setLenSheet(true)}
                className="btn-primary flex-1 py-2.5 justify-center text-sm">
                <Ruler size={16} /> Add wall
              </button>
              {placedWalls >= 3 && (
                <button onClick={requestClose}
                  className="flex-1 py-2.5 rounded-xl justify-center text-sm font-bold text-navy border border-navy/20 active:bg-navy/5">
                  Close room
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* The placed walls do not meet the start corner. Name the gap and let the tech decide:
          go back and fix the wrong measurement, or close anyway (the closing wall becomes
          whatever length reaches the start, so one number will not match what was typed). */}
      {confirmClose && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12vh)' }}>
          <div className="absolute inset-0 bg-navy/40" onClick={() => setConfirmClose(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><TriangleAlert size={18} /></div>
              <div className="font-display font-bold text-lg text-navy">The walls don{'\u2019'}t quite meet</div>
            </div>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              The last corner is <span className="font-bold text-amber-700">{formatFeetInches(closeGapFt)}</span> from where the room started, so the lengths you typed do not close the shape. That usually means one wall was measured wrong.
            </p>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              Close it anyway and the last wall is stretched to reach the start, so its length will not match what you typed. Or go back and fix the measurement.
            </p>
            <button onClick={() => commitRoom(buildCorners)}
              className="w-full py-3 mt-4 rounded-xl font-bold text-amber-700 border border-amber-300 active:bg-amber-50">
              Close anyway ({formatFeetInches(closeGapFt)} off)
            </button>
            <button onClick={() => setConfirmClose(false)}
              className="btn-primary w-full py-3 justify-center mt-2">
              Go back and fix it
            </button>
          </div>
        </div>
      )}

      {isScope && (
        <div className="bg-white border-t border-gray-100">
          <div className="flex items-center gap-2 px-3 pt-2 pb-1">
            <div className="flex flex-1 bg-gray-100 rounded-full p-0.5">
              {([['floodcut', 'Flood cut'], ['containment', 'Containment']] as [Tool, string][]).map(([t, l]) => (
                <button key={t} onClick={() => selectTool(t)} className={`flex-1 py-1 rounded-full text-xs font-bold ${tool === t ? 'bg-white shadow-sm text-sky' : 'text-gray-500'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center px-3 pb-2">
            {tool === 'floodcut'
              ? <span className="text-[12px] font-extrabold text-amber-700">{fcStats.lf.toFixed(0)} linear ft &middot; {fcStats.sqft.toFixed(0)} sq ft removed</span>
              : <span className="text-[12px] font-extrabold text-violet-700">{cStats.count} barrier{cStats.count === 1 ? '' : 's'} &middot; {cStats.sqft.toFixed(0)} sq ft</span>}
          </div>
        </div>
      )}

      {isRoom && !(isCustom && build) && (
        <div className="bg-white border-t border-gray-100">
          <div className="flex items-center gap-2 px-3 pt-2 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 shrink-0">Shape</span>
            <div className="flex flex-1 bg-gray-100 rounded-full p-0.5">
              {([['rect', 'Rectangle'], ['custom', 'Custom']] as [string, string][]).map(([kk, l]) => (
                <button key={kk} onClick={() => pickRoom(kk)} className={`flex-1 py-1 rounded-full text-xs font-bold ${activeRoomKey === kk ? 'bg-white shadow-sm text-sky' : 'text-gray-500'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1 px-3 pb-2">
            {OPENING_ITEMS.map(it => {
              const on = activeRoomKey === it.key;
              return (
                <button key={it.key}
                  onPointerDown={e => onPaletteDown(e, it)} onPointerMove={onPaletteMove}
                  onPointerUp={onPaletteUp} onPointerCancel={onPaletteCancel}
                  style={{ touchAction: 'none' }}
                  className={`flex flex-col items-center gap-1 py-1.5 rounded-2xl ${on ? 'bg-sky-soft ring-1 ring-sky/40' : 'active:bg-gray-50'}`}>
                  <PlaceGlyph kind={it.key} />
                  <span className={`text-[10px] font-semibold leading-tight text-center ${on ? 'text-sky-deep' : 'text-gray-500'}`}>{it.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isPlace && (
        <div className="grid grid-cols-5 gap-1 px-2 py-2 bg-white border-t border-gray-100">
          {PLACE_ITEMS.map(it => {
            const on = activeKey === it.key;
            return (
              <button key={it.key}
                onPointerDown={e => onPaletteDown(e, it)} onPointerMove={onPaletteMove}
                onPointerUp={onPaletteUp} onPointerCancel={onPaletteCancel}
                style={{ touchAction: 'none' }}
                className={`flex flex-col items-center gap-1 py-1.5 rounded-2xl ${on ? 'bg-sky-soft ring-1 ring-sky/40' : 'active:bg-gray-50'}`}>
                <PlaceGlyph kind={it.key} />
                <span className={`text-[10px] font-semibold leading-tight text-center ${on ? 'text-sky-deep' : 'text-gray-500'}`}>{it.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="text-center text-[11px] font-medium text-white py-1.5 bg-navy/90">
        {tool === 'move' && (selEdge ? 'Tap the button to type this wall\u2019s exact length.' : selOpen ? 'Tap the opening to edit its type and size, or the bin to remove it.' : selWall ? (scene.walls.length >= 2 ? 'Outline selected. Set its material, or split it into its own room.' : 'Outline selected. Tap Set material to tag it.') : 'Tap a WALL to set its length, or an OPENING to edit it.')}
        {tool === 'room' && (roomMode === 'custom'
          ? (build ? (aim ? 'Drag the orange dot to aim the wall any direction. Its length stays fixed. Bring it onto the start corner to close, or Set corner to keep going.' : 'Add wall, type its length, then aim it. Close the room by aiming the last wall back onto the start corner.') : 'Tap the map to drop the first corner. Then each wall is a fixed length you aim any direction.')
          : 'Type the width and length and the room draws itself exactly.')}
        {tool === 'wet' && (activeWetId ? 'Keep painting the wet spot, then tap Done. Two fingers to pan.' : 'Paint over the wet spots. Lift and paint more; tap Done to finish.')}
        {tool === 'equip' && 'Drag onto the map. The preview shows where it lands, release to drop.'}
        {tool === 'reading' && `Reading for ${fmtDate(activeDate)}. Press empty space for a new point, or a pin to update it.`}
        {tool === 'arrow' && 'Drag from the water source toward where it traveled.'}
        {tool === 'door' && `Drop a ${OPENING_LABEL[doorKind].toLowerCase()} on a wall and set its size, or tap an existing opening to edit it.`}
        {tool === 'floodcut' && 'Tap a wall, then set height and length. Drag the band to slide it, the dots to resize.'}
        {tool === 'containment' && 'Tap where the barrier goes, then enter its size.'}
        {tool === 'origin' && 'Drop the X on the source of the loss.'}
      </div>

      <nav className="safe-bottom bg-white border-t border-gray-100 flex">
        <Tab t="move" icon={Move} label="Move" />
        <button onClick={() => pickRoom(lastRoomKey)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isRoom ? 'text-sky' : 'text-gray-400'}`}>
          <Square size={20} strokeWidth={isRoom ? 2.6 : 2} /> Room
        </button>
        <Tab t="wet" icon={Droplet} label="Water" />
        <button onClick={() => selectTool(lastScope)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isScope ? 'text-sky' : 'text-gray-400'}`}>
          <Ruler size={20} strokeWidth={isScope ? 2.6 : 2} /> Scope
        </button>
        <button onClick={() => selectTool(lastPlace)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isPlace ? 'text-sky' : 'text-gray-400'}`}>
          <MapPin size={20} strokeWidth={isPlace ? 2.6 : 2} /> Place
        </button>
      </nav>

      {/* ---- MEASUREMENT SHEETS ---- */}
      {lenSheet && (
        <MeasureSheet
          title={`Wall ${buildCorners.length} length`}
          subtitle="Type the exact wall length, then drag its free end to aim it any direction."
          initialFt={aim ? aimLenFt : 10}
          min={0.25} max={200}
          quick={[{ label: "8'", ft: 8 }, { label: "10'", ft: 10 }, { label: "12'", ft: 12 }]}
          onCancel={() => { setLenSheet(false); if (!aim && placedWalls === 0) { setBuild(null); } }}
          onSave={applyWallLength}
        />
      )}
      {edgeSheet && (
        <MeasureSheet
          title="Wall length"
          subtitle="Type the exact measurement. The opposite wall follows, so the room stays square."
          initialFt={edgeSheet.currentFt}
          min={0.25} max={200}
          onCancel={() => setEdgeSheet(null)}
          onSave={applyEdgeLength}
        />
      )}
      {ceilSheet && (
        <MeasureSheet
          title="Ceiling height"
          subtitle={structureCeilingFt ? `Structure default is ${formatFeetInches(structureCeilingFt)}. This overrides it for this room.` : 'Wall area cannot be calculated without it.'}
          initialFt={ceilingFt}
          min={4} max={40}
          quick={[{ label: "8'", ft: 8 }, { label: "8' 6\"", ft: 8.5 }, { label: "9'", ft: 9 }, { label: "10'", ft: 10 }]}
          onCancel={() => setCeilSheet(false)}
          onSave={applyCeiling}
        />
      )}
      {sizeSheet && (
        <RoomSizeSheet
          onCancel={() => setSizeSheet(false)}
          onCreate={createRectExact}
        />
      )}
      {openingSheet && (() => {
        const isW = openingSheet.step === 'width';
        const kind = openingSheet.kind;
        const twoStep = kind !== 'missing_wall';   // a missing wall is full ceiling height, so width only
        const maxW = Math.round(openingSheet.edgeLenFt * 100) / 100;   // never wider than its own wall
        const maxH = ceilingFt ?? 12;                                   // never taller than the wall it sits in
        const widthQuick = (kind === 'door' ? [{ label: "2' 6\"", ft: 2.5 }, { label: "2' 8\"", ft: 2 + 8 / 12 }, { label: "3'", ft: 3 }]
          : kind === 'window' ? [{ label: "2' 8\"", ft: 2 + 8 / 12 }, { label: "3'", ft: 3 }, { label: "4'", ft: 4 }]
          : [{ label: "3'", ft: 3 }, { label: "4'", ft: 4 }, { label: "6'", ft: 6 }]).filter(q => q.ft <= maxW);
        const heightQuick = (kind === 'window'
          ? [{ label: "4'", ft: 4 }, { label: "3'", ft: 3 }, { label: "5'", ft: 5 }]
          : [{ label: "6' 8\"", ft: 6 + 8 / 12 }, { label: "7'", ft: 7 }, { label: "8'", ft: 8 }]).filter(q => q.ft <= maxH);
        return (
          <MeasureSheet
            title={isW ? `How wide is the ${OPENING_LABEL[kind].toLowerCase()}?` : `How tall is the ${OPENING_LABEL[kind].toLowerCase()}?`}
            subtitle={isW
              ? 'This gets taken out of the wall area you bill for.'
              : 'Measure it. A guessed height is a guessed dollar amount.'}
            note={isW ? OPENING_DESC[kind] : undefined}
            step={twoStep ? { current: isW ? 1 : 2, total: 2 } : undefined}
            initialFt={isW ? openingSheet.widthFt : (openingSheet.heightFt ?? OPENING_DEFAULT_HEIGHT_FT[kind])}
            min={0.5} max={isW ? maxW : maxH}
            quick={isW ? widthQuick : heightQuick}
            onBack={!isW ? () => setOpeningSheet(s => (s ? { ...s, step: 'width' } : s)) : undefined}
            onCancel={() => setOpeningSheet(null)}
            onSave={(ft) => {
              if (!isW) { commitOpening(openingSheet, ft); setOpeningSheet(null); return; }
              if (kind === 'missing_wall') { commitOpening({ ...openingSheet, widthFt: ft }); setOpeningSheet(null); return; }
              setOpeningSheet(s => (s ? { ...s, widthFt: ft, step: 'height' } : s));
            }}
          />
        );
      })()}

      {/* ---- FULL MEASUREMENTS PANEL ---- */}
      {showDims && (
        <div className="fixed inset-0 z-[65] flex items-start justify-center px-4 overflow-y-auto" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 5vh)' }}>
          <div className="absolute inset-0 bg-navy/40" onClick={() => setShowDims(false)} />
          <div className="relative w-full max-w-sm pb-10">
            <RoomDimensions scene={scene} ceilingHeightFt={ceilingFt} onEditCeiling={() => { setShowDims(false); setCeilSheet(true); }} />
            <button onClick={() => setShowDims(false)} className="btn-primary w-full py-3 justify-center mt-3">Done</button>
          </div>
        </div>
      )}

      {pendingFlood && (() => {
        const fc = (scene.floodCuts ?? []).find(f => f.wallId === pendingFlood.wallId && f.edge === pendingFlood.edge);
        if (!fc) return null;
        const full = edgeLenFt(scene, fc.wallId, fc.edge);
        const len = fc.lengthFt != null ? Math.min(fc.lengthFt, full) : full;
        const setFc = (patch: Partial<typeof fc>) => setScene(sc => ({ ...sc, floodCuts: (sc.floodCuts ?? []).map(f => (f.wallId === fc.wallId && f.edge === fc.edge ? { ...f, ...patch } : f)) }));
        const remove = () => { setScene(sc => ({ ...sc, floodCuts: (sc.floodCuts ?? []).filter(f => !(f.wallId === fc.wallId && f.edge === fc.edge)) })); setPendingFlood(null); };
        return (
          <div className="fixed inset-0 z-[60] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 7vh)' }}>
            <div className="absolute inset-0 bg-navy/30" onClick={() => setPendingFlood(null)} />
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
              <div className="font-display font-bold text-lg text-navy">Flood cut</div>
              <p className="text-xs text-gray-400 mt-0.5">Wall is {formatFeetInches(full)} &middot; {(len * fc.heightFt).toFixed(0)} sq ft removed (DRYW)</p>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Cut height</label>
              <div className="flex gap-2 mt-1">
                {FLOOD_HEIGHTS.map(h => (
                  <button key={h.label} onClick={() => setFc({ heightFt: h.ft })} className={`px-4 py-1.5 rounded-full text-sm font-bold ${Math.abs(fc.heightFt - h.ft) < 0.01 ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700'}`}>{h.label}</button>
                ))}
                <input value={String(fc.heightFt)} onChange={e => { const n = parseFloat(e.target.value); if (n > 0) setFc({ heightFt: n }); }} inputMode="decimal"
                  className="w-16 border border-gray-200 rounded-xl px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:border-sky" />
                <span className="self-center text-xs text-gray-400">ft</span>
              </div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Cut length</label>
              <div className="flex gap-2 mt-1 items-center">
                <input value={len.toFixed(2)} onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) setFc({ lengthFt: Math.max(0, Math.min(n, full)) }); }} inputMode="decimal"
                  className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[16px] font-bold focus:outline-none focus:border-sky" />
                <span className="text-xs text-gray-400">ft</span>
                <button onClick={() => setFc({ lengthFt: undefined, startFt: 0 })} className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-600">Full wall</button>
              </div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Start from corner</label>
              <div className="flex gap-2 mt-1 items-center">
                <input value={(fc.startFt ?? 0).toFixed(2)} onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) { const ns = Math.max(0, Math.min(n, full - 0.25)); setFc({ startFt: ns, lengthFt: Math.min(fc.lengthFt ?? (full - ns), full - ns) }); } }} inputMode="decimal"
                  className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[16px] font-bold focus:outline-none focus:border-sky" />
                <span className="text-xs text-gray-400">ft</span>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={remove} className="flex-1 border border-red-200 rounded-xl py-3 font-semibold text-red-600 active:bg-red-50">Remove</button>
                <button onClick={() => setPendingFlood(null)} className="btn-primary flex-1 py-3 justify-center">Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingContain && (() => {
        const c = (scene.containments ?? []).find(x => x.id === pendingContain.id);
        if (!c) return null;
        const setC = (patch: Partial<typeof c>) => setScene(sc => ({ ...sc, containments: (sc.containments ?? []).map(x => (x.id === c.id ? { ...x, ...patch } : x)) }));
        const sqft = Math.round((c.widthFt ?? 0) * c.heightFt);
        const cancel = () => { if (pendingContain.isNew) setScene(sc => ({ ...sc, containments: (sc.containments ?? []).filter(x => x.id !== c.id) })); setPendingContain(null); };
        return (
          <div className="fixed inset-0 z-[60] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 7vh)' }}>
            <div className="absolute inset-0 bg-navy/30" onClick={cancel} />
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
              <div className="font-display font-bold text-lg text-navy">Containment barrier</div>
              <p className="text-xs text-gray-400 mt-0.5">Plastic sheeting &middot; {sqft} sq ft</p>
              <div className="flex gap-3 mt-3">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Width (ft)</label>
                  <input value={String(c.widthFt ?? '')} onChange={e => setC({ widthFt: parseFloat(e.target.value) || 0 })} inputMode="decimal"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-1 text-[16px] font-bold focus:outline-none focus:border-sky" />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Height (ft)</label>
                  <input value={String(c.heightFt ?? '')} onChange={e => setC({ heightFt: parseFloat(e.target.value) || 0 })} inputMode="decimal"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-1 text-[16px] font-bold focus:outline-none focus:border-sky" />
                </div>
              </div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Location (optional)</label>
              <input value={c.label ?? ''} onChange={e => setC({ label: e.target.value || undefined })} placeholder="e.g. hallway doorway"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-1 text-[16px] focus:outline-none focus:border-sky" />
              <div className="flex gap-2 mt-4">
                <button onClick={cancel} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
                <button onClick={() => setPendingContain(null)} className="btn-primary flex-1 py-3 justify-center">Save</button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingReading && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 7vh)' }}>
          <div className="absolute inset-0 bg-navy/30" onClick={() => setPendingReading(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
            <div className="font-display font-bold text-lg text-navy">Moisture reading</div>
            <p className="text-xs text-gray-400 mt-0.5">{fmtDate(activeDate)}</p>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Reading</label>
            <input value={rdgValue} onChange={e => setRdgValue(e.target.value)} placeholder="e.g. 18%, 45, WET" inputMode="text"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 mt-1 text-[18px] font-bold focus:outline-none focus:border-sky" />
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Material read</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {READING_MATERIALS.map(m => (
                <button key={m} onClick={() => setRdgMaterial(rdgMaterial === m ? undefined : m)} className={`px-3 py-1.5 rounded-full text-[13px] font-semibold ${rdgMaterial === m ? 'bg-sky text-white' : 'bg-sky-soft text-sky-deep'}`}>{m}</button>
              ))}
            </div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Location (optional)</label>
            <input value={rdgLabel} onChange={e => setRdgLabel(e.target.value)} placeholder="e.g. N wall, 2 ft up"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-1 text-[16px] focus:outline-none focus:border-sky" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPendingReading(null)} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
              <button onClick={saveReading} disabled={!rdgValue.trim()} className="btn-primary flex-1 py-3 justify-center disabled:opacity-40">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Name the room being split out of this sketch, then create it. */}
      {splitName && (() => {
        const w = scene.walls.find(x => x.id === splitName.wallId);
        const bb = w ? roomBBoxFt({ ...scene, walls: [w] } as Scene) : null;
        return (
          <div className="fixed inset-0 z-[70] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8vh)' }}>
            <div className="absolute inset-0 bg-navy/40" onClick={() => { if (!splitting) setSplitName(null); }} />
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
              <div className="font-display font-bold text-lg text-navy">Make this a separate room</div>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                This outline becomes its own room{bb && bb.widthFt > 0 ? ` (about ${formatFeetInches(bb.widthFt)} by ${formatFeetInches(bb.lengthFt)})` : ''}, with its own measurements and moisture map. Its readings, equipment, doors and flood cuts move with it. Everything else stays in {roomName || 'this room'}.
              </p>
              <input value={splitName.name} onChange={e => setSplitName(s => s && ({ ...s, name: e.target.value }))}
                placeholder="Closet" autoFocus
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 mt-3 text-[16px] focus:outline-none focus:border-sky" />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setSplitName(null)} disabled={splitting}
                  className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button onClick={() => splitOutRoom(splitName.wallId, splitName.name)} disabled={splitting}
                  className="btn-primary flex-1 py-3 justify-center disabled:opacity-50">{splitting ? 'Creating...' : 'Create room'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* The closet is now its own room. */}
      {splitDone && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12vh)' }}>
          <div className="absolute inset-0 bg-navy/40" onClick={() => setSplitDone(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
            <div className="font-display font-bold text-lg text-navy">{splitDone} is now its own room</div>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              It has its own measurements and moisture map, and it is in this structure's room list and floor-plan tray. This map now shows only {roomName || 'this room'}.
            </p>
            <button onClick={() => setSplitDone(null)} className="btn-primary w-full py-3 justify-center mt-4">Done</button>
          </div>
        </div>
      )}

      {/* EDIT AN OPENING already on a wall. */}
      {editOpen && (() => {
        const o = (scene.openings ?? []).find(x => x.id === editOpen);
        if (!o) return null;
        const isMW = o.kind === 'missing_wall';
        const edgeMax = Math.max(0.5, edgeLenFt(scene, o.wallId, o.edge) || o.widthFt);
        const maxH = ceilingFt ?? 12;
        const setO = (patch: Partial<typeof o>) => {
          if (!editSnapped.current) { snapshot(); editSnapped.current = true; }
          setScene(sc => ({ ...sc, openings: (sc.openings ?? []).map(x => x.id === o.id ? { ...x, ...patch } : x) }));
        };
        const setWidth = (ft: number) => { if (!isNaN(ft)) setO({ widthFt: Math.max(0.25, Math.min(ft, edgeMax)) }); };
        const setHeight = (ft: number) => { if (!isNaN(ft)) setO({ heightFt: Math.max(0.25, Math.min(ft, maxH)) }); };
        let wF = Math.floor(o.widthFt); let wI = Math.round((o.widthFt - wF) * 12); if (wI === 12) { wF += 1; wI = 0; }
        const hFt = o.heightFt ?? 0; let hF = Math.floor(hFt); let hI = Math.round((hFt - hF) * 12); if (hI === 12) { hF += 1; hI = 0; }
        const del = () => { snapshot(); setScene(sc => ({ ...sc, openings: (sc.openings ?? []).filter(x => x.id !== o.id) })); setSelectedId(null); setEditOpen(null); };
        return (
          <div className="fixed inset-0 z-[70] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 7vh)' }}>
            <div className="absolute inset-0 bg-navy/30" onClick={() => setEditOpen(null)} />
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
              <div className="font-display font-bold text-lg text-navy">Edit opening</div>
              <p className="text-xs text-gray-400 mt-0.5">{isMW ? 'A missing wall is full ceiling height by definition.' : 'Type, width, and height. The height deducts real wall area.'}</p>

              <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Type</label>
              <div className="grid grid-cols-4 gap-1.5 mt-1">
                {OPENING_KINDS.map(kd => (
                  <button key={kd} onClick={() => setO(kd === 'missing_wall' ? { kind: kd, heightFt: undefined } : { kind: kd })}
                    className={`py-1.5 rounded-xl text-[11px] font-bold leading-tight ${o.kind === kd ? 'bg-sky text-white' : 'bg-sky-soft text-sky-deep'}`}>
                    {OPENING_LABEL[kd]}
                  </button>
                ))}
              </div>

              <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Width</label>
              <div className="flex gap-2 mt-1 items-center">
                <input value={String(wF)} onChange={e => setWidth((parseInt(e.target.value) || 0) + wI / 12)} inputMode="numeric"
                  className="w-14 border border-gray-200 rounded-xl px-2 py-2.5 text-[16px] font-bold text-center focus:outline-none focus:border-sky" />
                <span className="text-xs text-gray-400">ft</span>
                <input value={String(wI)} onChange={e => setWidth(wF + (parseInt(e.target.value) || 0) / 12)} inputMode="numeric"
                  className="w-14 border border-gray-200 rounded-xl px-2 py-2.5 text-[16px] font-bold text-center focus:outline-none focus:border-sky" />
                <span className="text-xs text-gray-400">in</span>
                <span className="ml-auto text-[11px] font-semibold text-gray-400">wall is {formatFeetInches(edgeMax)}</span>
              </div>

              {!isMW && (
                <>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Height</label>
                  <div className="flex gap-2 mt-1 items-center">
                    <input value={String(hF)} onChange={e => setHeight((parseInt(e.target.value) || 0) + hI / 12)} inputMode="numeric"
                      className="w-14 border border-gray-200 rounded-xl px-2 py-2.5 text-[16px] font-bold text-center focus:outline-none focus:border-sky" />
                    <span className="text-xs text-gray-400">ft</span>
                    <input value={String(hI)} onChange={e => setHeight(hF + (parseInt(e.target.value) || 0) / 12)} inputMode="numeric"
                      className="w-14 border border-gray-200 rounded-xl px-2 py-2.5 text-[16px] font-bold text-center focus:outline-none focus:border-sky" />
                    <span className="text-xs text-gray-400">in</span>
                    {o.heightFt == null && <span className="ml-auto text-[11px] font-bold text-amber-600">not measured yet</span>}
                  </div>
                </>
              )}

              <div className="flex gap-2 mt-4">
                <button onClick={del} className="flex-1 border border-red-200 rounded-xl py-3 font-semibold text-red-600 active:bg-red-50 flex items-center justify-center gap-1.5"><Trash2 size={16} /> Remove</button>
                <button onClick={() => setEditOpen(null)} className="btn-primary flex-1 py-3 justify-center">Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingWetId && (() => {
        const wa = scene.wetAreas.find(w => w.id === pendingWetId);
        if (!wa) return null;
        const setWet = (patch: Partial<typeof wa>) => setScene(sc => ({ ...sc, wetAreas: sc.wetAreas.map(w => (w.id === pendingWetId ? { ...w, ...patch } : w)) }));
        return (
          <div className="fixed inset-0 z-[60] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8vh)' }}>
            <div className="absolute inset-0 bg-navy/30" onClick={() => setPendingWetId(null)} />
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
              <div className="font-display font-bold text-lg text-navy">Affected material</div>
              <p className="text-xs text-gray-400 mt-0.5">Tag this wet area for the drying log and estimate.</p>
              <div className="flex bg-gray-100 rounded-full p-0.5 mt-3">
                {WET_SURFACES.map(sf => (
                  <button key={sf} onClick={() => setWet({ surface: sf, material: MATERIALS_BY_SURFACE[sf].includes(wa.material ?? '') ? wa.material : undefined })} className={`flex-1 py-1.5 rounded-full text-xs font-bold capitalize ${(wa.surface ?? 'floor') === sf ? 'bg-white shadow-sm text-sky' : 'text-gray-500'}`}>{sf}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {MATERIALS_BY_SURFACE[wa.surface ?? 'floor'].map(m => (
                  <button key={m} onClick={() => setWet({ material: m })} className={`px-3 py-1.5 rounded-full text-[13px] font-semibold ${wa.material === m ? 'bg-sky text-white' : 'bg-sky-soft text-sky-deep'}`}>{m}</button>
                ))}
              </div>
              <input value={wa.material ?? ''} onChange={e => setWet({ material: e.target.value })}
                placeholder="Or type a material name" className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-3 text-[16px] focus:outline-none focus:border-sky" />
              {(wa.surface ?? 'floor') === 'floor' && (
                <>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Flooring plan</label>
                  <div className="flex bg-gray-100 rounded-full p-0.5 mt-1">
                    {([['dry', 'Dry in place'], ['remove', 'Remove / tear out']] as [string, string][]).map(([val, lbl]) => (
                      <button key={val} onClick={() => setWet({ disposition: val as 'dry' | 'remove' })}
                        className={`flex-1 py-1.5 rounded-full text-xs font-bold ${(wa.disposition ?? 'dry') === val ? 'bg-white shadow-sm text-sky' : 'text-gray-500'}`}>{lbl}</button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Dry in place bills water extraction. Remove bills flooring tear-out.</p>
                </>
              )}
              <button onClick={() => setPendingWetId(null)} className="btn-primary w-full py-3 justify-center mt-4">Done</button>
            </div>
          </div>
        );
      })()}

      {/* Closing without saving loses everything drawn. Ask. */}
      {confirmExit && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12vh)' }}>
          <div className="absolute inset-0 bg-navy/40" onClick={() => setConfirmExit(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
            <div className="font-display font-bold text-lg text-navy">Save your changes?</div>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              You have unsaved work on this map. If you leave now it is gone.
            </p>
            <button onClick={async () => { setConfirmExit(false); await save(); }} disabled={saving}
              className="btn-primary w-full py-3 justify-center mt-4 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save and close'}
            </button>
            <button onClick={() => { setConfirmExit(false); onClose(false); }}
              className="w-full py-3 mt-2 rounded-xl font-semibold text-red-600 border border-red-200 active:bg-red-50">
              Discard changes
            </button>
            <button onClick={() => setConfirmExit(false)}
              className="w-full py-3 mt-2 rounded-xl font-semibold text-gray-600 active:bg-gray-50">
              Keep editing
            </button>
          </div>
        </div>
      )}

      {paletteGhost && !paletteGhost.over && (
        <div className="fixed z-[60] pointer-events-none -translate-x-1/2 -translate-y-1/2 opacity-80 drop-shadow-lg"
             style={{ left: paletteGhost.x, top: paletteGhost.y }}>
          <PlaceGlyph kind={paletteGhost.kind} />
        </div>
      )}
    </div>
  );
}