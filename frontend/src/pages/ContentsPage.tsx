import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Package, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ContentsItem } from '../types/models';

interface RoomRow { id: string; name: string | null; structure_id: string }

const DISP_META: Record<string, { label: string; cls: string }> = {
  restorable: { label: 'Restorable', cls: 'bg-green-100 text-green-700' },
  non_restorable: { label: 'Total loss', cls: 'bg-red-100 text-red-700' },
  disposed: { label: 'Disposed', cls: 'bg-gray-200 text-gray-600' }
};
const isLoss = (d?: string | null) => d === 'non_restorable' || d === 'disposed';

export default function ContentsPage() {
  const { claimId } = useParams();
  const nav = useNavigate();
  const [items, setItems] = useState<ContentsItem[]>([]);
  const [rooms, setRooms] = useState<Record<string, RoomRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!claimId) return;
      const { data: ci } = await supabase.from('resto_contents_items').select('*')
        .eq('claim_id', claimId).order('created_at', { ascending: false });
      const rows = (ci as ContentsItem[]) ?? [];
      setItems(rows);
      const roomIds = [...new Set(rows.map(r => r.room_id).filter(Boolean))];
      if (roomIds.length) {
        const { data: rm } = await supabase.from('resto_rooms').select('id, name, structure_id').in('id', roomIds as string[]);
        const map: Record<string, RoomRow> = {};
        (rm as RoomRow[] ?? []).forEach(r => { map[r.id] = r; });
        setRooms(map);
      }
      setLoading(false);
    })();
  }, [claimId]);

  const lossItems = items.filter(i => isLoss(i.disposition));
  const totalRcv = lossItems.reduce((s, i) => s + (Number(i.replacement_cost) || 0) * (i.quantity || 1), 0);
  const totalAcv = lossItems.reduce((s, i) => s + (Number(i.acv) || 0) * (i.quantity || 1), 0);
  const salvage = items.filter(i => i.disposition === 'restorable').length;

  // group by room
  const byRoom: Record<string, ContentsItem[]> = {};
  for (const it of items) { const k = it.room_id ?? 'none'; (byRoom[k] ??= []).push(it); }

  return (
    <div className="pb-10">
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-5 rounded-b-3xl">
        <button onClick={() => nav(`/claims/${claimId}`)} className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center mb-3 active:scale-95 transition">
          <ChevronLeft size={20} />
        </button>
        <div className="font-display font-bold text-[21px] leading-tight flex items-center gap-2"><Package size={22} /> Contents Inventory</div>
        <div className="opacity-75 text-[13px] font-medium mt-0.5">Personal property (Coverage C)</div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-white/10 rounded-2xl p-3">
            <div className="text-[22px] font-bold leading-none">{items.length}</div>
            <div className="text-[11px] opacity-70 mt-1">items</div>
          </div>
          <div className="bg-white/10 rounded-2xl p-3">
            <div className="text-[22px] font-bold leading-none">{salvage}</div>
            <div className="text-[11px] opacity-70 mt-1">restorable</div>
          </div>
          <div className="bg-white/10 rounded-2xl p-3">
            <div className="text-[22px] font-bold leading-none text-red-300">{lossItems.length}</div>
            <div className="text-[11px] opacity-70 mt-1">total loss</div>
          </div>
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
        {!loading && items.length === 0 && (
          <p className="text-gray-400 text-sm">No contents logged yet. Open a room and use its Contents tab to inventory personal property.</p>
        )}

        {Object.entries(byRoom).map(([roomId, list]) => {
          const room = rooms[roomId];
          const goToRoom = room ? () => nav(`/claims/${claimId}/structures/${room.structure_id}/rooms/${room.id}`) : undefined;
          return (
            <div key={roomId}>
              <button onClick={goToRoom} disabled={!goToRoom}
                className="w-full flex items-center justify-between mb-2 text-left">
                <span className="font-bold text-navy">{room?.name ?? 'Unassigned room'}</span>
                {goToRoom && <span className="text-xs text-sky font-semibold flex items-center">Open room <ChevronRight size={14} /></span>}
              </button>
              <div className="space-y-2">
                {list.map(it => {
                  const disp = DISP_META[it.disposition ?? 'restorable'];
                  return (
                    <div key={it.id} className="card flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{it.description ?? 'Untitled item'}</div>
                        <div className="text-xs text-gray-400 font-medium truncate mt-0.5">
                          {[it.category, [it.brand, it.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || '—'} · Qty {it.quantity ?? 1}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {disp && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${disp.cls}`}>{disp.label}</span>}
                        {isLoss(it.disposition) && it.replacement_cost != null && (
                          <div className="text-xs font-semibold text-gray-600 mt-1">${Number(it.replacement_cost).toFixed(0)}</div>
                        )}
                      </div>
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