import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Package, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { ContentsTab } from '../features/contents/ContentsTab';
import type { ContentsItem } from '../types/models';

interface Structure { id: string; name: string | null }
interface Room { id: string; name: string | null; structure_id: string }

const isLoss = (d?: string | null) => d === 'non_restorable' || d === 'disposed';

export default function ContentsPage() {
  const { claimId } = useParams();
  const nav = useNavigate();
  const { activeOrg } = useOrg();
  const [structures, setStructures] = useState<Structure[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<ContentsItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Summary counts come from a single claim-wide read; the embedded ContentsTab
  // manages its own room data, so we refresh this whenever a room is toggled.
  const loadSummary = useCallback(async () => {
    if (!claimId) return;
    const { data } = await supabase.from('resto_contents_items').select('*').eq('claim_id', claimId);
    setItems((data as ContentsItem[]) ?? []);
  }, [claimId]);

  useEffect(() => {
    (async () => {
      if (!claimId) return;
      const { data: st } = await supabase.from('resto_structures').select('id, name').eq('claim_id', claimId).order('created_at');
      const structs = (st as Structure[]) ?? [];
      setStructures(structs);
      if (structs.length) {
        const { data: rm } = await supabase.from('resto_rooms').select('id, name, structure_id')
          .in('structure_id', structs.map(s => s.id)).order('created_at');
        setRooms((rm as Room[]) ?? []);
      }
      await loadSummary();
      setLoading(false);
    })();
  }, [claimId, loadSummary]);

  function toggle(roomId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId); else next.add(roomId);
      return next;
    });
    void loadSummary(); // keep header counts fresh as items are added
  }

  const lossItems = items.filter(i => isLoss(i.disposition));
  const totalRcv = lossItems.reduce((s, i) => s + (Number(i.replacement_cost) || 0) * (i.quantity || 1), 0);
  const totalAcv = lossItems.reduce((s, i) => s + (Number(i.acv) || 0) * (i.quantity || 1), 0);
  const salvage = items.filter(i => i.disposition === 'restorable').length;
  const countFor = (roomId: string) => items.filter(i => i.room_id === roomId).length;
  const lossFor = (roomId: string) => items.filter(i => i.room_id === roomId && isLoss(i.disposition)).length;

  return (
    <div className="pb-10">
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-5 rounded-b-3xl">
        <button onClick={() => nav(`/claims/${claimId}`)} className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center mb-3 active:scale-95 transition">
          <ChevronLeft size={20} />
        </button>
        <div className="font-display font-bold text-[21px] leading-tight flex items-center gap-2"><Package size={22} /> Contents Inventory</div>
        <div className="opacity-75 text-[13px] font-medium mt-0.5">Tap a room to add or edit its contents</div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-white/10 rounded-2xl p-3"><div className="text-[22px] font-bold leading-none">{items.length}</div><div className="text-[11px] opacity-70 mt-1">items</div></div>
          <div className="bg-white/10 rounded-2xl p-3"><div className="text-[22px] font-bold leading-none">{salvage}</div><div className="text-[11px] opacity-70 mt-1">restorable</div></div>
          <div className="bg-white/10 rounded-2xl p-3"><div className="text-[22px] font-bold leading-none text-red-300">{lossItems.length}</div><div className="text-[11px] opacity-70 mt-1">total loss</div></div>
        </div>
        {lossItems.length > 0 && (
          <div className="bg-white/10 rounded-2xl p-3 mt-2 flex justify-between items-center text-sm">
            <span className="opacity-80 font-medium">Non-salvageable claim</span>
            <span className="font-bold">${totalRcv.toFixed(0)} RCV · ${totalAcv.toFixed(0)} ACV</span>
          </div>
        )}
      </div>

      <div className="px-4 mt-4 space-y-4">
        {loading && <p className="text-gray-400 text-sm">Loading…</p>}
        {!loading && rooms.length === 0 && (
          <p className="text-gray-400 text-sm">This claim has no rooms yet. Add a structure and rooms first, then log contents here.</p>
        )}

        {structures.map(st => {
          const structRooms = rooms.filter(r => r.structure_id === st.id);
          if (!structRooms.length) return null;
          return (
            <div key={st.id}>
              {structures.length > 1 && <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">{st.name || 'Structure'}</div>}
              <div className="space-y-2">
                {structRooms.map(room => {
                  const open = expanded.has(room.id);
                  const count = countFor(room.id);
                  const loss = lossFor(room.id);
                  return (
                    <div key={room.id} className="card !p-0 overflow-hidden">
                      <button onClick={() => toggle(room.id)} className="w-full flex items-center gap-3 p-3.5 text-left active:bg-gray-50 transition">
                        <div className="w-10 h-10 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0">
                          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm truncate">{room.name || 'Room'}</div>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {count === 0 ? 'No items yet' : `${count} item${count === 1 ? '' : 's'}`}{loss > 0 ? ` · ${loss} total loss` : ''}
                          </div>
                        </div>
                        {!open && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-sky bg-sky-soft rounded-lg px-2.5 py-1.5 shrink-0">
                            <Plus size={14} /> Add
                          </span>
                        )}
                      </button>
                      {open && activeOrg && claimId && (
                        <div className="px-3.5 pb-3.5 pt-1 border-t border-gray-100">
                          <ContentsTab roomId={room.id} claimId={claimId} orgId={activeOrg.id} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}