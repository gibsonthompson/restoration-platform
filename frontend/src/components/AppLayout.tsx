import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { BottomNav } from './BottomNav';

// App shell. Fixed viewport height so the header and bottom nav stay put and
// only the content scrolls (native app feel). Centers as a phone-width column on
// wider screens. The navy top bar shows on global screens; inside a claim the
// page supplies its own navy header.
export function AppLayout({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  const { pathname } = useLocation();
  const inClaim = /^\/claims\/(new|[0-9a-fA-F-]{36})/.test(pathname);

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-[#EDF1F6] w-full max-w-[480px] mx-auto shadow-[0_0_60px_rgba(14,42,77,0.10)]">
      {!inClaim && (
        <header className="safe-top bg-gradient-to-br from-navy-soft to-navy text-white px-5 pb-4 flex items-center justify-between shrink-0">
          <span className="font-display font-extrabold text-[18px]">Restoration Docs</span>
          {activeOrg?.name && (
            <span className="text-xs font-semibold bg-white/20 px-2.5 py-1.5 rounded-full">{activeOrg.name}</span>
          )}
        </header>
      )}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-none"
            style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}>{children}</main>
      <BottomNav />
    </div>
  );
}