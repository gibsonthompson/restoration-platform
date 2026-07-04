import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Droplets, ChevronRight, DoorClosed, Map } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { SubHeader } from '../components/SubHeader';
import { NameSheet } from '../components/NameSheet';
import { FloorPlanEditor } from '../features/floorplan/FloorPlanEditor';
import type { Room, Structure } from '../types/models';

const ROOM_SUGGESTIONS = ['Kitchen', 'Living Room', 'Primary Bedroom', 'Bedroom', 'Bathroom', 'Hallway', 'Laundry Room', 'Closet', 'Dining Room', 'Office', 'Garage', 'Utility Room'];

export default function StructureDetail() {
  const { claimId, structureId } = useParams();
  const { activeOrg } = useOrg();
  const [structure, setStructure] = useState<Structure | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [adding, setAdding] = useState(false);
  const [showFloorPlan, setShowFloorPlan] = useState(false);

  async function load() {
    if (!structureId) return;
    const { data: s } = await supabase.from('resto_structures').select('*').eq('id', structureId).single();
    setStructure(s as Structure);
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

  if (!structure) return <div className="p-4 text-gray-400">Loading...</div>;

  if (showFloorPlan) return (
    <FloorPlanEditor
      structureId={structureId!} structureName={structure.name}
      claimId={claimId!} orgId={activeOrg!.id}
      onClose={() => setShowFloorPlan(false)} />
  );

  return (
    <div>
      <SubHeader title={structure.name} subtitle="Rooms" />
      <div className="p-4 space-y-3">
        {/* Structure-level tools */}
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