import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

// Navy context bar with a soft rounded bottom (claim/structure/room pages).
export function SubHeader({ title, subtitle, children }:
  { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-4 rounded-b-3xl">
      <button onClick={() => nav(-1)}
              className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center mb-3 active:scale-95 transition">
        <ChevronLeft size={20} />
      </button>
      <div className="font-display font-bold text-xl leading-tight">{title}</div>
      {subtitle && <div className="text-[13px] opacity-75 font-medium mt-0.5">{subtitle}</div>}
      {children}
    </div>
  );
}