import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Droplets, ChevronRight, DoorClosed, Map, Ruler, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { SubHeader } from '../components/SubHeader';
import { NameSheet } from '../components/NameSheet';
import { FloorPlanEditor } from '../features/floorplan/FloorPlanEditor';
import type { Room, Structure } from '../types/models';

const ROOM_SUGGESTIONS = ['Kitchen', 'Living Room', 'Primary Bedroom', 'Bedroom', 'Bathroom', 'Hallway', 'Laundry Room', 'Closet', 'Dining Room', 'Office', 'Garage', 'Utility Room'];

// The migration added resto_structures.default_ceiling_height_ft. Widen the row type
// locally rather than editing types/models.ts blind, so this compiles whether or not
// the shared Structure interface already carries the field.
type StructureRow = Structure & { default_ceiling_height_ft?: number | null };

const CEILING_PRESETS = [8, 9, 10];

export default function StructureDetail() {
  const { claimId, structureId } = useParams();
  const { activeOrg } = useOrg();
  const [structure, setStructure] = useState<StructureRow | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [adding, setAdding] = useState(false);
  const [showFloorPlan, setShowFloorPlan] = useState(false);
  const [ceiling, setCeiling] = useState('');
  const [savingCeiling, setSavingCeiling] = useState(false);
  const [ceilingSaved, setCeilingSaved] = useState(false);

  async function load() {
    if (!structureId) return;
    const { data: s } = await supabase.from('resto_structures').select('*').eq('id', structureId).single();
    const row = s as StructureRow;
    setStructure(row);
    setCeiling(row?.default_ceiling_height_ft != null ? String(row.default_ceiling_height_ft) : '');
    const { data: r } = await supabase.from('resto_rooms').select('*')
      .eq('structure_id', structureId).order('sort_order');
    setRooms((r as Room[]) ?? []);
  }
  useEffect(() => { void load(); }, [structureId]);

  async function createRoom(name: string) {
    if (!activeOrg || !structureId) return;
    await supabase.from('resto_rooms').insert({
      org_id: activeOrg.id, structure_id: structureId, name, sort_order: rooms.length
    });
    setAdding(false); void load();
  }

  // Every room in this structure inherits this height unless its own sketch overrides
  // it, and wall square footage is (perimeter x height) minus the openings. A wrong
  // number here is a wrong number on every wall line in the estimate, so it is stored
  // as decimal feet and validated, never guessed.
  async function saveCeiling(raw: string) {
    if (!structureId) return;
    const text = raw.trim();
    const value = text === '' ? null : Number(text);
    if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 30)) {
      alert('Enter a ceiling height in feet, between 1 and 30. Use a decimal for inches: 7 ft 8 in is 7.67.');
      return;
    }
    const current = structure?.default_ceiling_height_ft ?? null;
    if (value === current) return;

    setSavingCeiling(true);
    try {
      const { error } = await supabase.from('resto_structures')
        .update({ default_ceiling_height_ft: value }).eq('id', structureId);
      if (error) { alert('Could not save the ceiling height: ' + error.message); return; }
      setStructure(s => (s ? { ...s, default_ceiling_height_ft: value } : s));
      setCeiling(value == null ? '' : String(value));
      setCeilingSaved(true);
      setTimeout(() => setCeilingSaved(false), 2000);
    } finally { setSavingCeiling(false); }
  }

  if (!structure) return <div className="p-4 text-gray-400">Loading...</div>;

  if (showFloorPlan) return (
    <FloorPlanEditor
      structureId={structureId!} structureName={structure.name}
      claimId={claimId!} orgId={activeOrg!.id}
      onClose={() => setShowFloorPlan(false)} />
  );

  const set = structure.default_ceiling_height_ft;

  return (
    <div>
      <SubHeader title={structure.name} subtitle="Rooms" />
      <div className="p-4 space-y-3">
        {/* Structure-level tools */}
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-aqua-soft text-aqua-deep flex items-center justify-center shrink-0">
              <Ruler size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[15px] flex items-center gap-1.5">
                Ceiling height
                {ceilingSaved && <Check size={14} className="text-green-600" />}
              </div>
              <div className="text-[12px] text-gray-400">Default for every room on this level</div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1">
              <input
                type="number" inputMode="decimal" step="0.25" min="1" max="30"
                value={ceiling}
                onChange={e => setCeiling(e.target.value)}
                onBlur={e => void saveCeiling(e.target.value)}
                placeholder="8"
                disabled={savingCeiling}
                className="w-full border border-gray-200 rounded-xl pl-3.5 pr-9 py-2.5 text-[16px] outline-none focus:border-sky disabled:opacity-60" />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">ft</span>
            </div>
            {CEILING_PRESETS.map(p => (
              <button key={p} onClick={() => void saveCeiling(String(p))} disabled={savingCeiling}
                      className={`px-3 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-60 ${set === p ? 'bg-sky text-white' : 'bg-gray-100 text-gray-600'}`}>
                {p}'
              </button>
            ))}
          </div>

          <p className="text-[11px] text-gray-400 mt-2 leading-snug">
            Wall area is perimeter times this height, minus every door and window. Type a decimal for part-feet: 7 ft 8 in is 7.67. A room can override it in its own sketch.
          </p>
          {set == null && (
            <p className="text-[11px] text-amber-600 font-semibold mt-1.5 leading-snug">
              Not set. Rooms with no height of their own will fall back to an assumption, and an assumed height gets flagged on the measurement sheet.
            </p>
          )}
        </div>

        <button onClick={() => setShowFloorPlan(true)}
                className="card w-full flex items-center gap-3 active:scale-[.99] transition text-left">
          <div className="w-10 h-10 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0">
            <Map size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-[15px]">Floor plan</div>
            <div className="text-[12px] text-gray-400">Assemble room sketches into a building layout</div>
          </div>
          <ChevronRight size={18} className="ml-auto text-gray-300 shrink-0" />
        </button>

        <Link to={`/claims/${claimId}/structures/${structureId}/hydro`}
              className="card flex items-center gap-3 active:scale-[.99] transition">
          <div className="w-10 h-10 rounded-xl bg-aqua-soft text-aqua-deep flex items-center justify-center shrink-0">
            <Droplets size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-[15px]">Hydro: Job Setup</div>
            <div className="text-[12px] text-gray-400">Chambers, dry standards, daily readings</div>
          </div>
          <ChevronRight size={18} className="ml-auto text-gray-300 shrink-0" />
        </Link>

        <button onClick={() => setAdding(true)} className="btn-primary w-full py-3.5">
          <Plus size={18} /> Add room
        </button>

        <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-1 pt-1">
          {rooms.length} {rooms.length === 1 ? 'Room' : 'Rooms'}
        </div>

        {rooms.length === 0 && (
          <p className="text-gray-400 text-sm px-1">No rooms yet. Add the rooms you're documenting in this structure.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {rooms.map(r => (
            <Link key={r.id} to={`/claims/${claimId}/structures/${structureId}/rooms/${r.id}`}
                  className="card h-24 flex flex-col justify-between active:scale-[.99] transition">
              <div className="w-9 h-9 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center">
                <DoorClosed size={17} />
              </div>
              <div className="font-bold text-[14px] leading-tight truncate">{r.name}</div>
            </Link>
          ))}
        </div>
      </div>

      {adding && (
        <NameSheet title="Add room" subtitle="Pick a room type, or type your own."
          placeholder="Room name" suggestions={ROOM_SUGGESTIONS} existing={rooms.map(r => r.name)}
          onCancel={() => setAdding(false)} onSubmit={createRoom} />
      )}
    </div>
  );
}