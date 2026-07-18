import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import {
  FileText, FileSpreadsheet, Download, X, ChevronRight, Trash2, Ruler, Images,
  Loader2, CheckCircle2, FileDown, Share, Map as MapIcon, ClipboardList
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SubHeader } from '../components/SubHeader';
import { PdfPreview } from '../components/PdfPreview';

const API = import.meta.env.VITE_API_URL;

interface Doc {
  id: string; title: string | null; type: string; status: string;
  storage_path: string | null; created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  preliminary_report: 'Preliminary Report', drying_report: 'Drying Report', drying_log: 'Daily Drying Log',
  esx: 'Xactimate Export', schedule_of_loss: 'Schedule of Loss', full_export: 'Full Report', upload: 'Upload',
  measurements: 'Measurements', client_pack: 'Photos & Notes', form: 'Signed Form'
};
const docName = (d: Doc) => d.title || TYPE_LABEL[d.type] || 'Report';

// The name the saved / shared file carries: readable words and spaces, no underscores.
// "&" becomes "and", and only characters a file system actually rejects are removed.
const prettyName = (d: Doc) =>
  docName(d).replace(/&/g, 'and').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Report';

// The Xactimate underlay is a PNG. Everything else we generate is a PDF. The preview and
// the download branch on the STORED file's extension so an image is never handed to the
// PDF viewer (which is what would happen if we keyed off type, since the underlay shares
// the generic 'upload' type with other things).
const isImageDoc = (d: Doc) => /\.(png|jpe?g|gif)$/i.test(d.storage_path || '');

type BusyKey = 'report' | 'measurements' | 'log' | 'pack' | 'underlay' | 'entry' | 'esx';

// Every generator says, in its own words, what it produces and who reads it. Each point
// gets its OWN LINE. A tech deciding which document to build should not have to untangle a
// paragraph, and the old help text ran on and bled into the row beneath it.
const GENERATORS: {
  key: BusyKey; endpoint: string; title: string; icon: any;
  tone: string; lines: string[]; verb: string; primary?: boolean;
}[] = [
  {
    key: 'report', endpoint: 'report', title: 'Full Report', icon: FileText, primary: true,
    tone: 'bg-sky-soft text-sky-deep', verb: 'Building the report',
    lines: [
      'Everything on the claim, in one carrier-ready PDF.',
      'Photos, moisture readings, the drying trend, and the scope.',
      'This is the one you send to the adjuster.'
    ]
  },
  {
    key: 'measurements', endpoint: 'measurements', title: 'Measurement Sheet', icon: Ruler,
    tone: 'bg-aqua-soft text-aqua-deep', verb: 'Measuring every room',
    lines: [
      'Floor, ceiling, perimeter, wall area and baseboard, room by room.',
      'Every door and window is deducted from the wall area.',
      'It shows its arithmetic, so an adjuster can follow each number.'
    ]
  },
  {
    key: 'log', endpoint: 'drying-log', title: 'Daily Drying Log', icon: FileSpreadsheet,
    tone: 'bg-sky-soft text-sky-deep', verb: 'Compiling the drying log',
    lines: [
      'One page per drying chamber, visit by visit.',
      'Readings, equipment on site, and progress toward the dry standard.',
      'Equipment days are the most-scrubbed line on a mitigation invoice.'
    ]
  },
  {
    key: 'pack', endpoint: 'client-pack', title: 'Photos & Notes', icon: Images,
    tone: 'bg-amber-100 text-amber-700', verb: 'Collecting photos and notes',
    lines: [
      'For the homeowner, not the carrier.',
      'Photos and crew notes only.',
      'No scope, no quantities, no codes and no pricing.'
    ]
  },
  {
    key: 'underlay', endpoint: 'underlay', title: 'Xactimate Underlay', icon: MapIcon,
    tone: 'bg-sky-soft text-sky-deep', verb: 'Drawing the floor plan',
    lines: [
      'A to-scale floor plan image to import as a Xactimate Sketch underlay.',
      'Trace over it in Xactimate instead of drawing from a blank grid.',
      'Scale it so the 10 ft bar reads 10 ft, then the plan is dimensionally correct.'
    ]
  },
  {
    key: 'entry', endpoint: 'entry-sheet', title: 'Xactimate Entry Sheet', icon: ClipboardList,
    tone: 'bg-aqua-soft text-aqua-deep', verb: 'Listing the line items',
    lines: [
      'Every line item in Xactimate\'s own codes, grouped by room.',
      'CAT, SEL, quantity and unit, with the F9 note under each line.',
      'A tech keys it straight in. No prices, Xactimate reprices from its own list.'
    ]
  },
  {
    key: 'esx', endpoint: 'esx', title: 'Xactimate Export (.esx)', icon: FileDown,
    tone: 'bg-gray-100 text-gray-600', verb: 'Building the export',
    lines: [
      'Sketch geometry and line items, for import into Xactimate.',
      'Quantities and codes only. Xactimate prices it, we never send a price.',
      'Beta: not proven to import until it is validated against a real .esx.'
    ]
  }
];

// ---------------------------------------------------------------------------
// SUCCESS TOAST
// ---------------------------------------------------------------------------
// A finished document is announced with a floating card, not a full-width bar pinned
// to the very bottom. The old bar sat at bottom-4 + safe-bottom, which is about
// env(safe-area) + 24px up, while the bottom nav's top edge is about env(safe-area) + 55px
// up. The bar therefore landed ~31px behind the nav and its Open / dismiss controls were
// unreachable.
//
// Two things fix it for every device:
//   1. It is PORTALLED to <body>, so no ancestor's overflow:hidden or transform (the app
//      shell locks scrolling with overflow:hidden) can trap or clip a position:fixed child.
//   2. It is anchored at calc(env(safe-area-inset-bottom) + 4.75rem), which clears the nav
//      (about 55px of content above the home indicator) with a comfortable gap on a notched
//      phone, a flat phone, and desktop alike.
//
// It slides up on arrival, auto-dismisses after a few seconds (paused while a finger or the
// cursor is on it), can be swiped down to dismiss on a phone, and is centered with a max
// width so it reads as a card rather than a banner on a wide screen.
function DocToast({ title, onOpen, onClose }: { title: string; onOpen: () => void; onClose: () => void }) {
  const [shown, setShown] = useState(false);   // drives the enter / exit transition
  const [drag, setDrag] = useState(0);          // live swipe-down offset in px
  const startY = useRef<number | null>(null);
  const moved = useRef(false);
  const timer = useRef<number | null>(null);

  const clearTimer = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  const dismiss = () => {
    clearTimer();
    setShown(false);
    window.setTimeout(onClose, 240);            // let the slide-out play before unmount
  };
  const arm = () => { clearTimer(); timer.current = window.setTimeout(dismiss, 6000); };

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));   // enter on next frame
    arm();
    return () => { cancelAnimationFrame(raf); clearTimer(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY; moved.current = false; clearTimer(); };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (Math.abs(dy) > 6) moved.current = true;
    setDrag(Math.max(0, dy));                    // only downward drag counts
  };
  const onTouchEnd = () => {
    if (drag > 60) { dismiss(); } else { setDrag(0); arm(); }
    startY.current = null;
  };

  const cardTap = () => { if (moved.current) { moved.current = false; return; } onOpen(); };

  const dragging = startY.current != null;

  return createPortal(
    <div className="fixed inset-x-0 z-[60] px-3 pointer-events-none"
         style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.75rem)' }}>
      <div
        role="status"
        onClick={cardTap}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onMouseEnter={clearTimer} onMouseLeave={arm}
        className="pointer-events-auto mx-auto max-w-md bg-white rounded-2xl shadow-xl ring-1 ring-navy/5
                   pl-3 pr-2.5 py-2.5 flex items-center gap-3 cursor-pointer select-none"
        style={{
          transform: shown ? `translateY(${drag}px)` : 'translateY(150%)',
          opacity: shown ? Math.max(0, 1 - drag / 150) : 0,
          transition: dragging ? 'none' : 'transform .28s cubic-bezier(.22,1,.36,1), opacity .22s ease'
        }}
      >
        <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0">
          <CheckCircle2 size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-navy leading-tight truncate">{title} is ready</div>
          <div className="text-[12px] text-gray-400 leading-snug">Saved to this claim. Tap to open.</div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onOpen(); }}
                className="btn-primary py-2 px-4 text-[13px] shrink-0">Open</button>
        <button onClick={(e) => { e.stopPropagation(); dismiss(); }} aria-label="Dismiss"
                className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 flex items-center justify-center shrink-0">
          <X size={17} />
        </button>
      </div>
    </div>,
    document.body
  );
}

export default function Documents() {
  const { claimId } = useParams();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState<BusyKey | null>(null);
  const [done, setDone] = useState<BusyKey | null>(null);
  const [toast, setToast] = useState<{ title: string; docId: string } | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [preview, setPreview] = useState<{ doc: Doc; url: string | null; file: File | null; fileName: string; loading: boolean; error: string | null } | null>(null);

  async function load() {
    if (!claimId) return;
    const { data } = await supabase.from('resto_documents')
      .select('id, title, type, status, storage_path, created_at')
      .eq('claim_id', claimId).order('created_at', { ascending: false });
    setDocs((data as Doc[]) ?? []);
    setLoadingList(false);
  }
  useEffect(() => { void load(); }, [claimId]);

  // Every generator route has the same shape: POST { claimId }, build the file, record a
  // resto_documents row, return it. The backend now surfaces a failed row insert as a 500
  // rather than a silent ok:true, so an error here is a real error and not a lie.
  //
  // Success is SHOWN, not implied: the card turns green, the new document is highlighted in
  // the list below, and a toast offers to open it. A button that quietly stops spinning is
  // indistinguishable from a button that did nothing.
  async function generate(g: typeof GENERATORS[number]) {
    if (!claimId) return;
    if (!API) { alert('Report service is not configured. Set VITE_API_URL in Vercel.'); return; }
    setBusy(g.key);
    setDone(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API}/api/resto/${g.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ claimId })
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(json?.error || res.statusText);
      if (!json?.document?.id) throw new Error('the file was built but not recorded');

      await load();
      setDone(g.key);
      setFreshId(json.document.id);
      setToast({ title: g.title, docId: json.document.id });
      setTimeout(() => setDone(null), 2600);
      setTimeout(() => setFreshId(null), 6000);
    } catch (err: any) {
      alert(g.title + ' failed: ' + (err?.message ?? 'unknown error'));
    } finally { setBusy(null); }
  }

  // .esx is a Xactimate ZIP, not a PDF, so download it rather than previewing it.
  async function downloadEsx(d: Doc) {
    if (!d.storage_path) return;
    const { data } = await supabase.storage.from('resto-media')
      .createSignedUrl(d.storage_path, 3600, { download: `${prettyName(d)}.esx` });
    if (data?.signedUrl) window.location.href = data.signedUrl;
  }

  async function deleteDoc(d: Doc) {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    try {
      if (d.storage_path) await supabase.storage.from('resto-media').remove([d.storage_path]);
      await supabase.from('resto_documents').delete().eq('id', d.id);
      await load();
    } catch (e: any) { alert('Could not delete: ' + (e?.message ?? 'unknown')); }
  }

  // Open a document. The file is fetched ONCE, as a blob, and that single blob powers both
  // the on-screen preview and the Save / share button.
  //
  // Why a blob and not a link: on a phone, a plain link to a file is unreliable. Opening it
  // as a top-level navigation gets swallowed by the PWA service worker's offline fallback
  // (it answers navigations with the app shell, which is what bounced you to the homepage),
  // and sharing a mere URL to Messages sends the raw bytes as TEXT, which is the wall of
  // random characters. A fetch() is NOT a navigation, so the service worker ignores it and
  // the file streams cleanly; and handing the native share sheet a real File object shares
  // an actual attachment, so Save to Files, Mail and Messages all get a proper document.
  //
  // The content type follows the stored file. Reports and the entry sheet are PDFs, the
  // Xactimate underlay is a PNG, so both the blob's MIME and the saved filename come from
  // the object's own extension, and the preview renders an image or a PDF accordingly.
  async function openDoc(d: Doc) {
    if (d.type === 'esx') { void downloadEsx(d); return; }
    setPreview({ doc: d, url: null, file: null, fileName: '', loading: true, error: null });
    if (!d.storage_path) { setPreview({ doc: d, url: null, file: null, fileName: '', loading: false, error: 'No file is stored for this document yet.' }); return; }

    // Auth rides in ?t= because a fetch of a cross-tab resource cannot always carry an
    // Authorization header. The backend route validates the token and streams the file, so
    // the Supabase host and its random object name are never exposed.
    const { data: { session } } = await supabase.auth.getSession();
    const t = session?.access_token;
    if (!t) { setPreview({ doc: d, url: null, file: null, fileName: '', loading: false, error: 'Please sign in again.' }); return; }

    const ext = (d.storage_path.split('.').pop() || 'pdf').toLowerCase();
    const outExt = ext === 'jpeg' ? 'jpg' : ext;
    const mime = ext === 'png' ? 'image/png'
      : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
      : ext === 'gif' ? 'image/gif' : 'application/pdf';

    const fileName = `${prettyName(d)}.${outExt}`;
    const slug = prettyName(d).toLowerCase().replace(/[^\w]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'report';
    const src = `${window.location.origin}/api/resto/document/${d.id}/${slug}.${outExt}?t=${encodeURIComponent(t)}`;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`the server returned ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const file = new File([blob], fileName, { type: mime });
      setPreview({ doc: d, url, file, fileName, loading: false, error: null });
    } catch (_e) {
      setPreview({ doc: d, url: null, file: null, fileName, loading: false, error: 'Could not load this document. It may still be generating, or you may be offline. Try again in a moment.' });
    }
  }

  // Blob object URLs must be released or they leak memory for the life of the tab.
  function closePreview() {
    setPreview(p => {
      if (p?.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
      return null;
    });
  }

  // True only where the browser can actually put a FILE into the share sheet (iOS Safari,
  // Android Chrome, and installed PWAs). On a desktop that cannot, we show a plain download.
  const canShareFile = (f: File | null): boolean =>
    !!f && typeof navigator !== 'undefined'
    && typeof (navigator as any).canShare === 'function'
    && (navigator as any).canShare({ files: [f] });

  // Hand the native share sheet the real file. Called straight from the tap with the blob
  // already in hand, so there is no await before share() to burn the user gesture. A user
  // who cancels the sheet is not an error; a genuine failure falls back to a download.
  async function shareFile() {
    const f = preview?.file;
    if (!f) return;
    try {
      await (navigator as any).share({ files: [f], title: preview?.fileName || 'Document' });
    } catch (err: any) {
      if (err && err.name === 'AbortError') return;   // user dismissed the sheet
      if (preview?.url) {
        const a = document.createElement('a');
        a.href = preview.url; a.download = preview.fileName;
        document.body.appendChild(a); a.click(); a.remove();
      }
    }
  }

  function openFromToast() {
    const d = docs.find(x => x.id === toast?.docId);
    setToast(null);
    if (d) void openDoc(d);
  }

  const running = busy !== null;
  const previewIsImage = preview ? isImageDoc(preview.doc) : false;

  return (
    <div className="pb-28">
      <SubHeader title="Documents" />

      <div className="p-4 space-y-4">
        <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-1">Generate</div>

        {GENERATORS.map(g => {
          const isBusy = busy === g.key;
          const isDone = done === g.key;
          return (
            <div key={g.key}
                 className={`card transition ${isDone ? 'ring-2 ring-green-500/50' : ''}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDone ? 'bg-green-50 text-green-600' : g.tone}`}>
                  {isDone ? <CheckCircle2 size={19} /> : <g.icon size={19} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[15px] leading-snug">{g.title}</div>
                  {/* one idea per line, each on its own row, nothing running into the next */}
                  <ul className="mt-1.5 space-y-1">
                    {g.lines.map((l, i) => (
                      <li key={i} className="flex gap-1.5 text-[12px] text-gray-500 leading-snug">
                        <span className="text-gray-300 shrink-0 leading-none pt-[3px]">&bull;</span>
                        <span className="min-w-0">{l}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <button onClick={() => void generate(g)} disabled={running}
                      className={`${g.primary ? 'btn-primary' : 'btn-soft'} w-full py-3 mt-3 justify-center text-sm disabled:opacity-60`}>
                {isBusy
                  ? <><Loader2 size={16} className="animate-spin" /> {g.verb}...</>
                  : isDone
                    ? <><CheckCircle2 size={16} /> Ready</>
                    : <>Generate</>}
              </button>

              {isBusy && (
                <div className="mt-2 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full w-1/3 bg-sky rounded-full animate-pulse" />
                </div>
              )}
            </div>
          );
        })}

        <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider px-1 pt-2">
          {docs.length > 0 ? `${docs.length} Document${docs.length === 1 ? '' : 's'}` : 'Documents'}
        </div>

        {loadingList && (
          <div className="flex items-center gap-2 text-gray-400 text-sm px-1">
            <Loader2 size={15} className="animate-spin" /> Loading documents...
          </div>
        )}

        {!loadingList && docs.length === 0 && (
          <p className="text-gray-400 text-sm px-1 leading-relaxed">
            Nothing generated yet. Build the Full Report when the claim is ready for the carrier.
          </p>
        )}

        {docs.map(d => (
          <div key={d.id} onClick={() => openDoc(d)}
               className={`card w-full flex items-center gap-3 text-left active:scale-[.99] transition cursor-pointer ${d.id === freshId ? 'ring-2 ring-green-500/60' : ''}`}>
            <div className="w-11 h-11 rounded-xl bg-sky-soft text-sky-deep flex items-center justify-center shrink-0">
              {isImageDoc(d) ? <Images size={19} /> : <FileText size={19} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-snug break-words">{docName(d)}</div>
              <div className="text-xs text-gray-400 capitalize mt-0.5">
                {d.status.replace('_', ' ')} &middot; {new Date(d.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
            {d.id === freshId && <span className="chip bg-green-50 text-green-700 shrink-0">New</span>}
            <button onClick={(e) => { e.stopPropagation(); void deleteDoc(d); }}
                    className="text-gray-300 hover:text-red-500 shrink-0 p-1"><Trash2 size={16} /></button>
            <ChevronRight size={18} className="text-gray-300 shrink-0" />
          </div>
        ))}
      </div>

      {/* Success is announced and actionable, above the nav, on a card one tap can open. */}
      {toast && (
        <DocToast
          key={toast.docId}
          title={toast.title}
          onOpen={openFromToast}
          onClose={() => setToast(null)}
        />
      )}

      {preview && createPortal(
        <div className="fixed inset-0 z-[80] bg-white flex flex-col">
          <div className="safe-top px-4 pt-3 pb-2 border-b border-gray-100 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-navy text-sm truncate">{docName(preview.doc)}</div>
              <div className="text-[11px] text-gray-400 capitalize">
                {preview.doc.status.replace('_', ' ')} &middot; {new Date(preview.doc.created_at).toLocaleString()}
              </div>
            </div>
            <button onClick={closePreview}
                    className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><X size={18} /></button>
          </div>

          {preview.loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400 text-sm">
              <Loader2 size={22} className="animate-spin" /> Loading document...
            </div>
          )}
          {preview.error && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
              <FileText size={32} className="text-gray-300" />
              <p className="text-sm text-gray-500">{preview.error}</p>
              <button onClick={() => void openDoc(preview.doc)} className="btn-soft py-2 px-4 text-sm">Try again</button>
            </div>
          )}
          {preview.url && (
            <div className="flex-1 overflow-y-auto px-3 py-3 bg-gray-100">
              {previewIsImage
                ? <img src={preview.url} alt={docName(preview.doc)} className="mx-auto max-w-full h-auto rounded-lg shadow-sm bg-white" />
                : <PdfPreview url={preview.url} />}
            </div>
          )}

          {preview.url && (
            <div className="px-4 pt-3 pb-3 border-t border-gray-100 safe-bottom">
              {canShareFile(preview.file) ? (
                <>
                  <button onClick={() => void shareFile()} className="btn-primary w-full py-3.5 justify-center text-sm">
                    <Share size={17} /> Save or share
                  </button>
                  <p className="text-[11.5px] text-gray-500 text-center mt-2.5 leading-relaxed">
                    Opens the share sheet with the file attached. Save to Files, or send to Mail or Messages.
                  </p>
                </>
              ) : (
                <>
                  <a href={preview.url} download={preview.fileName} className="btn-primary w-full py-3.5 justify-center text-sm">
                    <Download size={17} /> Download {previewIsImage ? 'image' : 'PDF'}
                  </a>
                  <p className="text-[11.5px] text-gray-500 text-center mt-2.5 leading-relaxed">
                    Saves to your downloads.
                  </p>
                </>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}