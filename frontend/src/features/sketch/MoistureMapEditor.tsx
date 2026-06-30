import { useRef, useState } from 'react';
import { X, Undo2, Save, Move, Square, Droplet, MapPin, Grid3x3, Plus, Minus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SceneLayers } from './SceneLayers';
import {
  emptyScene, uid, hitEquipment, SCENE_SIZE, EQUIP_META,
  type Scene, type Pt, type EquipType
} from './sketchModel';

type Tool = 'move' | 'walls' | 'wet' | 'place';
interface ViewBox { x: number; y: number; w: number; h: number; }
interface SketchRow { id: string; canvas_json: any; }

// Full-screen moisture-map editor (mirrors the live app's editor screen).
// Tools: Move (pan + drag/select equipment), Walls (tap corners), Wet (freehand),
// Place (drop equipment). Grid toggle, zoom, undo, save to resto_sketches.
export function MoistureMapEditor({ sketch, roomId, claimId, orgId, onClose }:
  { sketch: SketchRow | null; roomId: string; claimId: string; orgId: string; onClose: (saved: boolean) => void }) {
  const init: Scene = sketch?.canvas_json && sketch.canvas_json.walls
    ? sketch.canvas_json as Scene : emptyScene();

  const [scene, setScene] = useState<Scene>(init);
  const [history, setHistory] = useState<Scene[]>([]);
  const [tool, setTool] = useState<Tool>('move');
  const [placeType, setPlaceType] = useState<EquipType>('air_mover');
  const [showGrid, setShowGrid] = useState(true);
  const [currentWall, setCurrentWall] = useState<Pt[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vb, setVb] = useState<ViewBox>({ x: 0, y: 0, w: SCENE_SIZE, h: SCENE_SIZE });
  const [saving, setSaving] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const ptr = useRef<{ mode: 'pan' | 'drag' | 'wet' | null; lastX: number; lastY: number; dragId?: string; wet: Pt[] }>({
    mode: null, lastX: 0, lastY: 0, wet: []
  });

  function snapshot() { setHistory(h => [...h.slice(-29), scene]); }
  function undo() {
    setHistory(h => {
      if (!h.length) return h;
      setScene(h[h.length - 1]);
      setCurrentWall([]); setSelectedId(null);
      return h.slice(0, -1);
    });
  }

  // screen -> scene coords
  function toScene(clientX: number, clientY: number): Pt {
    const r = svgRef.current!.getBoundingClientRect();
    const px = (clientX - r.left) / r.width;
    const py = (clientY - r.top) / r.height;
    return [vb.x + px * vb.w, vb.y + py * vb.h];
  }

  function onDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const [sx, sy] = toScene(e.clientX, e.clientY);
    ptr.current.lastX = e.clientX; ptr.current.lastY = e.clientY;

    if (tool === 'move') {
      const hit = hitEquipment(scene, sx, sy);
      if (hit) { snapshot(); setSelectedId(hit.id); ptr.current.mode = 'drag'; ptr.current.dragId = hit.id; }
      else { setSelectedId(null); ptr.current.mode = 'pan'; }
    } else if (tool === 'walls') {
      snapshot();
      setCurrentWall(w => [...w, [sx, sy]]);
    } else if (tool === 'wet') {
      ptr.current.mode = 'wet'; ptr.current.wet = [[sx, sy]];
    } else if (tool === 'place') {
      snapshot();
      setScene(s => ({ ...s, equipment: [...s.equipment, { id: uid(), type: placeType, x: sx, y: sy }] }));
    }
  }

  function onMove(e: React.PointerEvent) {
    const m = ptr.current.mode;
    if (!m) return;
    if (m === 'pan') {
      const dx = (e.clientX - ptr.current.lastX) / svgRef.current!.getBoundingClientRect().width * vb.w;
      const dy = (e.clientY - ptr.current.lastY) / svgRef.current!.getBoundingClientRect().height * vb.h;
      setVb(v => ({ ...v, x: v.x - dx, y: v.y - dy }));
      ptr.current.lastX = e.clientX; ptr.current.lastY = e.clientY;
    } else if (m === 'drag' && ptr.current.dragId) {
      const [sx, sy] = toScene(e.clientX, e.clientY);
      setScene(s => ({ ...s, equipment: s.equipment.map(eq => eq.id === ptr.current.dragId ? { ...eq, x: sx, y: sy } : eq) }));
    } else if (m === 'wet') {
      const [sx, sy] = toScene(e.clientX, e.clientY);
      ptr.current.wet.push([sx, sy]);
      setWetPreview([...ptr.current.wet]);
    }
  }

  const [wetPreview, setWetPreview] = useState<Pt[] | null>(null);

  function onUp() {
    const m = ptr.current.mode;
    if (m === 'wet' && ptr.current.wet.length > 2) {
      snapshot();
      const pts = ptr.current.wet;
      setScene(s => ({ ...s, wetAreas: [...s.wetAreas, { id: uid(), points: pts }] }));
    }
    ptr.current.mode = null; ptr.current.dragId = undefined; ptr.current.wet = [];
    setWetPreview(null);
  }

  function finishWall() {
    if (currentWall.length >= 3) {
      const pts = currentWall;
      setScene(s => ({ ...s, walls: [...s.walls, { id: uid(), points: pts }] }));
    }
    setCurrentWall([]);
  }

  function deleteSelected() {
    if (!selectedId) return;
    snapshot();
    setScene(s => ({ ...s, equipment: s.equipment.filter(e => e.id !== selectedId) }));
    setSelectedId(null);
  }

  function zoom(factor: number) {
    setVb(v => {
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      const w = Math.min(SCENE_SIZE * 2, Math.max(150, v.w * factor));
      const h = Math.min(SCENE_SIZE * 2, Math.max(150, v.h * factor));
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    });
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        org_id: orgId, room_id: roomId, type: 'moisture_map',
        canvas_json: scene as any
      };
      if (sketch?.id) await supabase.from('resto_sketches').update({ canvas_json: scene as any }).eq('id', sketch.id);
      else await supabase.from('resto_sketches').insert(payload);
      onClose(true);
    } finally { setSaving(false); }
  }

  const gridLines = showGrid
    ? Array.from({ length: SCENE_SIZE / 50 + 1 }, (_, i) => i * 50)
    : [];

  const ToolBtn = ({ active, onClick, icon: Icon, label }:
    { active?: boolean; onClick: () => void; icon: any; label: string }) => (
    <button onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'text-brand' : 'text-gray-300'}`}>
      <Icon size={20} /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* top bar */}
      <div className="safe-top bg-white border-b flex items-center px-2 py-2 gap-2">
        <button onClick={() => onClose(false)} className="p-1"><X size={22} /></button>
        <div className="flex-1 text-center font-semibold">Moisture Map</div>
        <button onClick={undo} disabled={!history.length} className="p-1 disabled:opacity-30"><Undo2 size={20} /></button>
        <button onClick={save} disabled={saving} className="p-1 text-brand disabled:opacity-50"><Save size={20} /></button>
      </div>

      {/* canvas */}
      <div className="flex-1 relative bg-white overflow-hidden">
        <svg ref={svgRef} className="w-full h-full touch-none"
             viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
             onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {/* grid */}
          {gridLines.map(g => (
            <g key={g} stroke="#dbeafe" strokeWidth={1}>
              <line x1={g} y1={0} x2={g} y2={SCENE_SIZE} />
              <line x1={0} y1={g} x2={SCENE_SIZE} y2={g} />
            </g>
          ))}
          {wetPreview && wetPreview.length > 1 && (
            <polygon points={wetPreview.map(p => `${p[0]},${p[1]}`).join(' ')} fill="#38bdf8" fillOpacity={0.35} stroke="#0284c7" strokeWidth={2} />
          )}
          <SceneLayers scene={scene} currentWall={currentWall} selectedId={selectedId} />
        </svg>

        {/* zoom + contextual buttons */}
        <div className="absolute right-3 bottom-3 flex flex-col gap-2">
          <button onClick={() => zoom(0.8)} className="bg-white border rounded-full w-10 h-10 flex items-center justify-center shadow"><Plus size={18} /></button>
          <button onClick={() => zoom(1.25)} className="bg-white border rounded-full w-10 h-10 flex items-center justify-center shadow"><Minus size={18} /></button>
        </div>

        {tool === 'walls' && currentWall.length >= 3 && (
          <button onClick={finishWall} className="absolute left-3 bottom-3 bg-brand text-white rounded-full px-4 py-2 text-sm font-medium shadow">
            Finish Room
          </button>
        )}
        {tool === 'move' && selectedId && (
          <button onClick={deleteSelected} className="absolute left-3 bottom-3 bg-red-600 text-white rounded-full px-4 py-2 text-sm font-medium shadow flex items-center gap-1">
            <Trash2 size={16} /> Delete
          </button>
        )}
        {tool === 'place' && (
          <div className="absolute left-3 bottom-3 bg-white border rounded-full shadow flex overflow-hidden">
            {(Object.keys(EQUIP_META) as EquipType[]).map(t => (
              <button key={t} onClick={() => setPlaceType(t)}
                className={`px-3 py-2 text-xs font-medium ${placeType === t ? 'bg-brand text-white' : 'text-gray-600'}`}>
                {EQUIP_META[t].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* hint */}
      <div className="text-center text-[11px] py-1 bg-gray-900/80 text-gray-200">
        {tool === 'move' && 'Drag to pan. Tap equipment to select / move.'}
        {tool === 'walls' && 'Tap each corner, then Finish Room.'}
        {tool === 'wet' && 'Drag to outline the wet area.'}
        {tool === 'place' && 'Tap to drop the selected equipment.'}
      </div>

      {/* toolbar */}
      <nav className="safe-bottom bg-gray-900 flex">
        <ToolBtn active={tool === 'move'} onClick={() => setTool('move')} icon={Move} label="Move" />
        <ToolBtn active={tool === 'walls'} onClick={() => setTool('walls')} icon={Square} label="Walls" />
        <ToolBtn active={tool === 'wet'} onClick={() => setTool('wet')} icon={Droplet} label="Wet" />
        <ToolBtn active={tool === 'place'} onClick={() => setTool('place')} icon={MapPin} label="Place" />
        <ToolBtn active={showGrid} onClick={() => setShowGrid(g => !g)} icon={Grid3x3} label="Grid" />
      </nav>
    </div>
  );
}