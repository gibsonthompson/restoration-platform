import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Undo2, Save, Move, Square, Droplet, Grid3x3, Plus, Minus, Trash2, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SceneLayers, EquipIcon } from './SceneLayers';
import {
  normalizeScene, uid, hitEquipment, hitPoint, hitWall, snapGrid, allReadingDates, todayISO, upsertReading, pointDisplay,
  sceneFloorSqFt, suggestEquipment, smoothClosedPath, hitArrow, hitOpening, nearestWallEdge, wallById, ptsStr, OPENING_DEFAULT_FT, SCENE_SIZE, UNITS_PER_FT, EQUIP_META, type Scene, type Pt, type EquipType, type OpeningKind
} from './sketchModel';

type Tool = 'move' | 'room' | 'wet' | 'equip' | 'reading' | 'arrow' | 'door';
type RoomMode = 'rect' | 'poly';
type GKind = 'idle' | 'pan' | 'dragEquip' | 'dragPoint' | 'handle' | 'rect' | 'wet' | 'place' | 'arrow' | 'polyTap';
interface View { tx: number; ty: number; k: number; }
interface SketchRow { id: string; canvas_json: any; }

const PLACE_SET: Tool[] = ['equip', 'reading', 'arrow'];   // grouped under the Place tab
const GRID = 40;            // scene units per grid square (1 ft)
const clampK = (k: number) => Math.min(20, Math.max(0.05, k));
const ftLabel = (u: number) => `${Math.round(u / UNITS_PER_FT)} ft`;
const fmtDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Undated';

// Palette stickers — the same icons that get placed on the map, so a tech sees
// exactly what they're adding. Full names live on the buttons (no abbreviations).
function PlaceGlyph({ kind }: { kind: string }) {
  if (kind === 'air_mover') return (
    <svg width={26} height={26} viewBox="-13 -13 26 26"><circle r={12} fill="#29ABE6" stroke="#1483C2" strokeWidth={1.5} />
      <g transform="scale(0.92)"><circle cx={-0.5} cy={1} r={5.6} fill="#fff" /><path d="M3 -2.4 L8.6 -6 L10.2 -3.3 L4.6 0.3 Z" fill="#fff" /><circle cx={-0.5} cy={1} r={2.15} fill="#29ABE6" /></g></svg>
  );
  if (kind === 'dehumidifier') return (
    <svg width={26} height={26} viewBox="-13 -13 26 26"><circle r={12} fill="#11B5C6" stroke="#0B7C88" strokeWidth={1.5} />
      <rect x={-5} y={-5} width={10} height={10} rx={2} fill="#fff" />
      <path d="M0 -2.6 C1.8 -0.3 2.4 0.7 2.4 1.7 A2.4 2.4 0 1 1 -2.4 1.7 C-2.4 0.7 -1.8 -0.3 0 -2.6 Z" fill="#11B5C6" /></svg>
  );
  if (kind === 'air_scrubber') return (
    <svg width={26} height={26} viewBox="-13 -13 26 26"><circle r={12} fill="#64748B" stroke="#475569" strokeWidth={1.5} />
      <rect x={-5} y={-5} width={10} height={10} rx={2} fill="#fff" />
      <g stroke="#64748B" strokeWidth={1.3} strokeLinecap="round"><line x1={-3} y1={-2.2} x2={3} y2={-2.2} /><line x1={-3} y1={0} x2={3} y2={0} /><line x1={-3} y1={2.2} x2={3} y2={2.2} /></g></svg>
  );
  if (kind === 'reading') return (
    <svg width={26} height={26} viewBox="-13 -13 26 26"><circle r={12} fill="#F26B3A" stroke="#d94f1e" strokeWidth={1.5} />
      <path d="M0 -6 C4 -0.8 5.4 1.2 5.4 3.6 A5.4 5.4 0 1 1 -5.4 3.6 C-5.4 1.2 -4 -0.8 0 -6 Z" fill="#fff" /></svg>
  );
  if (kind === 'arrow') return (
    <svg width={26} height={26} viewBox="-13 -13 26 26"><circle r={12} fill="#4F46E5" stroke="#3730a3" strokeWidth={1.5} />
      <g stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1={-4.5} y1={4.5} x2={4.5} y2={-4.5} /><polyline points="0,-4.5 4.5,-4.5 4.5,0" /></g></svg>
  );
  const tile = (inner: any) => (
    <svg width={26} height={26} viewBox="-13 -13 26 26"><rect x={-12} y={-12} width={24} height={24} rx={7} fill="#EEF2F7" stroke="#cbd5e1" strokeWidth={1.2} />{inner}</svg>
  );
  if (kind === 'door') return tile(<g stroke="#0E2A4D" strokeWidth={1.8} fill="none" strokeLinecap="round"><line x1={-5} y1={6} x2={-5} y2={-6} /><path d="M-5 -6 A11 11 0 0 1 6 5" strokeDasharray="2.2 2.2" /></g>);
  if (kind === 'window') return tile(<g stroke="#0E2A4D" strokeWidth={1.8} strokeLinecap="round"><line x1={-6} y1={0} x2={6} y2={0} /><line x1={-6} y1={-3} x2={-6} y2={3} /><line x1={6} y1={-3} x2={6} y2={3} /></g>);
  return tile(<g stroke="#0E2A4D" strokeWidth={2.6} strokeLinecap="round"><line x1={-7} y1={0} x2={-2.5} y2={0} /><line x1={2.5} y1={0} x2={7} y2={0} /></g>);
}

// Moisture-map editor. Accurate pointer mapping (getScreenCTM), a single camera
// transform, tldraw-style snapping (grid + corners + axis guides at 8px/zoom),
// draggable corner handles, and a magnifier loupe for precise touch placement.
export function MoistureMapEditor({ sketch, roomId, roomName, claimId, orgId, onClose }:
  { sketch: SketchRow | null; roomId: string; roomName?: string; claimId: string; orgId: string; onClose: (saved: boolean) => void }) {
  void claimId;
  const [scene, setScene] = useState<Scene>(() => normalizeScene(sketch?.canvas_json));
  const [history, setHistory] = useState<Scene[]>([]);
  const [tool, setTool] = useState<Tool>('room');
  const [equipType, setEquipType] = useState<EquipType>('air_mover');
  const [doorKind, setDoorKind] = useState<OpeningKind>('door');
  const [roomMode, setRoomMode] = useState<RoomMode>('rect');
  const [lastRoomKey, setLastRoomKey] = useState<string>('rect');
  const [lastPlace, setLastPlace] = useState<Tool>('equip');   // remembers the last Place sub-tool
  const [showGrid, setShowGrid] = useState(true);
  const [activeDate, setActiveDate] = useState<string>(todayISO());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ tx: 0, ty: 0, k: 1 });
  const [draft, setDraft] = useState<{ kind: 'rect'; a: Pt; b: Pt } | { kind: 'wet'; pts: Pt[] } | { kind: 'arrow'; from: Pt; to: Pt } | { kind: 'poly'; pts: Pt[] } | null>(null);
  const [active, setActive] = useState<{ scene: Pt; px: Pt } | null>(null);
  const [guide, setGuide] = useState<{ x?: number; y?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [paletteGhost, setPaletteGhost] = useState<{ kind: string; x: number; y: number; over: boolean } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const inited = useRef(false);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const g = useRef<{ kind: GKind; downPx: Pt; lastPx: Pt; moved: boolean; id?: string; idx?: number; editId?: string; wallTap?: string; downScene?: Pt }>(
    { kind: 'idle', downPx: [0, 0], lastPx: [0, 0], moved: false });
  const pdrag = useRef<{ id: number; kind: string; startX: number; startY: number; dragging: boolean } | null>(null);

  // ---- sizing + initial fit ----
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (inited.current || !size.w || !size.h) return;
    const k = (Math.min(size.w, size.h) * 0.9) / SCENE_SIZE;
    setView({ k, tx: (size.w - SCENE_SIZE * k) / 2, ty: (size.h - SCENE_SIZE * k) / 2 });
    inited.current = true;
  }, [size]);

  // ---- coordinate mapping ----
  function toPixel(cx: number, cy: number): Pt {
    const svg = svgRef.current; const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return [0, 0];
    const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
    const r = p.matrixTransform(ctm.inverse());
    return [r.x, r.y];
  }
  function pxToScene([px, py]: Pt): Pt { const v = viewRef.current; return [(px - v.tx) / v.k, (py - v.ty) / v.k]; }

  // ---- snapping (corners + axis guides + grid, threshold 8px / zoom) ----
  function snapPoint(raw: Pt, exclude?: { id: string; idx: number }): { p: Pt; gx?: number; gy?: number } {
    const thr = 8 / viewRef.current.k;
    // 1) snap onto an existing corner
    let best: Pt | null = null, bd = thr;
    for (const w of scene.walls) for (let i = 0; i < w.points.length; i++) {
      if (exclude && w.id === exclude.id && i === exclude.idx) continue;
      const d = Math.hypot(w.points[i][0] - raw[0], w.points[i][1] - raw[1]);
      if (d < bd) { bd = d; best = w.points[i]; }
    }
    if (best) return { p: [best[0], best[1]], gx: best[0], gy: best[1] };
    // 2) align to a corner's x and/or y (guide lines); grid on the free axis
    let sx = raw[0], sy = raw[1], gx: number | undefined, gy: number | undefined, dx = thr, dy = thr;
    for (const w of scene.walls) for (let i = 0; i < w.points.length; i++) {
      if (exclude && w.id === exclude.id && i === exclude.idx) continue;
      const [cx, cy] = w.points[i];
      if (Math.abs(cx - raw[0]) < dx) { dx = Math.abs(cx - raw[0]); sx = cx; gx = cx; }
      if (Math.abs(cy - raw[1]) < dy) { dy = Math.abs(cy - raw[1]); sy = cy; gy = cy; }
    }
    if (gx === undefined) sx = snapGrid(raw[0], GRID);
    if (gy === undefined) sy = snapGrid(raw[1], GRID);
    return { p: [sx, sy], gx, gy };
  }
  function hitHandle(s: Pt): { id: string; idx: number } | null {
    const r = 18 / viewRef.current.k;
    for (const w of scene.walls) for (let i = 0; i < w.points.length; i++)
      if (Math.hypot(w.points[i][0] - s[0], w.points[i][1] - s[1]) < r) return { id: w.id, idx: i };
    return null;
  }

  function snapshot() { setHistory(h => [...h.slice(-29), scene]); }
  function undo() { setHistory(h => { if (!h.length) return h; setScene(h[h.length - 1]); setSelectedId(null); return h.slice(0, -1); }); }

  // ---- gestures ----
  function onDown(e: React.PointerEvent) {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const pa = toPixel(a.x, a.y), pb = toPixel(b.x, b.y);
      pinch.current = { dist: Math.hypot(pa[0] - pb[0], pa[1] - pb[1]), cx: (pa[0] + pb[0]) / 2, cy: (pa[1] + pb[1]) / 2 };
      g.current.kind = 'idle'; if (draft?.kind !== 'poly') setDraft(null); setActive(null); setGuide(null);
      return;
    }
    const px = toPixel(e.clientX, e.clientY); const s = pxToScene(px);
    g.current.downPx = px; g.current.lastPx = px; g.current.moved = false; g.current.downScene = s;

    if (tool === 'move') {
      const h = hitHandle(s);
      const ep = h ? null : hitEquipment(scene, s[0], s[1]);
      const mp = h || ep ? null : hitPoint(scene, s[0], s[1]);
      if (h) { snapshot(); g.current.kind = 'handle'; g.current.id = h.id; g.current.idx = h.idx; setSelectedId(null); showActive(s, px, { id: h.id, idx: h.idx }); }
      else if (ep) { snapshot(); setSelectedId(ep.id); g.current.kind = 'dragEquip'; g.current.id = ep.id; showActive(s, px); }
      else if (mp) { snapshot(); setSelectedId(mp.id); g.current.kind = 'dragPoint'; g.current.id = mp.id; showActive(s, px); }
      else { const opn = hitOpening(scene, s[0], s[1]); const ar = opn ? null : hitArrow(scene, s[0], s[1]); if (opn) { setSelectedId(opn.id); g.current.kind = 'pan'; } else if (ar) { setSelectedId(ar.id); g.current.kind = 'pan'; } else { const w = hitWall(scene, s[0], s[1]); g.current.wallTap = w?.id; setSelectedId(w?.id ?? null); g.current.kind = 'pan'; } }
    } else if (tool === 'room') {
      if (roomMode === 'poly') { g.current.kind = 'polyTap'; showActive(s, px); }
      else { const { p } = snapPoint(s); g.current.kind = 'rect'; setDraft({ kind: 'rect', a: p, b: p }); showActive(s, px); }
    } else if (tool === 'wet') {
      g.current.kind = 'wet'; setDraft({ kind: 'wet', pts: [s] });
    } else if (tool === 'arrow') {
      const { p } = snapPoint(s); g.current.kind = 'arrow'; setDraft({ kind: 'arrow', from: p, to: p }); showActive(s, px);
    } else {
      g.current.kind = 'place';
      g.current.editId = tool === 'reading' ? hitPoint(scene, s[0], s[1])?.id : undefined;
      showActive(s, px);
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
    const s = pxToScene(px);

    if (g.current.kind === 'pan') { setView(v => ({ ...v, tx: v.tx + dx, ty: v.ty + dy })); }
    else if (g.current.kind === 'rect') { const p = showActive(s, px); setDraft(d => (d && d.kind === 'rect' ? { ...d, b: p } : d)); }
    else if (g.current.kind === 'arrow') { const p = showActive(s, px); setDraft(d => (d && d.kind === 'arrow' ? { ...d, to: p } : d)); }
    else if (g.current.kind === 'handle' && g.current.id != null) {
      const p = showActive(s, px, { id: g.current.id, idx: g.current.idx! }); const id = g.current.id, idx = g.current.idx!;
      setScene(sc => ({ ...sc, walls: sc.walls.map(w => w.id === id ? { ...w, points: w.points.map((q, i) => i === idx ? p : q) } : w) }));
    } else if (g.current.kind === 'dragEquip' && g.current.id) {
      const p = showActive(s, px); const id = g.current.id;
      setScene(sc => ({ ...sc, equipment: sc.equipment.map(q => q.id === id ? { ...q, x: p[0], y: p[1] } : q) }));
    } else if (g.current.kind === 'dragPoint' && g.current.id) {
      const p = showActive(s, px); const id = g.current.id;
      setScene(sc => ({ ...sc, moisturePoints: (sc.moisturePoints ?? []).map(q => q.id === id ? { ...q, x: p[0], y: p[1] } : q) }));
    } else if (g.current.kind === 'place') { showActive(s, px); }
    else if (g.current.kind === 'wet') { setDraft(d => (d && d.kind === 'wet' ? { ...d, pts: [...d.pts, s] } : d)); }
    else if (g.current.kind === 'polyTap') { if (g.current.moved) { g.current.kind = 'pan'; setView(v => ({ ...v, tx: v.tx + dx, ty: v.ty + dy })); } else { showActive(s, px); } }
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
      if (Math.abs(b[0] - a[0]) >= GRID && Math.abs(b[1] - a[1]) >= GRID) {
        snapshot();
        const pts: Pt[] = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
        setScene(sc => ({ ...sc, walls: [...sc.walls, { id: uid(), points: pts }] }));
      }
      setDraft(null);
    } else if (g.current.kind === 'wet' && draft?.kind === 'wet') {
      if (draft.pts.length > 2) { snapshot(); const pts = draft.pts; setScene(sc => ({ ...sc, wetAreas: [...sc.wetAreas, { id: uid(), points: pts }] })); }
      setDraft(null);
    } else if (g.current.kind === 'arrow' && draft?.kind === 'arrow') {
      const { from, to } = draft;
      if (Math.hypot(to[0] - from[0], to[1] - from[1]) >= GRID) { snapshot(); setScene(sc => ({ ...sc, arrows: [...(sc.arrows ?? []), { id: uid(), from, to }] })); }
      setDraft(null);
    } else if (g.current.kind === 'polyTap' && !g.current.moved) {
      const { p } = snapPoint(g.current.downScene!);
      const d = draft;
      if (d?.kind === 'poly' && d.pts.length >= 3 && Math.hypot(p[0] - d.pts[0][0], p[1] - d.pts[0][1]) < 30) {
        snapshot(); const pts = d.pts; setScene(sc => ({ ...sc, walls: [...sc.walls, { id: uid(), points: pts }] })); setDraft(null);
      } else {
        setDraft(d?.kind === 'poly' ? { kind: 'poly', pts: [...d.pts, p] } : { kind: 'poly', pts: [p] });
      }
    } else if (g.current.kind === 'pan' && !g.current.moved && g.current.wallTap) {
      const id = g.current.wallTap;
      const cur = scene.walls.find(w => w.id === id);
      const mat = prompt('Material for this area (e.g. Drywall, Carpet, Subfloor)', cur?.material ?? '');
      if (mat != null) { snapshot(); const m = mat.trim(); setScene(sc => ({ ...sc, walls: sc.walls.map(w => w.id === id ? { ...w, material: m || undefined } : w) })); }
    } else if (g.current.kind === 'place' && active) {
      commitPlace(active.scene, g.current.editId);
    }
    g.current.kind = 'idle'; g.current.id = undefined; g.current.idx = undefined; g.current.editId = undefined; g.current.wallTap = undefined; g.current.downScene = undefined;
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
    setView({ tx, ty, k }); pinch.current = { dist, cx, cy };
  }

  function deleteSelected() {
    if (!selectedId) return; snapshot();
    setScene(sc => ({ ...sc, equipment: sc.equipment.filter(e => e.id !== selectedId), moisturePoints: (sc.moisturePoints ?? []).filter(m => m.id !== selectedId), arrows: (sc.arrows ?? []).filter(a => a.id !== selectedId), openings: (sc.openings ?? []).filter(o => o.id !== selectedId) }));
    setSelectedId(null);
  }
  function closePoly() {
    if (draft?.kind !== 'poly' || draft.pts.length < 3) return;
    snapshot(); const pts = draft.pts;
    setScene(sc => ({ ...sc, walls: [...sc.walls, { id: uid(), points: pts }] }));
    setDraft(null); setActive(null); setGuide(null);
  }
  function undoPolyPoint() {
    setDraft(d => (d?.kind === 'poly' ? (d.pts.length <= 1 ? null : { kind: 'poly', pts: d.pts.slice(0, -1) }) : d));
  }

  // Place the currently-armed item at a scene point (used by canvas taps AND
  // by drag-and-drop from the palette).
  function commitPlace(p: Pt, editId?: string) {
    if (tool === 'equip') {
      snapshot();
      setScene(sc => ({ ...sc, equipment: [...sc.equipment, { id: uid(), type: equipType, x: p[0], y: p[1] }] }));
    } else if (tool === 'door') {
      const near = nearestWallEdge(scene, p[0], p[1]);
      if (near && near.dist < 45 && near.edgeLen > UNITS_PER_FT) {
        const widthFt = OPENING_DEFAULT_FT[doorKind];
        const halfFrac = Math.min(0.45, (widthFt * UNITS_PER_FT / 2) / near.edgeLen);
        const t = Math.max(halfFrac, Math.min(1 - halfFrac, near.t));
        snapshot();
        setScene(sc => ({ ...sc, openings: [...(sc.openings ?? []), { id: uid(), wallId: near.wallId, edge: near.edge, t, widthFt, kind: doorKind }] }));
      }
    } else if (tool === 'reading') {
      const cur = editId ? (scene.moisturePoints ?? []).find(m => m.id === editId) : null;
      const value = prompt(`Reading for ${fmtDate(activeDate)} (e.g. 18%, WET, 45)`, cur ? pointDisplay(cur, activeDate) : '');
      if (value != null && value.trim() !== '') {
        snapshot(); const v = value.trim();
        if (editId) setScene(sc => ({ ...sc, moisturePoints: (sc.moisturePoints ?? []).map(m => m.id === editId ? upsertReading(m, activeDate, v) : m) }));
        else setScene(sc => ({ ...sc, moisturePoints: [...(sc.moisturePoints ?? []), { id: uid(), x: p[0], y: p[1], readings: [{ date: activeDate, value: v }] }] }));
      }
    }
  }

  function pointInWrap(x: number, y: number) {
    const el = wrapRef.current; if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  // --- drag straight out of the palette ---
  function onPaletteDown(e: React.PointerEvent, item: { key: string; droppable: boolean; onSelect: () => void }) {
    item.onSelect();                                  // arm (a plain tap still selects the tool)
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
      const s = pxToScene(toPixel(e.clientX, e.clientY));
      const { p, gx, gy } = snapPoint(s);
      setActive({ scene: p, px: toPixel(e.clientX, e.clientY) });
      setGuide(gx != null || gy != null ? { x: gx, y: gy } : null);
    } else { setActive(null); setGuide(null); }
    setPaletteGhost({ kind: d.kind, x: e.clientX, y: e.clientY, over });
  }
  function onPaletteUp(e: React.PointerEvent) {
    const d = pdrag.current; if (!d || e.pointerId !== d.id) return;
    if (d.dragging && pointInWrap(e.clientX, e.clientY)) {
      const { p } = snapPoint(pxToScene(toPixel(e.clientX, e.clientY)));
      commitPlace(p);
    }
    pdrag.current = null; setPaletteGhost(null); setActive(null); setGuide(null);
  }
  function onPaletteCancel() { pdrag.current = null; setPaletteGhost(null); setActive(null); setGuide(null); }
  function zoomBy(factor: number) {
    const v = viewRef.current; const cx = size.w / 2, cy = size.h / 2;
    const k = clampK(v.k * factor); const f = k / v.k;
    setView({ k, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f });
  }
  function onWheel(e: React.WheelEvent) {
    const v = viewRef.current;
    if (e.ctrlKey || e.metaKey) { const [fx, fy] = toPixel(e.clientX, e.clientY); const k = clampK(v.k * Math.pow(2, -e.deltaY * 0.01)); const f = k / v.k; setView({ k, tx: fx - (fx - v.tx) * f, ty: fy - (fy - v.ty) * f }); }
    else setView({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY });
  }

  async function save() {
    setSaving(true);
    try {
      if (sketch?.id) await supabase.from('resto_sketches').update({ canvas_json: scene as any }).eq('id', sketch.id);
      else await supabase.from('resto_sketches').insert({ org_id: orgId, room_id: roomId, type: 'moisture_map', canvas_json: scene as any });
      onClose(true);
    } finally { setSaving(false); }
  }

  const k = view.k;
  const gridLines = showGrid ? Array.from({ length: Math.floor(SCENE_SIZE / GRID) + 1 }, (_, i) => i * GRID) : [];
  const rectDraft = draft?.kind === 'rect' ? draft : null;
  const rx = rectDraft ? Math.min(rectDraft.a[0], rectDraft.b[0]) : 0, ry = rectDraft ? Math.min(rectDraft.a[1], rectDraft.b[1]) : 0;
  const rw = rectDraft ? Math.abs(rectDraft.b[0] - rectDraft.a[0]) : 0, rh = rectDraft ? Math.abs(rectDraft.b[1] - rectDraft.a[1]) : 0;
  const polyDraft = draft?.kind === 'poly' ? draft : null;
  const drawReadout = rectDraft
    ? `${ftLabel(rw)} \u00d7 ${ftLabel(rh)} \u00b7 ${Math.round((rw * rh) / (UNITS_PER_FT * UNITS_PER_FT))} sq ft`
    : polyDraft ? `${polyDraft.pts.length} corner${polyDraft.pts.length === 1 ? '' : 's'}${polyDraft.pts.length >= 3 ? ' \u00b7 tap first point to close' : ''}` : null;
  const counts = {
    am: scene.equipment.filter(e => e.type === 'air_mover').length,
    dh: scene.equipment.filter(e => e.type === 'dehumidifier').length,
    as: scene.equipment.filter(e => e.type === 'air_scrubber').length,
    mp: (scene.moisturePoints ?? []).length
  };
  const cls = scene.classOfLoss ?? 2;
  const floorSqFt = Math.round(sceneFloorSqFt(scene));
  const sug = suggestEquipment(floorSqFt, cls);

  const isPlace = PLACE_SET.includes(tool);
  const selectTool = (t: Tool) => {
    setTool(t);
    if (PLACE_SET.includes(t)) setLastPlace(t);
    setSelectedId(null); setDraft(null); setActive(null); setGuide(null);
  };

  const activeKey = tool === 'equip' ? equipType : tool === 'door' ? doorKind : tool;
  const PLACE_ITEMS: { key: string; label: string; droppable: boolean; onSelect: () => void }[] = [
    { key: 'air_mover', label: 'Air Mover', droppable: true, onSelect: () => { setEquipType('air_mover'); selectTool('equip'); } },
    { key: 'dehumidifier', label: 'Dehumidifier', droppable: true, onSelect: () => { setEquipType('dehumidifier'); selectTool('equip'); } },
    { key: 'air_scrubber', label: 'Air Scrubber', droppable: true, onSelect: () => { setEquipType('air_scrubber'); selectTool('equip'); } },
    { key: 'reading', label: 'Moisture Reading', droppable: true, onSelect: () => selectTool('reading') },
    { key: 'arrow', label: 'Water Path', droppable: false, onSelect: () => selectTool('arrow') }
  ];

  // Room tab: rectangle/custom shapes + structural openings (doors/windows live on walls).
  const isRoom = tool === 'room' || tool === 'door';
  const ROOM_ITEMS: { key: string; label: string }[] = [
    { key: 'rect', label: 'Rectangle' }, { key: 'poly', label: 'Custom' },
    { key: 'door', label: 'Door' }, { key: 'window', label: 'Window' }, { key: 'opening', label: 'Opening' }
  ];
  const activeRoomKey = tool === 'door' ? doorKind : tool === 'room' ? roomMode : '';
  function pickRoom(key: string) {
    setLastRoomKey(key);
    if (key === 'rect' || key === 'poly') { setRoomMode(key as RoomMode); selectTool('room'); }
    else { setDoorKind(key as OpeningKind); selectTool('door'); }
  }

  // reusable canvas content (drawn in the main view and inside the loupe)
  const content = (
    <>
      {gridLines.map(gp => (
        <g key={gp} stroke="#DCE6F1" vectorEffect="non-scaling-stroke" strokeWidth={1}>
          <line x1={gp} y1={0} x2={gp} y2={SCENE_SIZE} /><line x1={0} y1={gp} x2={SCENE_SIZE} y2={gp} />
        </g>
      ))}
      {guide?.x != null && <line x1={guide.x} y1={0} x2={guide.x} y2={SCENE_SIZE} stroke="#F26B3A" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="5 4" />}
      {guide?.y != null && <line x1={0} y1={guide.y} x2={SCENE_SIZE} y2={guide.y} stroke="#F26B3A" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="5 4" />}
      {draft?.kind === 'wet' && draft.pts.length > 1 && (
        <path d={smoothClosedPath(draft.pts)} fill="#7DD3FC" fillOpacity={0.4} stroke="#0284c7" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      )}
      {rectDraft && (
        <>
          <rect x={rx} y={ry} width={rw} height={rh} fill="#0E2A4D" fillOpacity={0.05} stroke="#1483C2" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="6 4" />
          {/* fixed anchor at the first corner */}
          <circle cx={rectDraft.a[0]} cy={rectDraft.a[1]} r={9 / k} fill="#1483C2" stroke="#fff" strokeWidth={2.5 / k} />
          {/* dimensions OUTSIDE the shape so a finger never covers them */}
          {rw > 0 && (
            <text x={rx + rw / 2} y={ry - 26 / k} textAnchor="middle" fontSize={13 / k} fontWeight={800} fill="#0E2A4D" stroke="#fff" strokeWidth={4 / k} paintOrder="stroke">{ftLabel(rw)}</text>
          )}
          {rh > 0 && (
            <text x={rx - 26 / k} y={ry + rh / 2} textAnchor="middle" fontSize={13 / k} fontWeight={800} fill="#0E2A4D" stroke="#fff" strokeWidth={4 / k} paintOrder="stroke" transform={`rotate(-90 ${rx - 26 / k} ${ry + rh / 2})`}>{ftLabel(rh)}</text>
          )}
        </>
      )}
      {polyDraft && (
        <g>
          <polyline points={ptsStr(polyDraft.pts)} fill="none" stroke="#1483C2" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeDasharray="7 5" />
          {polyDraft.pts.slice(1).map((pt, i) => {
            const a = polyDraft.pts[i]; const mid: Pt = [(a[0] + pt[0]) / 2, (a[1] + pt[1]) / 2];
            const len = Math.hypot(pt[0] - a[0], pt[1] - a[1]);
            return <text key={i} x={mid[0]} y={mid[1]} textAnchor="middle" dominantBaseline="central" fontSize={12 / k} fontWeight={700} fill="#0E2A4D" stroke="#fff" strokeWidth={4 / k} paintOrder="stroke">{ftLabel(len)}</text>;
          })}
          {polyDraft.pts.map((pt, i) => (
            <circle key={i} cx={pt[0]} cy={pt[1]} r={(i === 0 ? 9 : 6) / k} fill={i === 0 ? '#1483C2' : '#fff'} stroke="#1483C2" strokeWidth={2.5 / k} />
          ))}
        </g>
      )}
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
      <SceneLayers scene={scene} selectedId={selectedId} activeDate={activeDate} />

      {/* Drag ghost: a translucent preview of exactly what will be placed, where. */}
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
                     stroke="#1483C2" strokeWidth={12} strokeLinecap="round" opacity={0.6} style={{ pointerEvents: 'none' }} />;
      })()}
    </>
  );

  const Tab = ({ t, icon: Icon, label }: { t: Tool; icon: any; label: string }) => (
    <button onClick={() => selectTool(t)}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${tool === t ? 'text-sky' : 'text-gray-400'}`}>
      <Icon size={20} strokeWidth={tool === t ? 2.6 : 2} /> {label}
    </button>
  );

  // loupe geometry (screen/pixel space)
  const R = 54;
  const lx = active ? active.px[0] : 0;
  let ly = active ? active.px[1] - 96 : 0;
  if (active && ly < R + 10) ly = active.px[1] + 96;
  const lk = k * 2.4;

  return (
    <div className="fixed inset-0 z-50 bg-[#F4F7FB] flex flex-col select-none">
      <div className="safe-top bg-white border-b border-gray-100 flex items-center px-2 pb-2 gap-1">
        <button onClick={() => onClose(false)} className="p-2 rounded-xl active:bg-gray-100"><X size={22} /></button>
        <div className="flex-1 text-center px-1 min-w-0">
          <div className="font-display font-bold text-[15px] truncate">{roomName || 'Moisture Map'}</div>
          {roomName && <div className="text-[10px] font-semibold text-gray-400 -mt-0.5">Moisture Map</div>}
        </div>
        <button onClick={() => setShowGrid(v => !v)} className={`p-2 rounded-xl active:bg-gray-100 ${showGrid ? 'text-sky' : 'text-gray-400'}`}><Grid3x3 size={20} /></button>
        <button onClick={undo} disabled={!history.length} className="p-2 rounded-xl active:bg-gray-100 disabled:opacity-30"><Undo2 size={20} /></button>
        <button onClick={save} disabled={saving} className="ml-1 btn-primary py-2 px-4 text-sm disabled:opacity-50"><Save size={16} /> Save</button>
      </div>

      <div className="flex gap-2 px-3 py-2 bg-white/70 text-[11px] font-semibold overflow-x-auto">
        <span className="chip bg-sky-soft text-sky-deep">Air Movers {counts.am}</span>
        <span className="chip bg-aqua-soft text-aqua-deep">Dehumidifiers {counts.dh}</span>
        <span className="chip bg-slate-100 text-slate-600">Air Scrubbers {counts.as}</span>
        <span className="chip bg-coral-soft text-coral-deep">Readings {counts.mp}</span>
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
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 shrink-0">Class</span>
        {[1, 2, 3, 4].map(c => (
          <button key={c} onClick={() => setScene(sc => ({ ...sc, classOfLoss: c }))}
            className={`shrink-0 w-6 h-6 rounded-full text-[11px] font-bold ${c === cls ? 'bg-gradient-to-br from-sky to-sky-deep text-white' : 'bg-gray-100 text-gray-500'}`}>{c}</button>
        ))}
        {floorSqFt > 0 && <span className="shrink-0 text-gray-400 font-semibold ml-1">{floorSqFt} sq ft</span>}
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
          <g transform={`translate(${view.tx} ${view.ty}) scale(${k})`}>
            {content}
            {tool === 'move' && scene.walls.flatMap(w => w.points.map((pt, i) => (
              <circle key={w.id + '-' + i} cx={pt[0]} cy={pt[1]} r={7 / k} fill="#fff" stroke="#0E2A4D" strokeWidth={2 / k} />
            )))}
          </g>

          {active && (
            <>
              <defs><clipPath id="loupeClip"><circle cx={lx} cy={ly} r={R} /></clipPath></defs>
              <g clipPath="url(#loupeClip)">
                <rect x={lx - R} y={ly - R} width={R * 2} height={R * 2} fill="#F4F7FB" />
                <g transform={`translate(${lx} ${ly}) scale(${lk}) translate(${-active.scene[0]} ${-active.scene[1]})`}>{content}</g>
                <line x1={lx - 12} y1={ly} x2={lx + 12} y2={ly} stroke="#F26B3A" strokeWidth={1.5} />
                <line x1={lx} y1={ly - 12} x2={lx} y2={ly + 12} stroke="#F26B3A" strokeWidth={1.5} />
              </g>
              <circle cx={lx} cy={ly} r={R} fill="none" stroke="#0E2A4D" strokeWidth={3} />
            </>
          )}
        </svg>

        {drawReadout && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-navy/90 text-white text-[12px] font-bold px-3.5 py-1.5 rounded-full pointer-events-none z-10 whitespace-nowrap">
            {drawReadout}
          </div>
        )}

        <div className="absolute right-3 bottom-3 flex flex-col gap-2">
          <button onClick={() => zoomBy(1.25)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Plus size={18} /></button>
          <button onClick={() => zoomBy(0.8)} className="bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-soft active:scale-95"><Minus size={18} /></button>
        </div>

        {tool === 'move' && selectedId && (
          <button onClick={deleteSelected} className="absolute left-3 bottom-3 bg-red-600 text-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft flex items-center gap-1.5 active:scale-95"><Trash2 size={16} /> Delete</button>
        )}
        {polyDraft && (
          <div className="absolute left-3 bottom-3 flex gap-2">
            <button onClick={undoPolyPoint} className="bg-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft active:scale-95">Undo point</button>
            {polyDraft.pts.length >= 3 && (
              <button onClick={closePoly} className="bg-gradient-to-br from-sky to-sky-deep text-white rounded-full px-4 py-2.5 text-sm font-bold shadow-soft active:scale-95">Close shape</button>
            )}
          </div>
        )}
      </div>

      {isRoom && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-t border-gray-100 overflow-x-auto">
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 shrink-0">Room</span>
          <div className="flex bg-gray-100 rounded-full p-0.5 shrink-0">
            {ROOM_ITEMS.map(it => (
              <button key={it.key} onClick={() => pickRoom(it.key)} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${activeRoomKey === it.key ? 'bg-white shadow-sm text-sky' : 'text-gray-500'}`}>{it.label}</button>
            ))}
          </div>
        </div>
      )}

      {isPlace && (
        <div className="flex gap-2 px-3 py-2 bg-white border-t border-gray-100 overflow-x-auto">
          {PLACE_ITEMS.map(it => {
            const on = activeKey === it.key;
            return (
              <button key={it.key}
                onPointerDown={e => onPaletteDown(e, it)} onPointerMove={onPaletteMove}
                onPointerUp={onPaletteUp} onPointerCancel={onPaletteCancel}
                style={{ touchAction: 'pan-x' }}
                className={`shrink-0 w-[74px] flex flex-col items-center gap-1 py-1.5 rounded-2xl ${on ? 'bg-sky-soft ring-1 ring-sky/40' : 'active:bg-gray-50'}`}>
                <PlaceGlyph kind={it.key} />
                <span className={`text-[10.5px] font-semibold leading-tight text-center ${on ? 'text-sky-deep' : 'text-gray-500'}`}>{it.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="text-center text-[11px] font-medium text-white py-1.5 bg-navy/90">
        {tool === 'move' && 'Drag a corner to reshape. Drag items to move. Tap a room to label its material.'}
        {tool === 'room' && (roomMode === 'poly' ? 'Tap each corner. Tap the first point or Close to finish. Two fingers to pan and zoom.' : 'Drag a box from the anchor corner. Snaps to grid and existing corners.')}
        {tool === 'wet' && 'Drag to outline the wet area. Two fingers to pan and zoom.'}
        {tool === 'equip' && 'Drag onto the map. The preview shows where it lands, release to drop.'}
        {tool === 'reading' && `Reading for ${fmtDate(activeDate)}. Press empty space for a new point, or a pin to update it.`}
        {tool === 'arrow' && 'Drag from the water source toward where it traveled.'}
        {tool === 'door' && `Drag along a wall to position the ${doorKind}. The highlight shows where it attaches.`}
      </div>

      <nav className="safe-bottom bg-white border-t border-gray-100 flex">
        <Tab t="move" icon={Move} label="Move" />
        <button onClick={() => pickRoom(lastRoomKey)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isRoom ? 'text-sky' : 'text-gray-400'}`}>
          <Square size={20} strokeWidth={isRoom ? 2.6 : 2} /> Room
        </button>
        <Tab t="wet" icon={Droplet} label="Water" />
        <button onClick={() => selectTool(lastPlace)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isPlace ? 'text-sky' : 'text-gray-400'}`}>
          <MapPin size={20} strokeWidth={isPlace ? 2.6 : 2} /> Place
        </button>
      </nav>

      {paletteGhost && !paletteGhost.over && (
        <div className="fixed z-[60] pointer-events-none -translate-x-1/2 -translate-y-1/2 opacity-80 drop-shadow-lg"
             style={{ left: paletteGhost.x, top: paletteGhost.y }}>
          <PlaceGlyph kind={paletteGhost.kind} />
        </div>
      )}
    </div>
  );
}