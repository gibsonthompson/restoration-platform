import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Save, RotateCw, Plus, Minus, Grid3x3, DoorOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ptsStr, UNITS_PER_FT } from '../sketch/sketchModel';
import {
  footprintFromRoom, placedWalls, placedBBox, hitBlock, snap, autoArrange,
  type Block, type Footprint
} from './floorPlanModel';

interface RoomRow { id: string; name: string; length_ft: number | null; width_ft: number | null }
type GKind = 'idle' | 'pan' | 'drag';

// Structure floor-plan assembly canvas. Loads each room's latest sketch as a
// draggable footprint block; drag to position, rotate in 90° steps, grid-snap,
// save. Blocks reference live sketches so re-sketching a room reshapes its block.
export function FloorPlanEditor({ structureId, structureName, claimId, orgId, onClose }: {
  structureId: string; structureName: string; claimId: string; orgId: string; onClose: (saved: boolean) => void;
}) {
  const nav = useNavigate();
  const [footprints, setFootprints] = useState<Record<string, Footprint>>({});
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ tx: 0, ty: 0, k: 1 });

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const inited = useRef(false);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const g = useRef<{ kind: GKind; downPx: [number, number]; lastPx: [number, number]; moved: boolean; roomId?: string; grab?: [number, number] }>(
    { kind: 'idle', downPx: [0, 0], lastPx: [0, 0], moved: false });

  useEffect(() => {
    (async () => {
      const { data: rooms } = await supabase.from('resto_rooms')
        .select('id, name, length_ft, width_ft').eq('structure_id', structureId).order('sort_order');
      const rs = (rooms as RoomRow[]) ?? [];
      const ids = rs.map(r => r.id);
      const latest: Record<string, any> = {};
      if (ids.length) {
        const { data: sk } = await supabase.from('resto_sketches')
          .select('room_id, canvas_json, created_at').in('room_id', ids).order('created_at', { ascending: false });
        for (const row of ((sk as any[]) ?? [])) if (!latest[row.room_id]) latest[row.room_id] = row.canvas_json;
      }
      const fps: Record<string, Footprint> = {};
      for (const r of rs) fps[r.id] = footprintFromRoom(r, latest[r.id] ?? null);
      const { data: fp } = await supabase.from('resto_structure_floorplans')
        .select('layout_json').eq('structure_id', structureId).limit(1);
      const saved: Block[] = (fp && (fp[0] as any)?.layout_json?.blocks) ?? [];
      setFootprints(fps);
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

  function onDown(e: React.PointerEvent) {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]; const pa = toPixel(a.x, a.y), pb = toPixel(b.x, b.y);
      pinch.current = { dist: Math.hypot(pa[0] - pb[0], pa[1] - pb[1]), cx: (pa[0] + pb[0]) / 2, cy: (pa[1] + pb[1]) / 2 };
      g.current.kind = 'idle'; return;
    }
    const px = toPixel(e.clientX, e.clientY); const s = pxToScene(px);
    g.current.downPx = px; g.current.lastPx = px; g.current.moved = false;
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
    if (g.current.kind === 'pan') setView(v => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
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
    if (g.current.kind === 'drag' && g.current.roomId && g.current.moved) {
      const id = g.current.roomId;
      setBlocks(bs => bs.map(b => b.roomId === id ? { ...b, x: snap(b.x), y: snap(b.y) } : b));
    }
    g.current.kind = 'idle'; g.current.roomId = undefined; g.current.grab = undefined;
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

  async function persist() {
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
  // grid spanning the visible scene area
  const vMinX = -view.tx / k, vMinY = -view.ty / k, vMaxX = (size.w - view.tx) / k, vMaxY = (size.h - view.ty) / k;
  const step = UNITS_PER_FT;
  const gx: number[] = [], gy: number[] = [];
  if (showGrid && k > 0.03) {
    for (let x = Math.floor(vMinX / step) * step; x <= vMaxX; x += step) gx.push(x);
    for (let y = Math.floor(vMinY / step) * step; y <= vMaxY; y += step) gy.push(y);
  }
  const selFp = selected ? footprints[selected] : null;

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
        ) : blocks.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-center px-8 text-gray-400 text-sm">
            No rooms in this structure yet. Add rooms first, then assemble them here.
          </div>
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
                const walls = placedWalls(fp, b); const sel = b.roomId === selected;
                return (
                  <g key={b.roomId}>
                    {walls.map((w, i) => (
                      <polygon key={i} points={ptsStr(w.points)}
                               fill={fp.hasSketch ? '#eef4fb' : '#fff7ed'}
                               stroke={sel ? '#1483C2' : (fp.hasSketch ? '#0E2A4D' : '#f59e0b')}
                               strokeWidth={(sel ? 5 : 3) / k} strokeLinejoin="round"
                               strokeDasharray={fp.hasSketch ? undefined : `${9 / k} ${7 / k}`} />
                    ))}
                    <text x={b.x} y={b.y} textAnchor="middle" dominantBaseline="central"
                          fontSize={18 / k} fontWeight={700} fill="#0E2A4D"
                          stroke="#eef4fb" strokeWidth={4 / k} paintOrder="stroke"
                          style={{ pointerEvents: 'none' }}>{fp.name}</text>
                    {!fp.hasSketch && (
                      <text x={b.x} y={b.y + 22 / k} textAnchor="middle" dominantBaseline="central"
                            fontSize={11 / k} fontWeight={600} fill="#b45309" style={{ pointerEvents: 'none' }}>not sketched</text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        <div className="absolute right-3 bottom-3 flex flex-col gap-2">
          <button onClick={() => zoomBy(1.25)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Plus size={18} /></button>
          <button onClick={() => zoomBy(0.8)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Minus size={18} /></button>
        </div>

        {selFp && (
          <div className="absolute left-3 bottom-3 flex gap-2">
            <button onClick={rotateSel} className="bg-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft flex items-center gap-1.5 active:scale-95">
              <RotateCw size={16} /> Rotate
            </button>
            <button onClick={openRoom} className="bg-navy text-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft flex items-center gap-1.5 active:scale-95">
              <DoorOpen size={16} /> {selFp.hasSketch ? 'Open room' : 'Sketch it'}
            </button>
          </div>
        )}
      </div>

      <div className="text-center text-[11px] font-medium text-white py-1.5 bg-navy/90">
        {selected ? 'Drag to position · Rotate in 90° steps · tap empty space to deselect' : 'Tap a room to select it, then drag or rotate. Two fingers to pan and zoom.'}
      </div>
    </div>
  );
}