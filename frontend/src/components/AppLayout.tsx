import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { BottomNav } from './BottomNav';

// App shell. The navy top bar shows on global screens (claims, search,
// settings). Inside a claim, the page supplies its own navy header, so the
// top bar is hidden to avoid a double header.
export function AppLayout({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  const { pathname } = useLocation();
  const inClaim = /^\/claims\/[0-9a-fA-F-]{36}/.test(pathname);

  return (
    <div className="min-h-screen flex flex-col bg-[#EDF1F6]">
      {!inClaim && (
        <header className="safe-top bg-gradient-to-br from-navy-soft to-navy text-white px-5 py-3.5 flex items-center justify-between">
          <span className="font-display font-extrabold text-[17px]">Restoration Docs</span>
          {activeOrg?.name && (
            <span className="text-xs font-semibold bg-white/20 px-2.5 py-1 rounded-full">{activeOrg.name}</span>
          )}
        </header>
      )}
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomNav />
    </div>
  );
}