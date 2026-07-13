import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Save, RotateCw, Plus, Minus, Grid3x3, DoorOpen, MousePointer2,
  SquarePlus, Droplet, MapPin, Trash2, Check
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SceneLayers } from '../sketch/SceneLayers';
import {
  normalizeScene, uid, nearestWallEdge, OPENING_DEFAULT_FT, UNITS_PER_FT,
  MATERIALS_BY_SURFACE, EQUIP_META,
  type EquipType, type OpeningKind, type Pt, type Scene
} from '../sketch/sketchModel';
import {
  footprintFromRoom, placedWalls, placedBBox, blockTransform, hitBlock, hitRoom,
  unplacePoint, roomOutline, rectScene, snap, autoArrange,
  type Block, type Footprint
} from './floorPlanModel';

interface RoomRow { id: string; name: string; length_ft: number | null; width_ft: number | null; affected?: boolean | null; sort_order?: number | null }
type GKind = 'idle' | 'pan' | 'drag' | 'place';
type Tool = 'select' | 'space' | 'door' | 'window' | 'opening' | 'equip' | 'origin' | 'wet';

const PLACE_TOOLS: Tool[] = ['door', 'window', 'opening', 'equip', 'origin', 'wet'];
const OFF = 44;   // offset cursor: aim above-left of the finger, as the sketch editor does

// Structure floor-plan assembly canvas.
//
// It is TWO things at once, and that is the whole design:
//   1. A LAYOUT of rooms (drag, rotate, snap). Saved to resto_structure_floorplans.
//   2. An EDITOR onto each room's own sketch. A door, air mover, or wet floor
//      placed here is written into that room's resto_sketches.canvas_json, in the
//      room's own coordinates, exactly as if it had been placed in the moisture
//      map editor. There is no second copy and nothing to keep in sync: the room
//      editor, the S500 equipment check, the report, and the Xactimate export all
//      read the same record.
//
// The coordinate work that makes this possible is unplacePoint() in
// floorPlanModel: it inverts the block placement, turning a tap on the floor plan
// back into a point inside the room's local scene.
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
  const [showGrid, setShowGrid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ tx: 0, ty: 0, k: 1 });
  const [ghost, setGhost] = useState<Pt | null>(null);
  const [spaceSheet, setSpaceSheet] = useState<{ name: string; widthFt: string; lengthFt: string } | null>(null);
  const [wetSheet, setWetSheet] = useState<{ roomId: string; material: string; disposition: 'dry' | 'remove' } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const inited = useRef(false);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const g = useRef<{ kind: GKind; downPx: [number, number]; lastPx: [number, number]; moved: boolean; roomId?: string; grab?: [number, number] }>(
    { kind: 'idle', downPx: [0, 0], lastPx: [0, 0], moved: false });

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

  function toPixel(cx: number, cy: number): [number, number] {
    const svg = svgRef.current; const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return [0, 0];
    const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
    const r = p.matrixTransform(ctm.inverse()); return [r.x, r.y];
  }
  function pxToScene([px, py]: [number, number]): [number, number] { const v = viewRef.current; return [(px - v.tx) / v.k, (py - v.ty) / v.k]; }
  const clampK = (k: number) => Math.min(20, Math.max(0.05, k));

  // ---- writing into a room's OWN sketch ------------------------------------
  const patchScene = (roomId: string, fn: (s: Scene) => Scene) => {
    setScenes(sc => ({ ...sc, [roomId]: fn(sc[roomId] ?? normalizeScene(null)) }));
    markDirty(roomId);
  };

  // Place an element at a world point. Finds the room under it, inverts the block
  // transform to get the point in that room's own coordinates, then writes it.
  function commitPlace(world: Pt) {
    const hit = hitRoom(footprints, blocks, world[0], world[1]);
    if (!hit) return;
    const fp = footprints[hit.roomId]; if (!fp) return;
    const local = unplacePoint(world, fp, hit);
    const scene = scenes[hit.roomId] ?? normalizeScene(null);

    if (tool === 'equip') {
      patchScene(hit.roomId, s => ({ ...s, equipment: [...s.equipment, { id: uid(), type: equipType, x: local[0], y: local[1] }] }));
      return;
    }
    if (tool === 'origin') {
      patchScene(hit.roomId, s => ({ ...s, originOfLoss: local }));
      return;
    }
    if (tool === 'wet') {
      const wa = (scene.wetAreas ?? []).length;
      setWetSheet({ roomId: hit.roomId, material: 'Carpet', disposition: 'dry' });
      void wa;
      return;
    }
    if (tool === 'door' || tool === 'window' || tool === 'opening') {
      addOpening(hit.roomId, local, tool as OpeningKind, world);
      return;
    }
  }

  // A door on a wall between two rooms is physically in BOTH rooms, but openings[]
  // is per-room. Place it in the room that was tapped, then look for any other room
  // whose wall runs through the same world point and mirror it there. A door you can
  // only see from one side is wrong, and confuses whoever opens the other room.
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
    // mirror into any neighbouring room sharing that wall line
    for (const b of blocks) {
      if (b.roomId === roomId) continue;
      const fp2 = footprints[b.roomId]; if (!fp2) continue;
      put(b.roomId, unplacePoint(world, fp2, b));
    }
  }

  // Whole-floor wet. Deliberately NOT a brush: at floor-plan zoom a painted stroke
  // is imprecise, and wet square footage is what drives extraction and tear-out
  // dollars. Using the room's own outline polygon makes the area exact by
  // construction. Partial wet areas stay in the room editor where you can be precise.
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

  // A new space is a REAL room with a real rectangular sketch (doors attach to a
  // wallId + edge, so it needs walls), inserted with affected = false. It shows on
  // the floor plan and carries doors, but it is not scoped, not scored, and not
  // counted for photo coverage. When water reaches it, one tap promotes it.
  async function addSpace() {
    if (!spaceSheet) return;
    const name = spaceSheet.name.trim() || 'Hallway';
    const widthFt = parseFloat(spaceSheet.widthFt) || 4;
    const lengthFt = parseFloat(spaceSheet.lengthFt) || 12;
    setSpaceSheet(null);
    setSaving(true);
    try {
      const nextSort = Math.max(0, ...rooms.map(r => r.sort_order ?? 0)) + 1;
      const { data: room, error } = await supabase.from('resto_rooms')
        .insert({ org_id: orgId, structure_id: structureId, name, sort_order: nextSort, affected: false, width_ft: widthFt, length_ft: lengthFt })
        .select('id, name, length_ft, width_ft, affected, sort_order').single();
      if (error || !room) { alert('Could not add the space: ' + (error?.message ?? 'unknown error')); return; }

      const scene = rectScene(widthFt, lengthFt);
      const { data: sk } = await supabase.from('resto_sketches')
        .insert({ org_id: orgId, room_id: (room as any).id, type: 'moisture_map', canvas_json: scene as any })
        .select('id').single();

      const r = room as RoomRow;
      const fp = footprintFromRoom(r, scene);
      setRooms(rs => [...rs, r]);
      setFootprints(f => ({ ...f, [r.id]: fp }));
      setScenes(s => ({ ...s, [r.id]: scene }));
      setSketchIds(s => ({ ...s, [r.id]: (sk as any)?.id }));
      // drop it in the middle of the current view so it is immediately visible
      const v = viewRef.current;
      const cx = (size.w / 2 - v.tx) / v.k, cy = (size.h / 2 - v.ty) / v.k;
      setBlocks(bs => [...bs, { roomId: r.id, x: snap(cx), y: snap(cy), rotation: 0 }]);
      setSelected(r.id);
      setTool('select');
    } finally { setSaving(false); }
  }

  async function toggleAffected() {
    if (!selected) return;
    const r = rooms.find(x => x.id === selected); if (!r) return;
    const next = !(r.affected !== false);
    const { error } = await supabase.from('resto_rooms').update({ affected: next }).eq('id', r.id);
    if (error) { alert('Could not update the room: ' + error.message); return; }
    setRooms(rs => rs.map(x => x.id === r.id ? { ...x, affected: next } : x));
  }

  // ---- gestures ------------------------------------------------------------
  function onDown(e: React.PointerEvent) {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]; const pa = toPixel(a.x, a.y), pb = toPixel(b.x, b.y);
      pinch.current = { dist: Math.hypot(pa[0] - pb[0], pa[1] - pb[1]), cx: (pa[0] + pb[0]) / 2, cy: (pa[1] + pb[1]) / 2 };
      g.current.kind = 'idle'; setGhost(null); return;
    }
    const px = toPixel(e.clientX, e.clientY); const s = pxToScene(px);
    g.current.downPx = px; g.current.lastPx = px; g.current.moved = false;

    if (PLACE_TOOLS.includes(tool)) {
      g.current.kind = 'place';
      setGhost(pxToScene(toPixel(e.clientX - OFF, e.clientY - OFF)));
      return;
    }
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

    if (g.current.kind === 'place') setGhost(pxToScene(toPixel(e.clientX - OFF, e.clientY - OFF)));
    else if (g.current.kind === 'pan') setView(v => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
    else if (g.current.kind === 'drag' && g.current.roomId) {
      const s = pxToScene(px); const id = g.current.roomId, grab = g.current.grab!;
      setBlocks(bs => bs.map(b => b.roomId === id ? { ...b, x: s[0] - grab[0], y: s[1] - grab[1] } : b));
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

    if (g.current.kind === 'place' && ghost) commitPlace(ghost);
    else if (g.current.kind === 'drag' && g.current.roomId && g.current.moved) {
      const id = g.current.roomId;
      setBlocks(bs => bs.map(b => b.roomId === id ? { ...b, x: snap(b.x), y: snap(b.y) } : b));
    }
    g.current.kind = 'idle'; g.current.roomId = undefined; g.current.grab = undefined;
    setGhost(null);
  }
  function doPinch() {
    const [a, b] = [...pointers.current.values()]; const pa = toPixel(a.x, a.y), pb = toPixel(b.x, b.y);
    const dist = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]); const cx = (pa[0] + pb[0]) / 2, cy = (pa[1] + pb[1]) / 2;
    const pv = pinch.current!, v = viewRef.current; const k = clampK(v.k * (dist / (pv.dist || dist))); const f = k / v.k;
    let tx = cx - (cx - v.tx) * f, ty = cy - (cy - v.ty) * f; tx += cx - pv.cx; ty += cy - pv.cy;
    setView({ tx, ty, k }); pinch.current = { dist, cx, cy };
  }
  function zoomBy(f: number) { const v = viewRef.current, cx = size.w / 2, cy = size.h / 2; const k = clampK(v.k * f); const ff = k / v.k; setView({ k, tx: cx - (cx - v.tx) * ff, ty: cy - (cy - v.ty) * ff }); }
  function rotateSel() { if (!selected) return; setBlocks(bs => bs.map(b => b.roomId === selected ? { ...b, rotation: (b.rotation + 90) % 360 } : b)); }

  // ---- persistence ---------------------------------------------------------
  async function persist() {
    // every sketch we touched, written back to the room it belongs to
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
  const isPlacing = PLACE_TOOLS.includes(tool);

  const Tab = ({ t, icon: Icon, label }: { t: Tool; icon: any; label: string }) => (
    <button onClick={() => { setTool(t); setGhost(null); if (t === 'space') setSpaceSheet({ name: '', widthFt: '4', lengthFt: '12' }); }}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${tool === t ? 'text-sky' : 'text-gray-400'}`}>
      <Icon size={20} strokeWidth={tool === t ? 2.6 : 2} /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#F4F7FB] flex flex-col select-none">
      <div className="safe-top bg-white border-b border-gray-100 flex items-center px-2 pb-2 gap-1">
        <button onClick={() => onClose(false)} className="p-2 rounded-xl active:bg-gray-100"><X size={22} /></button>
        <div className="flex-1 text-center font-display font-bold text-[15px] truncate px-1">{structureName} · Floor plan</div>
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
                    {/* the room's REAL scene, drawn with the same renderer the room
                        editor uses. translate(b) rotate(a) translate(-center) is
                        exactly placePoint, so walls, doors, wet areas, equipment,
                        and readings all land in the right place. */}
                    {fp.hasSketch && scene ? (
                      <g transform={blockTransform(fp, b)} opacity={affected ? 1 : 0.55}>
                        <SceneLayers scene={scene} />
                      </g>
                    ) : (
                      walls.map((w, i) => (
                        <polygon key={i} points={w.points.map(p => p.join(',')).join(' ')}
                                 fill="#fff7ed" stroke="#f59e0b" strokeWidth={3 / k}
                                 strokeLinejoin="round" strokeDasharray={`${9 / k} ${7 / k}`} />
                      ))
                    )}
                    {/* selection ring + name, in floor-plan space so they never rotate */}
                    {walls.map((w, i) => (
                      <polygon key={'sel' + i} points={w.points.map(p => p.join(',')).join(' ')}
                               fill="none" stroke={sel ? '#1483C2' : 'transparent'} strokeWidth={5 / k} strokeLinejoin="round"
                               style={{ pointerEvents: 'none' }} />
                    ))}
                    <text x={b.x} y={b.y} textAnchor="middle" dominantBaseline="central"
                          fontSize={18 / k} fontWeight={700} fill={affected ? '#0E2A4D' : '#64748B'}
                          stroke="#eef4fb" strokeWidth={4 / k} paintOrder="stroke"
                          style={{ pointerEvents: 'none' }}>{fp.name}</text>
                    {!affected && (
                      <text x={b.x} y={b.y + 22 / k} textAnchor="middle" dominantBaseline="central"
                            fontSize={11 / k} fontWeight={600} fill="#64748B" style={{ pointerEvents: 'none' }}>context only</text>
                    )}
                    {affected && !fp.hasSketch && (
                      <text x={b.x} y={b.y + 22 / k} textAnchor="middle" dominantBaseline="central"
                            fontSize={11 / k} fontWeight={600} fill="#b45309" style={{ pointerEvents: 'none' }}>not sketched</text>
                    )}
                  </g>
                );
              })}

              {/* placement ghost: shows exactly what lands, and where */}
              {ghost && isPlacing && (() => {
                const inRoom = !!hitRoom(footprints, blocks, ghost[0], ghost[1]);
                return (
                  <g style={{ pointerEvents: 'none' }} opacity={inRoom ? 0.75 : 0.3}>
                    {tool === 'equip' && (
                      <g transform={`translate(${ghost[0]},${ghost[1]})`}>
                        <circle r={26} fill={EQUIP_META[equipType].fill} stroke={EQUIP_META[equipType].ring} strokeWidth={3} />
                      </g>
                    )}
                    {tool === 'origin' && (
                      <g transform={`translate(${ghost[0]},${ghost[1]})`}>
                        <circle r={13} fill="#fff" stroke="#DC2626" strokeWidth={3} />
                        <line x1={-6} y1={-6} x2={6} y2={6} stroke="#DC2626" strokeWidth={3.5} strokeLinecap="round" />
                        <line x1={6} y1={-6} x2={-6} y2={6} stroke="#DC2626" strokeWidth={3.5} strokeLinecap="round" />
                      </g>
                    )}
                    {(tool === 'door' || tool === 'window' || tool === 'opening') && (
                      <circle cx={ghost[0]} cy={ghost[1]} r={16} fill="#1483C2" fillOpacity={0.25} stroke="#1483C2" strokeWidth={3} />
                    )}
                    {tool === 'wet' && (
                      <circle cx={ghost[0]} cy={ghost[1]} r={20} fill="#7DD3FC" fillOpacity={0.4} stroke="#0284c7" strokeWidth={3} />
                    )}
                    <circle cx={ghost[0]} cy={ghost[1]} r={4 / k} fill="#1483C2" />
                  </g>
                );
              })()}
            </g>
          </svg>
        )}

        {!loading && blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-8 text-gray-400 text-sm pointer-events-none">
            No rooms in this structure yet. Add rooms first, or tap Space to draw a hallway.
          </div>
        )}

        <div className="absolute right-3 bottom-3 flex flex-col gap-2">
          <button onClick={() => zoomBy(1.25)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Plus size={18} /></button>
          <button onClick={() => zoomBy(0.8)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Minus size={18} /></button>
        </div>

        {tool === 'select' && selFp && (
          <div className="absolute left-3 bottom-3 flex gap-2 flex-wrap max-w-[70%]">
            <button onClick={rotateSel} className="bg-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft flex items-center gap-1.5 active:scale-95">
              <RotateCw size={16} /> Rotate
            </button>
            <button onClick={toggleAffected} className={`rounded-full px-4 py-2.5 text-sm font-bold shadow-soft flex items-center gap-1.5 active:scale-95 ${selAffected ? 'bg-white text-gray-600' : 'bg-sky text-white'}`}>
              {selAffected ? <><Trash2 size={16} /> Not affected</> : <><Check size={16} /> Mark affected</>}
            </button>
            <button onClick={openRoom} className="bg-navy text-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft flex items-center gap-1.5 active:scale-95">
              <DoorOpen size={16} /> {selFp.hasSketch ? 'Open room' : 'Sketch it'}
            </button>
          </div>
        )}
      </div>

      {/* sub-palette for the openings + place tools */}
      {(tool === 'door' || tool === 'window' || tool === 'opening') && (
        <div className="grid grid-cols-3 gap-1 px-3 py-2 bg-white border-t border-gray-100">
          {(['door', 'window', 'opening'] as OpeningKind[]).map(kd => (
            <button key={kd} onClick={() => setTool(kd as Tool)}
              className={`py-2 rounded-2xl text-[12px] font-bold capitalize ${tool === kd ? 'bg-sky-soft text-sky-deep ring-1 ring-sky/40' : 'text-gray-500 active:bg-gray-50'}`}>
              {kd}
            </button>
          ))}
        </div>
      )}
      {tool === 'equip' && (
        <div className="grid grid-cols-3 gap-1 px-3 py-2 bg-white border-t border-gray-100">
          {(['air_mover', 'dehumidifier', 'air_scrubber'] as EquipType[]).map(t => (
            <button key={t} onClick={() => setEquipType(t)}
              className={`py-2 rounded-2xl text-[11px] font-bold ${equipType === t ? 'bg-sky-soft text-sky-deep ring-1 ring-sky/40' : 'text-gray-500 active:bg-gray-50'}`}>
              {EQUIP_META[t].full}
            </button>
          ))}
        </div>
      )}

      <div className="text-center text-[11px] font-medium text-white py-1.5 bg-navy/90">
        {tool === 'select' && (selected ? 'Drag to position · Rotate in 90 degree steps · tap empty space to deselect' : 'Tap a room to select it, then drag or rotate. Two fingers to pan and zoom.')}
        {tool === 'space' && 'Add a hallway, closet, or stairwell so the plan reads right. It carries doors but is not scoped.'}
        {(tool === 'door' || tool === 'window' || tool === 'opening') && `Tap a wall to drop a ${tool}. It saves into that room's sketch, and mirrors onto a shared wall.`}
        {tool === 'equip' && 'Tap inside a room to drop equipment. It saves into that room and counts toward S500 and the invoice.'}
        {tool === 'origin' && 'Drop the X on the source of the loss.'}
        {tool === 'wet' && 'Tap a room to mark its whole floor wet. Use the room sketch for partial areas.'}
      </div>

      {/* FIX: the hint bar was the last child with no safe-area padding, so on a
          notched iPhone it sat under the home indicator and got clipped. The sketch
          editor never showed this because its <nav className="safe-bottom"> absorbed
          the inset. This nav does the same job here. */}
      <nav className="safe-bottom bg-white border-t border-gray-100 flex">
        <Tab t="select" icon={MousePointer2} label="Move" />
        <Tab t="space" icon={SquarePlus} label="Space" />
        <Tab t="door" icon={DoorOpen} label="Openings" />
        <Tab t="equip" icon={MapPin} label="Place" />
        <Tab t="wet" icon={Droplet} label="Water" />
      </nav>

      {/* ---- add a space ---- */}
      {spaceSheet && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8vh)' }}>
          <div className="absolute inset-0 bg-navy/30" onClick={() => { setSpaceSheet(null); setTool('select'); }} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
            <div className="font-display font-bold text-lg text-navy">Add a space</div>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
              A hallway, closet, or stairwell, so the plan reads the way the building does. It carries doors and shows the flow, but it is not scoped or scored until you mark it affected.
            </p>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-3">Name</label>
            <input value={spaceSheet.name} onChange={e => setSpaceSheet(s => s && ({ ...s, name: e.target.value }))}
              placeholder="Hallway"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-1 text-[16px] focus:outline-none focus:border-sky" />
            <div className="flex gap-3 mt-3">
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Width (ft)</label>
                <input value={spaceSheet.widthFt} onChange={e => setSpaceSheet(s => s && ({ ...s, widthFt: e.target.value }))} inputMode="decimal"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-1 text-[16px] font-bold focus:outline-none focus:border-sky" />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Length (ft)</label>
                <input value={spaceSheet.lengthFt} onChange={e => setSpaceSheet(s => s && ({ ...s, lengthFt: e.target.value }))} inputMode="decimal"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-1 text-[16px] font-bold focus:outline-none focus:border-sky" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setSpaceSheet(null); setTool('select'); }} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
              <button onClick={addSpace} disabled={saving} className="btn-primary flex-1 py-3 justify-center disabled:opacity-50">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- mark a whole floor wet ---- */}
      {wetSheet && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8vh)' }}>
          <div className="absolute inset-0 bg-navy/30" onClick={() => setWetSheet(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-4">
            <div className="font-display font-bold text-lg text-navy">Whole floor wet</div>
            <p className="text-xs text-gray-400 mt-0.5">
              Marks this room's entire floor as affected, measured from its outline. For part of a floor, use the room's moisture map.
            </p>
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
    </div>
  );
}