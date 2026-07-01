import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { BottomNav } from './BottomNav';

// App shell. On phones it's full-bleed; on wider screens it centers as a
// phone-width column so it always reads as a mobile app. The navy top bar shows
// on global screens; inside a claim the page supplies its own navy header.
export function AppLayout({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  const { pathname } = useLocation();
  const inClaim = /^\/claims\/[0-9a-fA-F-]{36}/.test(pathname);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#EDF1F6] w-full max-w-[480px] mx-auto shadow-[0_0_60px_rgba(14,42,77,0.10)]">
      {!inClaim && (
        <header className="safe-top bg-gradient-to-br from-navy-soft to-navy text-white px-5 pb-4 flex items-center justify-between">
          <span className="font-display font-extrabold text-[18px]">Restoration Docs</span>
          {activeOrg?.name && (
            <span className="text-xs font-semibold bg-white/20 px-2.5 py-1.5 rounded-full">{activeOrg.name}</span>
          )}
        </header>
      )}
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomNav />
    </div>
  );
}