import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

// Custom note composer — replaces the native prompt(). Bottom sheet on mobile,
// centered card on larger screens. Supports create, edit, and delete.
export function NoteSheet({ initial, title = 'Note', placeholder = 'Type your note…', onSave, onDelete, onClose }:
  { initial?: string; title?: string; placeholder?: string; onSave: (body: string) => void; onDelete?: () => void; onClose: () => void }) {
  const [body, setBody] = useState(initial ?? '');
  useEffect(() => { setBody(initial ?? ''); }, [initial]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-navy/30" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-xl p-4"
           style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
        <div className="font-display font-bold text-lg text-navy">{title}</div>
        <textarea autoFocus value={body} onChange={e => setBody(e.target.value)} placeholder={placeholder} rows={5}
          className="w-full border border-gray-200 rounded-2xl px-3.5 py-3 mt-3 text-[16px] leading-relaxed outline-none focus:border-sky resize-none" />
        <div className="flex gap-2 mt-3">
          {onDelete && (
            <button onClick={onDelete} className="px-4 border border-red-200 rounded-xl py-3 font-semibold text-red-600 active:bg-red-50 flex items-center gap-1.5">
              <Trash2 size={16} />
            </button>
          )}
          <button onClick={onClose} className="flex-1 border border-gray-200 rounded-xl py-3 font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
          <button onClick={() => body.trim() && onSave(body.trim())} disabled={!body.trim()}
            className="flex-1 btn-primary py-3 justify-center disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>
  );
}