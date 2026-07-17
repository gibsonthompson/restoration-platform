import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Renders a PDF to canvas pages, fit to the container width but CAPPED so a page never
// blows up on a wide screen. On a phone the container is narrow, so pages fill it exactly
// as before. On desktop the container is wide, and without a cap each page rendered at the
// full container width and read as hugely zoomed in; the cap holds a page near its natural
// on-screen size (a US Letter page is about 816px at 100%) and centers it. Reliable on
// mobile (unlike an <iframe>, which iOS renders blank/partial) and never needs horizontal
// scrolling: each page scales to the width and you scroll vertically.
const MAX_PAGE_WIDTH = 820;

export function PdfPreview({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('loading');
      const container = ref.current;
      if (container) container.innerHTML = '';
      try {
        const pdf = await pdfjsLib.getDocument({ url }).promise;
        if (cancelled) return;
        const cw = (container?.clientWidth || 360);
        const targetW = Math.min(cw, MAX_PAGE_WIDTH);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (targetW / base.width) * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = targetW + 'px';
          canvas.style.maxWidth = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          canvas.style.marginBottom = '10px';
          canvas.style.borderRadius = '6px';
          canvas.style.boxShadow = '0 1px 8px rgba(14,42,77,0.12)';
          const ctx = canvas.getContext('2d');
          if (ctx) { await page.render({ canvasContext: ctx, viewport }).promise; }
          if (cancelled) return;
          container?.appendChild(canvas);
          if (i === 1) setStatus('ready');
        }
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div className="w-full">
      {status === 'loading' && <div className="text-center text-gray-400 text-sm py-12">Rendering preview…</div>}
      {status === 'error' && <div className="text-center text-gray-400 text-sm py-12 px-6">Couldn't render the preview here. Use Open or Download below to view the full report.</div>}
      <div ref={ref} className="w-full flex flex-col items-center" />
    </div>
  );
}