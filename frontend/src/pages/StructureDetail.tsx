import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Map, Droplets, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import type { Room, Structure } from '../types/models';

// Mirrors the structure ("Rooms") screen with the Floor Plans / Hydro / Scopes cards.
export default function StructureDetail() {
  const { structureId } = useParams();
  const { activeOrg } = useOrg();
  const [structure, setStructure] = useState<Structure | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);

  async function load() {
    if (!structureId) return;
    const { data: s } = await supabase.from('resto_structures').select('*').eq('id', structureId).single();
    setStructure(s as Structure);
    const { data: r } = await supabase.from('resto_rooms').select('*')
      .eq('structure_id', structureId).order('sort_order');
    setRooms((r as Room[]) ?? []);
  }
  useEffect(() => { void load(); }, [structureId]);

  async function addRoom() {
    if (!activeOrg || !structureId) return;
    const name = prompt('Room name (e.g. Tool Room, Storage Room)');
    if (!name) return;
    await supabase.from('resto_rooms').insert({
      org_id: activeOrg.id, structure_id: structureId, name, sort_order: rooms.length
    });
    void load();
  }

  if (!structure) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="bg-brand-dark text-white p-4 text-xl font-bold">{structure.name}</div>
      <div className="p-4 space-y-3">
        {/* Structure-level feature entry points. Wired to placeholder modules. */}
        <div className="bg-white rounded border p-4 flex items-center gap-3 text-gray-500">
          <Map size={18} className="text-brand" /> Add Floor Plans <span className="ml-auto text-xs">(module: sketch)</span>
        </div>
        <div className="bg-white rounded border p-4 flex items-center gap-3 text-gray-500">
          <Droplets size={18} className="text-brand" /> Hydro: Job Setup <span className="ml-auto text-xs">(module: hydro)</span>
        </div>
        <div className="bg-white rounded border p-4 flex items-center gap-3 text-gray-500">
          <Target size={18} className="text-brand" /> Scopes <span className="ml-auto text-xs">(module: scopes)</span>
        </div>

        <div className="text-sm text-gray-500 pt-2">{rooms.length} Rooms</div>
        <button onClick={addRoom}
                className="w-full bg-brand text-white rounded py-3 font-medium flex items-center justify-center gap-1">
          <Plus size={16} /> Add Room
        </button>
        <div className="grid grid-cols-2 gap-3">
          {rooms.map(r => (
            <Link key={r.id} to={`/rooms/${r.id}`}
                  className="bg-white rounded border p-4 h-24 flex items-end font-medium hover:bg-gray-50">
              {r.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
