import { useRef, useState } from 'react';
import { X, Undo2, Save, Move, Square, Droplet, Wind, Gauge, Grid3x3, Plus, Minus, Trash2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SceneLayers } from './SceneLayers';
import {
  normalizeScene, uid, hitEquipment, hitPoint, snapVertex, snapGrid, dist2,
  SCENE_SIZE, GRID, EQUIP_META, type Scene, type Pt, type EquipType
} from './sketchModel';

type Tool = 'move' | 'walls' | 'wet' | 'equip' | 'reading';
interface ViewBox { x: number; y: number; w: number; h: number; }
interface SketchRow { id: string; canvas_json: any; }

const MIN_W = SCENE_SIZE * 0.18;   // max zoom-in
const MAX_W = SCENE_SIZE * 2.6;    // max zoom-out
const clampW = (w: number) => Math.min(MAX_W, Math.max(MIN_W, w));

// Full-screen moisture-map editor. Pointer-event driven so one finger performs
// the active tool (or pans) and two fingers pinch-zoom + pan the canvas.
export function MoistureMapEditor({ sketch, roomId, claimId, orgId, onClose }:
  { sketch: SketchRow | null; roomId: string; claimId: string; orgId: string; onClose: (saved: boolean) => void }) {
  void claimId;
  const [scene, setScene] = useState<Scene>(() => normalizeScene(sketch?.canvas_json));
  const [history, setHistory] = useState<Scene[]>([]);
  const [tool, setTool] = useState<Tool>('move');
  const [equipType, setEquipType] = useState<EquipType>('air_mover');
  const [showGrid, setShowGrid] = useState(true);
  const [currentWall, setCurrentWall] = useState<Pt[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wetPreview, setWetPreview] = useState<Pt[] | null>(null);
  const [vb, setVb] = useState<ViewBox>({ x: 0, y: 0, w: SCENE_SIZE, h: SCENE_SIZE });
  const [saving, setSaving] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const vbRef = useRef(vb); vbRef.current = vb;
  const wallRef = useRef<Pt[]>(currentWall); wallRef.current = currentWall;

  // gesture state (refs so pointer handlers never go stale)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const g = useRef<{
    kind: 'idle' | 'pan' | 'drag' | 'wet' | 'tap' | 'pinch';
    downX: number; downY: number; lastX: number; lastY: number; moved: boolean;
    dragKind?: 'equip' | 'point'; dragId?: string; wet: Pt[]; pinchDist: number;
  }>({ kind: 'idle', downX: 0, downY: 0, lastX: 0, lastY: 0, moved: false, wet: [], pinchDist: 0 });

  function snapshot() { setHistory(h => [...h.slice(-29), scene]); }
  function undo() {
    setHistory(h => {
      if (!h.length) return h;
      setScene(h[h.length - 1]); setCurrentWall([]); setSelectedId(null);
      return h.slice(0, -1);
    });
  }

  function rect() { return svgRef.current!.getBoundingClientRect(); }
  function toScene(clientX: number, clientY: number): Pt {
    const r = rect(); const v = vbRef.current;
    return [v.x + ((clientX - r.left) / r.width) * v.w, v.y + ((clientY - r.top) / r.height) * v.h];
  }
  function twoPointerData() {
    const [a, b] = [...pointers.current.values()];
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    return { cx, cy, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function onDown(e: React.PointerEvent) {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      g.current.kind = 'pinch';
      g.current.pinchDist = twoPointerData().dist;
      setWetPreview(null); g.current.wet = [];
      return;
    }
    const [sx, sy] = toScene(e.clientX, e.clientY);
    g.current.downX = e.clientX; g.current.downY = e.clientY;
    g.current.lastX = e.clientX; g.current.lastY = e.clientY; g.current.moved = false;

    if (tool === 'move') {
      const ep = hitEquipment(scene, sx, sy);
      const mp = ep ? null : hitPoint(scene, sx, sy);
      if (ep) { snapshot(); setSelectedId(ep.id); g.current.kind = 'drag'; g.current.dragKind = 'equip'; g.current.dragId = ep.id; }
      else if (mp) { snapshot(); setSelectedId(mp.id); g.current.kind = 'drag'; g.current.dragKind = 'point'; g.current.dragId = mp.id; }
      else { setSelectedId(null); g.current.kind = 'pan'; }
    } else if (tool === 'wet') {
      g.current.kind = 'wet'; g.current.wet = [[sx, sy]];
    } else {
      // placement tools: decide tap vs pan on move/up
      g.current.kind = 'tap';
    }
  }

  function doPinch() {
    const { cx, cy, dist } = twoPointerData();
    const v = vbRef.current;
    const focal = toScene(cx, cy);
    const ratio = dist / (g.current.pinchDist || dist);
    const newW = clampW(v.w / ratio);
    const newH = newW * (v.h / v.w);
    const r = rect();
    const px = (cx - r.left) / r.width, py = (cy - r.top) / r.height;
    setVb({ x: focal[0] - px * newW, y: focal[1] - py * newH, w: newW, h: newH });
    g.current.pinchDist = dist;
  }

  function panBy(dxClient: number, dyClient: number) {
    const r = rect(); const v = vbRef.current;
    setVb({ ...v, x: v.x - (dxClient / r.width) * v.w, y: v.y - (dyClient / r.height) * v.h });
  }

  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.current.kind === 'pinch' && pointers.current.size >= 2) { doPinch(); return; }

    const dx = e.clientX - g.current.lastX, dy = e.clientY - g.current.lastY;
    if (!g.current.moved && Math.hypot(e.clientX - g.current.downX, e.clientY - g.current.downY) > 6) g.current.moved = true;

    if (g.current.kind === 'pan' || (g.current.kind === 'tap' && g.current.moved)) {
      panBy(dx, dy);
    } else if (g.current.kind === 'drag' && g.current.dragId) {
      const [sx, sy] = toScene(e.clientX, e.clientY);
      const gx = snapGrid(sx), gy = snapGrid(sy);
      if (g.current.dragKind === 'equip') {
        setScene(s => ({ ...s, equipment: s.equipment.map(q => q.id === g.current.dragId ? { ...q, x: gx, y: gy } : q) }));
      } else {
        setScene(s => ({ ...s, moisturePoints: (s.moisturePoints ?? []).map(q => q.id === g.current.dragId ? { ...q, x: gx, y: gy } : q) }));
      }
    } else if (g.current.kind === 'wet') {
      const [sx, sy] = toScene(e.clientX, e.clientY);
      g.current.wet.push([sx, sy]);
      setWetPreview([...g.current.wet]);
    }
    g.current.lastX = e.clientX; g.current.lastY = e.clientY;
  }

  function onUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);

    if (g.current.kind === 'pinch') {
      if (pointers.current.size === 1) {
        const [p] = [...pointers.current.values()];
        g.current.kind = 'pan'; g.current.lastX = p.x; g.current.lastY = p.y;
        g.current.downX = p.x; g.current.downY = p.y; g.current.moved = true;
      } else if (pointers.current.size === 0) {
        g.current.kind = 'idle';
      }
      return;
    }
    if (pointers.current.size > 0) return;

    if (g.current.kind === 'wet' && g.current.wet.length > 2) {
      snapshot();
      const pts = g.current.wet;
      setScene(s => ({ ...s, wetAreas: [...s.wetAreas, { id: uid(), points: pts }] }));
    } else if (g.current.kind === 'tap' && !g.current.moved) {
      tapPlace(g.current.downX, g.current.downY);
    }
    g.current.kind = 'idle'; g.current.dragId = undefined; g.current.wet = [];
    setWetPreview(null);
  }

  function tapPlace(clientX: number, clientY: number) {
    const [rx, ry] = toScene(clientX, clientY);
    if (tool === 'walls') {
      const prev = wallRef.current.length ? wallRef.current[wallRef.current.length - 1] : null;
      const p = snapVertex([rx, ry], prev);
      // close the loop if tapping near the first vertex
      if (wallRef.current.length >= 2 && dist2(p, wallRef.current[0]) < 26 * 26) { finishWall(); return; }
      setCurrentWall(w => [...w, p]);
    } else if (tool === 'equip') {
      snapshot();
      setScene(s => ({ ...s, equipment: [...s.equipment, { id: uid(), type: equipType, x: snapGrid(rx), y: snapGrid(ry) }] }));
    } else if (tool === 'reading') {
      const label = prompt('Moisture reading (e.g. 18%, WET, 45)');
      if (label == null) return;
      snapshot();
      setScene(s => ({ ...s, moisturePoints: [...(s.moisturePoints ?? []), { id: uid(), x: snapGrid(rx), y: snapGrid(ry), label }] }));
    }
  }

  function finishWall() {
    if (wallRef.current.length >= 3) {
      snapshot();
      const pts = wallRef.current;
      setScene(s => ({ ...s, walls: [...s.walls, { id: uid(), points: pts }] }));
    }
    setCurrentWall([]);
  }

  function deleteSelected() {
    if (!selectedId) return;
    snapshot();
    setScene(s => ({
      ...s,
      equipment: s.equipment.filter(e => e.id !== selectedId),
      moisturePoints: (s.moisturePoints ?? []).filter(m => m.id !== selectedId)
    }));
    setSelectedId(null);
  }

  function zoomButton(factor: number) {
    setVb(v => {
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      const w = clampW(v.w * factor), h = w * (v.h / v.w);
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    });
  }

  // desktop trackpad / wheel: ctrl = zoom-to-cursor, else pan
  function onWheel(e: React.WheelEvent) {
    const v = vbRef.current;
    if (e.ctrlKey || e.metaKey) {
      const focal = toScene(e.clientX, e.clientY);
      const factor = Math.pow(2, Math.max(-10, Math.min(10, e.deltaY)) * 0.01);
      const newW = clampW(v.w * factor), newH = newW * (v.h / v.w);
      const r = rect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      setVb({ x: focal[0] - px * newW, y: focal[1] - py * newH, w: newW, h: newH });
    } else {
      setVb({ ...v, x: v.x + (e.deltaX / rect().width) * v.w, y: v.y + (e.deltaY / rect().height) * v.h });
    }
  }

  async function save() {
    setSaving(true);
    try {
      if (sketch?.id) await supabase.from('resto_sketches').update({ canvas_json: scene as any }).eq('id', sketch.id);
      else await supabase.from('resto_sketches').insert({ org_id: orgId, room_id: roomId, type: 'moisture_map', canvas_json: scene as any });
      onClose(true);
    } finally { setSaving(false); }
  }

  const gridLines = showGrid ? Array.from({ length: Math.floor(SCENE_SIZE / (GRID * 2)) + 1 }, (_, i) => i * GRID * 2) : [];
  const counts = {
    am: scene.equipment.filter(e => e.type === 'air_mover').length,
    dh: scene.equipment.filter(e => e.type === 'dehumidifier').length,
    as: scene.equipment.filter(e => e.type === 'air_scrubber').length,
    mp: (scene.moisturePoints ?? []).length
  };

  const Tab = ({ t, icon: Icon, label }: { t: Tool; icon: any; label: string }) => (
    <button onClick={() => { setTool(t); setSelectedId(null); if (t !== 'walls') setCurrentWall([]); }}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${tool === t ? 'text-sky' : 'text-gray-400'}`}>
      <Icon size={20} strokeWidth={tool === t ? 2.6 : 2} /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#F4F7FB] flex flex-col select-none">
      {/* top bar */}
      <div className="safe-top bg-white border-b border-gray-100 flex items-center px-2 pb-2 gap-1">
        <button onClick={() => onClose(false)} className="p-2 rounded-xl active:bg-gray-100"><X size={22} /></button>
        <div className="flex-1 text-center font-display font-bold text-[15px]">Moisture Map</div>
        <button onClick={undo} disabled={!history.length} className="p-2 rounded-xl active:bg-gray-100 disabled:opacity-30"><Undo2 size={20} /></button>
        <button onClick={save} disabled={saving} className="ml-1 btn-primary py-2 px-4 text-sm disabled:opacity-50"><Save size={16} /> Save</button>
      </div>

      {/* legend */}
      <div className="flex gap-2 px-3 py-2 bg-white/70 text-[11px] font-semibold overflow-x-auto">
        <span className="chip bg-sky-soft text-sky-deep">AM {counts.am}</span>
        <span className="chip bg-aqua-soft text-aqua-deep">DH {counts.dh}</span>
        <span className="chip bg-slate-100 text-slate-600">AS {counts.as}</span>
        <span className="chip bg-coral-soft text-coral-deep">Readings {counts.mp}</span>
      </div>

      {/* canvas */}
      <div className="flex-1 relative overflow-hidden">
        <svg ref={svgRef} className="w-full h-full touch-none" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
             onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
          <rect x={-2000} y={-2000} width={SCENE_SIZE + 4000} height={SCENE_SIZE + 4000} fill="#F4F7FB" />
          {gridLines.map(gp => (
            <g key={gp} stroke="#DCE6F1" strokeWidth={1}>
              <line x1={gp} y1={0} x2={gp} y2={SCENE_SIZE} />
              <line x1={0} y1={gp} x2={SCENE_SIZE} y2={gp} />
            </g>
          ))}
          {wetPreview && wetPreview.length > 1 && (
            <polygon points={wetPreview.map(p => `${p[0]},${p[1]}`).join(' ')} fill="#7DD3FC" fillOpacity={0.4} stroke="#0284c7" strokeWidth={3} />
          )}
          <SceneLayers scene={scene} currentWall={currentWall} selectedId={selectedId} />
        </svg>

        {/* zoom buttons */}
        <div className="absolute right-3 bottom-3 flex flex-col gap-2">
          <button onClick={() => zoomButton(0.8)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Plus size={18} /></button>
          <button onClick={() => zoomButton(1.25)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Minus size={18} /></button>
        </div>

        {/* contextual action (bottom-left) */}
        {tool === 'walls' && currentWall.length >= 3 && (
          <button onClick={finishWall} className="absolute left-3 bottom-3 btn-primary px-4 py-2.5 text-sm rounded-full"><Check size={16} /> Finish room</button>
        )}
        {tool === 'move' && selectedId && (
          <button onClick={deleteSelected} className="absolute left-3 bottom-3 bg-red-600 text-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft flex items-center gap-1.5 active:scale-95"><Trash2 size={16} /> Delete</button>
        )}
        {tool === 'equip' && (
          <div className="absolute left-3 bottom-3 bg-white rounded-full shadow-soft flex overflow-hidden">
            {(Object.keys(EQUIP_META) as EquipType[]).map(t => (
              <button key={t} onClick={() => setEquipType(t)}
                className={`px-3.5 py-2.5 text-xs font-bold ${equipType === t ? 'bg-gradient-to-br from-sky to-sky-deep text-white' : 'text-gray-600'}`}>
                {EQUIP_META[t].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* hint */}
      <div className="text-center text-[11px] font-medium text-white py-1.5 bg-navy/90">
        {tool === 'move' && 'One finger drags to pan. Pinch to zoom. Tap an item to select.'}
        {tool === 'walls' && 'Tap each corner (snaps to grid + square). Tap the first dot or Finish to close.'}
        {tool === 'wet' && 'Drag one finger to outline the wet area. Pinch to zoom.'}
        {tool === 'equip' && 'Tap to drop the selected equipment. Drag to pan, pinch to zoom.'}
        {tool === 'reading' && 'Tap to drop a moisture reading. Pinch to zoom.'}
      </div>

      {/* toolbar */}
      <nav className="safe-bottom bg-white border-t border-gray-100 flex">
        <Tab t="move" icon={Move} label="Move" />
        <Tab t="walls" icon={Square} label="Room" />
        <Tab t="wet" icon={Droplet} label="Water" />
        <Tab t="equip" icon={Wind} label="Equip" />
        <Tab t="reading" icon={Gauge} label="Reading" />
        <button onClick={() => setShowGrid(v => !v)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${showGrid ? 'text-sky' : 'text-gray-400'}`}>
          <Grid3x3 size={20} /> Grid
        </button>
      </nav>
    </div>
  );
}