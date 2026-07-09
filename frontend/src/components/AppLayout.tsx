import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { BottomNav } from './BottomNav';

// App shell. `fixed inset-0` pins the shell to the actual VISIBLE viewport on
// iOS (above the browser toolbar/home indicator), which vh/dvh units size
// unreliably — that mis-sizing was clipping the bottom nav. Centers as a
// phone-width column on wider screens; only the content between the header and
// the pinned bottom nav scrolls.
export function AppLayout({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  const { pathname } = useLocation();
  const inClaim = /^\/claims\/(new|[0-9a-fA-F-]{36})/.test(pathname);

  return (
    <div className="fixed inset-0 flex justify-center bg-[#EDF1F6]">
      <div className="w-full max-w-[480px] h-full flex flex-col overflow-hidden bg-[#EDF1F6] shadow-[0_0_60px_rgba(14,42,77,0.10)]">
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
    </div>
  );
}