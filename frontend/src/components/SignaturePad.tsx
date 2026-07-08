import { useRef, useEffect, useState } from 'react';

// Canvas signature capture. Emits a PNG data URL on each stroke end.
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [, setHas] = useState(false);

  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0E2A4D';
  }, []);

  function pos(e: any): [number, number] {
    const r = ref.current!.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return [t.clientX - r.left, t.clientY - r.top];
  }
  function start(e: any) { e.preventDefault(); drawing.current = true; const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); }
  function move(e: any) { if (!drawing.current) return; e.preventDefault(); const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setHas(true); }
  function end() { if (!drawing.current) return; drawing.current = false; onChange(ref.current!.toDataURL('image/png')); }
  function clear() { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setHas(false); onChange(null); }

  return (
    <div>
      <canvas ref={ref} className="w-full h-40 bg-white border-2 border-dashed border-gray-300 rounded-2xl"
        style={{ touchAction: 'none' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div className="flex justify-between items-center mt-1 px-1">
        <span className="text-xs text-gray-400">Sign above with your finger</span>
        <button onClick={clear} className="text-xs font-semibold text-sky">Clear</button>
      </div>
    </div>
  );
}