import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { BottomNav } from './BottomNav';
import { Logo } from './Loader';

// App shell. `fixed inset-0` pins the shell to the actual VISIBLE viewport on iOS (above the
// browser toolbar / home indicator), which vh/dvh units size unreliably, and that mis-sizing
// was clipping the bottom nav. Only the content between the header and the pinned nav scrolls.
//
// Two layouts, one shell. Below lg it is the phone-width column exactly as before, with the
// bottom tab bar, so the installed PWA is untouched. At lg and up it becomes a desktop app: a
// fixed left sidebar (the same nav, rendered as a list) and a content region that fills the
// screen but caps its own reading width instead of floating in a narrow strip. Every desktop
// rule is gated behind lg:, so mobile is pixel-identical.
export function AppLayout({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  const { pathname } = useLocation();
  const inClaim = /^\/claims\/(new|[0-9a-fA-F-]{36})/.test(pathname);

  return (
    <div className="fixed inset-0 flex justify-center bg-[#EDF1F6]">
      {/* Desktop sidebar: logo, the nav as a vertical list, and the org name. Hidden on mobile. */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 bg-white border-r border-gray-200">
        <div className="h-16 px-5 flex items-center border-b border-gray-100 shrink-0">
          <Logo className="h-7 w-auto" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <BottomNav variant="sidebar" />
        </div>
        {activeOrg?.name && (
          <div className="px-5 py-3 border-t border-gray-100 text-xs font-semibold text-gray-500 truncate shrink-0">
            {activeOrg.name}
          </div>
        )}
      </aside>

      {/* App column. Phone-width and centered on mobile (unchanged); grows to fill next to the
          sidebar on desktop, dropping the framing shadow. */}
      <div className="w-full max-w-[480px] lg:max-w-none lg:flex-1 lg:min-w-0 h-full flex flex-col overflow-hidden bg-[#EDF1F6] shadow-[0_0_60px_rgba(14,42,77,0.10)] lg:shadow-none">
        {!inClaim && (
          <header className="lg:hidden safe-top bg-gradient-to-br from-navy-soft to-navy text-white px-5 pb-4 flex items-center justify-between shrink-0">
            <Logo variant="white" className="h-7 w-auto" />
            {activeOrg?.name && (
              <span className="text-xs font-semibold bg-white/20 px-2.5 py-1.5 rounded-full">{activeOrg.name}</span>
            )}
          </header>
        )}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-none"
              style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}>
          {/* Desktop caps the reading width and centers it; mobile is a plain full-width wrapper. */}
          <div className="lg:max-w-5xl lg:mx-auto lg:w-full">{children}</div>
        </main>
        {/* Mobile bottom tab bar. Replaced by the sidebar on desktop. */}
        <div className="lg:hidden shrink-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}