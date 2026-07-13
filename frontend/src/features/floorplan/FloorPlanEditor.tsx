import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Save, RotateCw, Plus, Minus, Grid3x3, DoorOpen, MousePointer2,
  SquarePlus, Droplet, MapPin, Trash2, Check, Magnet
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SceneLayers, EquipIcon } from '../sketch/SceneLayers';
import {
  normalizeScene, uid, nearestWallEdge, ptsStr, OPENING_DEFAULT_FT, UNITS_PER_FT,
  MATERIALS_BY_SURFACE, EQUIP_META,
  type EquipType, type OpeningKind, type Pt, type Scene
} from '../sketch/sketchModel';
import {
  footprintFromRoom, placedWalls, placedBBox, blockTransform, hitBlock, hitRoom,
  unplacePoint, roomOutline, sceneFromWorldPolygon, snap, autoArrange, computeWallSnap,
  type Block, type Footprint, type WallSnap
} from './floorPlanModel';

interface RoomRow { id: string; name: string; length_ft: number | null; width_ft: number | null; affected?: boolean | null; sort_order?: number | null }
type GKind = 'idle' | 'pan' | 'drag' | 'place' | 'rect';
type Tool = 'select' | 'space' | 'door' | 'window' | 'opening' | 'equip' | 'origin' | 'wet';
type SpaceMode = 'rect' | 'poly';

const OFF = 50;          // offset cursor: the target sits up-left of the finger, never under the thumb
const SNAP_PX = 18;      // wall-snap reach, in SCREEN pixels (scaled to scene units by zoom)
const MIN_OVERLAP = UNITS_PER_FT;

const ftLabel = (u: number) => `${Math.round(u / UNITS_PER_FT)} ft`;
const dimFt = (u: number) => `${(u / UNITS_PER_FT).toFixed(1)} ft`;

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
  if (kind === 'opening') return shell(
    <g stroke="#fff" strokeWidth={2.8} strokeLinecap="round">
      <line x1={-8} y1={0} x2={-3} y2={0} /><line x1={3} y1={0} x2={8} y2={0} />
    </g>);
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
// (rectangle drag, or the crosshair + Add corner method for any shape), and openings and
// equipment are DRAGGED out of the palette with a live ghost showing exactly where they
// will land. Anything less is a worse tool for the same job.
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
  const [wallSnap, setWallSnap] = useState<WallSnap | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ tx: 0, ty: 0, k: 1 });
  const [active, setActive] = useState<{ scene: Pt; px: Pt } | null>(null);
  const [draft, setDraft] = useState<{ kind: 'rect'; a: Pt; b: Pt } | { kind: 'poly'; pts: Pt[] } | null>(null);
  const [paletteGhost, setPaletteGhost] = useState<{ kind: string; x: number; y: number; over: boolean } | null>(null);
  const [nameSheet, setNameSheet] = useState<{ points: Pt[]; name: string } | null>(null);
  const [wetSheet, setWetSheet] = useState<{ roomId: string; material: string; disposition: 'dry' | 'remove' } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const inited = useRef(false);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const g = useRef<{ kind: GKind; downPx: Pt; lastPx: Pt; moved: boolean; roomId?: string; grab?: Pt }>(
    { kind: 'idle', downPx: [0, 0], lastPx: [0, 0], moved: false });
  const pdrag = useRef<{ id: number; kind: string; startX: number; startY: number; dragging: boolean } | null>(null);

  const markDirty = (roomId: string) => setDirty(d => new Set(d).add(roomId));

  useEffect(() => {
    (async () => {
      const { data: rws } = await supabase.from('resto_rooms')
        .select('id, name, length_ft, width_ft, affected, sort_order').eq('structure_id', structureId).order('sort_order');
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
    if (!isFinite(minX)) { setView({ k: 0.6, tx: size.w / 2, ty: size.h / 2 }); inited.current = true; return; }
    const cw = (maxX - minX) || 1, ch = (maxY - minY) || 1, pad = 70;
    const k = Math.min((size.w - pad) / cw, (size.h - pad) / ch, 3);
    setView({ k, tx: (size.w - cw * k) / 2 - minX * k, ty: (size.h - ch * k) / 2 - minY * k });
    inited.current = true;
  }, [size, loading, blocks, footprints]);

  function toPixel(cx: number, cy: number): Pt {
    const svg = svgRef.current; const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return [0, 0];
    const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
    const r = p.matrixTransform(ctm.inverse()); return [r.x, r.y];
  }
  function pxToScene([px, py]: Pt): Pt { const v = viewRef.current; return [(px - v.tx) / v.k, (py - v.ty) / v.k]; }
  const clampK = (k: number) => Math.min(20, Math.max(0.05, k));
  const snapPt = (p: Pt): Pt => [snap(p[0]), snap(p[1])];

  // ---- writing into a room's OWN sketch ------------------------------------
  const patchScene = (roomId: string, fn: (s: Scene) => Scene) => {
    setScenes(sc => ({ ...sc, [roomId]: fn(sc[roomId] ?? normalizeScene(null)) }));
    markDirty(roomId);
  };

  // Place an element at a world point: find the room under it, invert the block
  // transform to get that point in the room's OWN coordinates, then write it there.
  function commitPlace(world: Pt, kindOverride?: string) {
    const kind = kindOverride ?? (tool === 'equip' ? equipType : (tool === 'door' || tool === 'window' || tool === 'opening') ? doorKind : tool);
    const hit = hitRoom(footprints, blocks, world[0], world[1]);
    if (!hit) return;
    const fp = footprints[hit.roomId]; if (!fp) return;
    const local = unplacePoint(world, fp, hit);

    if (kind === 'air_mover' || kind === 'dehumidifier' || kind === 'air_scrubber') {
      patchScene(hit.roomId, s => ({ ...s, equipment: [...s.equipment, { id: uid(), type: kind as EquipType, x: local[0], y: local[1] }] }));
      return;
    }
    if (kind === 'origin') { patchScene(hit.roomId, s => ({ ...s, originOfLoss: local })); return; }
    if (kind === 'door' || kind === 'window' || kind === 'opening') { addOpening(hit.roomId, local, kind as OpeningKind, world); return; }
    if (kind === 'wet') { setWetSheet({ roomId: hit.roomId, material: 'Carpet', disposition: 'dry' }); return; }
  }

  // A door on a wall between two rooms is physically in BOTH rooms, but openings[] is
  // per-room. Place it in the room that was hit, then mirror it into any other room whose
  // wall runs through the same world point. A door visible from only one side is wrong.
  function addOpening(roomId: string, local: Pt, kind: OpeningKind, world: Pt) {
    const widthFt = OPENING_DEFAULT_FT[kind];
    const put = (rid: string, lp: Pt) => {
      const sc = scenes[rid]; if (!sc) return false;
      const near = nearestWallEdge(sc, lp[0], lp[1]);
      if (!near || near.dist >= 45 || near.edgeLen <= UNITS_PER_FT) return false;
      const halfFrac = Math.min(0.45, (widthFt * UNITS_PER_FT / 2) / near.edgeLen);
      const t = Math.max(halfFrac, Math.min(1 - halfFrac, near.t));
      patchScene(rid, s => ({ ...s, openings: [...(s.openings ?? []), { id: uid(), wallId: near.wallId, edge: near.edge, t, widthFt, kind }] }));
      return true;
    };
    if (!put(roomId, local)) return;
    for (const b of blocks) {
      if (b.roomId === roomId) continue;
      const fp2 = footprints[b.roomId]; if (!fp2) continue;
      put(b.roomId, unplacePoint(world, fp2, b));
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
        .select('id, name, length_ft, width_ft, affected, sort_order').single();
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
  const isOpening = tool === 'door' || tool === 'window' || tool === 'opening';
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
    else if (g.current.kind === 'pan') setView(v => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
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
    g.current.kind = 'idle'; g.current.roomId = undefined; g.current.grab = undefined;
    setActive(null); setWallSnap(null);
  }

  function doPinch() {
    const [a, b] = [...pointers.current.values()]; const pa = toPixel(a.x, a.y), pb = toPixel(b.x, b.y);
    const dist = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]); const cx = (pa[0] + pb[0]) / 2, cy = (pa[1] + pb[1]) / 2;
    const pv = pinch.current!, v = viewRef.current; const k = clampK(v.k * (dist / (pv.dist || dist))); const f = k / v.k;
    let tx = cx - (cx - v.tx) * f, ty = cy - (cy - v.ty) * f; tx += cx - pv.cx; ty += cy - pv.cy;
    setView({ tx, ty, k }); pinch.current = { dist, cx, cy };
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

  function zoomBy(f: number) { const v = viewRef.current, cx = size.w / 2, cy = size.h / 2; const k = clampK(v.k * f); const ff = k / v.k; setView({ k, tx: cx - (cx - v.tx) * ff, ty: cy - (cy - v.ty) * ff }); }
  function rotateSel() { if (!selected) return; setBlocks(bs => bs.map(b => b.roomId === selected ? { ...b, rotation: (b.rotation + 90) % 360 } : b)); }

  async function persist() {
    for (const roomId of dirty) {
      const scene = scenes[roomId]; if (!scene) continue;
      const id = sketchIds[roomId];
      if (id) await supabase.from('resto_sketches').update({ canvas_json: scene as any }).eq('id', id);
      else {
        const { data } = await supabase.from('resto_sketches')
          .insert({ org_id: orgId, room_id: roomId, type: 'moisture_map', canvas_json: scene as any }).select('id').single();
        if (data) setSketchIds(s => ({ ...s, [roomId]: (data as any).id }));
      }
    }
    setDirty(new Set());
    await supabase.from('resto_structure_floorplans').upsert(
      { structure_id: structureId, org_id: orgId, layout_json: { blocks }, updated_at: new Date().toISOString() },
      { onConflict: 'structure_id' });
  }
  async function save() { setSaving(true); try { await persist(); onClose(true); } finally { setSaving(false); } }
  async function openRoom() {
    if (!selected) return;
    setSaving(true);
    try { await persist(); } finally { setSaving(false); }
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
    { key: 'opening', label: 'Opening', onSelect: () => { setDoorKind('opening'); setTool('opening'); } }
  ];
  const PLACE_ITEMS = [
    { key: 'air_mover', label: 'Air Mover', onSelect: () => { setEquipType('air_mover'); setTool('equip'); } },
    { key: 'dehumidifier', label: 'Dehumidifier', onSelect: () => { setEquipType('dehumidifier'); setTool('equip'); } },
    { key: 'air_scrubber', label: 'Air Scrubber', onSelect: () => { setEquipType('air_scrubber'); setTool('equip'); } },
    { key: 'origin', label: 'Origin (X)', onSelect: () => setTool('origin') }
  ];

  const selectTool = (t: Tool) => { setTool(t); setDraft(null); setActive(null); setSelected(null); };
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
        <button onClick={save} disabled={saving} className="ml-1 btn-primary py-2 px-4 text-sm disabled:opacity-50"><Save size={16} /> Save</button>
      </div>

      <div ref={wrapRef} className="flex-1 relative overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Loading rooms...</div>
        ) : (
          <svg ref={svgRef} className="w-full h-full touch-none" viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
               onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <rect x={0} y={0} width={size.w} height={size.h} fill="#F4F7FB" />
            <g transform={`translate(${view.tx} ${view.ty}) scale(${k})`}>
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
                        <SceneLayers scene={scene} />
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
                          fontSize={18 / k} fontWeight={700} fill={affected ? '#0E2A4D' : '#64748B'}
                          stroke="#eef4fb" strokeWidth={4 / k} paintOrder="stroke"
                          style={{ pointerEvents: 'none' }}>{fp.name}</text>
                    {!affected && (
                      <text x={b.x} y={b.y + 22 / k} textAnchor="middle" dominantBaseline="central"
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
                      if (!hit) return <circle cx={active.scene[0]} cy={active.scene[1]} r={16} fill="#1483C2" fillOpacity={0.25} stroke="#1483C2" strokeWidth={3} />;
                      const fp2 = footprints[hit.roomId]; const sc = scenes[hit.roomId];
                      if (!fp2 || !sc) return null;
                      const lp = unplacePoint(active.scene, fp2, hit);
                      const near = nearestWallEdge(sc, lp[0], lp[1]);
                      if (!near || near.dist >= 45) return <circle cx={active.scene[0]} cy={active.scene[1]} r={16} fill="#1483C2" fillOpacity={0.2} stroke="#1483C2" strokeWidth={3} />;
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
                                stroke="#1483C2" strokeWidth={12} strokeLinecap="round" opacity={0.7} />
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

        {rectDraft && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-navy/90 text-white text-[12px] font-bold px-3.5 py-1.5 rounded-full pointer-events-none z-10 whitespace-nowrap">
            {ftLabel(rw)} × {ftLabel(rh)} · {Math.round((rw * rh) / (UNITS_PER_FT * UNITS_PER_FT))} sq ft
          </div>
        )}

        <div className="absolute right-3 bottom-3 flex flex-col gap-2">
          <button onClick={() => zoomBy(1.25)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Plus size={18} /></button>
          <button onClick={() => zoomBy(0.8)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Minus size={18} /></button>
        </div>

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

        {tool === 'select' && selFp && (
          <div className="absolute left-3 bottom-3 flex gap-2 flex-wrap max-w-[70%]">
            <button onClick={rotateSel} className="bg-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft flex items-center gap-1.5 active:scale-95"><RotateCw size={16} /> Rotate</button>
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
        <div className="grid grid-cols-3 gap-1 px-3 py-2 bg-white border-t border-gray-100">
          {OPENING_ITEMS.map(it => {
            const on = activeKey === it.key;
            return (
              <button key={it.key}
                onPointerDown={e => onPaletteDown(e, it)} onPointerMove={onPaletteMove}
                onPointerUp={onPaletteUp} onPointerCancel={onPaletteCancel}
                style={{ touchAction: 'none' }}
                className={`flex flex-col items-center gap-1 py-1.5 rounded-2xl ${on ? 'bg-sky-soft ring-1 ring-sky/40' : 'active:bg-gray-50'}`}>
                <PlanGlyph kind={it.key} />
                <span className={`text-[11px] font-semibold ${on ? 'text-sky-deep' : 'text-gray-500'}`}>{it.label}</span>
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
        {tool === 'select' && (selected ? (magnet ? 'Drag a room near another and it snaps flush · Rotate in 90 degree steps' : 'Snapping is off · Drag to position') : 'Tap a room to select it, then drag or rotate. Two fingers to pan and zoom.')}
        {tool === 'space' && (spaceMode === 'poly' ? 'Aim the crosshair at each corner, then tap Add corner. Draw an L-shaped hall if that is the shape.' : 'Drag a box from the anchor corner. Snaps to the 1 ft grid.')}
        {isOpening && `Drag the ${doorKind} onto a wall. The highlight shows where it attaches, and it mirrors onto a shared wall.`}
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