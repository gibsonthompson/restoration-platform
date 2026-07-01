import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SceneLayers } from './SceneLayers';
import { MoistureMapEditor } from './MoistureMapEditor';
import { SCENE_SIZE, normalizeScene, type Scene } from './sketchModel';

interface SketchRow { id: string; canvas_json: any; type: string; created_at: string; }

// Sketches tab: list of moisture maps + create/open the full-screen editor.
export function SketchesTab({ roomId, claimId, orgId }:
  { roomId: string; claimId: string; orgId: string }) {
  const [sketches, setSketches] = useState<SketchRow[]>([]);
  const [editing, setEditing] = useState<SketchRow | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const { data } = await supabase.from('resto_sketches')
      .select('id, canvas_json, type, created_at')
      .eq('room_id', roomId).order('created_at', { ascending: false });
    setSketches((data as SketchRow[]) ?? []);
  }
  useEffect(() => { void load(); }, [roomId]);

  async function remove(id: string) {
    if (!confirm('Delete this moisture map?')) return;
    await supabase.from('resto_sketches').delete().eq('id', id);
    await load();
  }

  if (creating || editing) {
    return (
      <MoistureMapEditor
        sketch={editing}
        roomId={roomId} claimId={claimId} orgId={orgId}
        onClose={(saved) => { setCreating(false); setEditing(null); if (saved) void load(); }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setCreating(true)} className="btn-primary w-full py-3">
        <Plus size={16} /> New moisture map
      </button>

      {sketches.length === 0 && <p className="text-gray-400 text-sm px-1">No moisture maps yet.</p>}

      <div className="grid grid-cols-2 gap-3">
        {sketches.map(s => {
          const scene: Scene = normalizeScene(s.canvas_json);
          return (
            <div key={s.id} className="bg-white rounded-2xl shadow-soft overflow-hidden">
              <div className="aspect-square bg-[#F4F7FB]" onClick={() => setEditing(s)}>
                <svg viewBox={`0 0 ${SCENE_SIZE} ${SCENE_SIZE}`} className="w-full h-full">
                  <SceneLayers scene={scene} />
                </svg>
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
                <span className="text-xs font-semibold text-gray-500">{new Date(s.created_at).toLocaleDateString()}</span>
                <button onClick={() => remove(s.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}