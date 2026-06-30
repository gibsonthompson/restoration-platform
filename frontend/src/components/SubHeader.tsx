import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

// Dark context bar used on claim/structure/room pages (back + title + optional sub).
export function SubHeader({ title, subtitle, children }:
  { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="bg-brand-dark text-white px-3 py-3">
      <div className="flex items-center gap-2">
        <button onClick={() => nav(-1)} className="p-1 -ml-1"><ChevronLeft size={22} /></button>
        <div className="min-w-0">
          <div className="font-bold leading-tight truncate">{title}</div>
          {subtitle && <div className="text-xs opacity-80 truncate">{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}