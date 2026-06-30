import type { ReactNode } from 'react';
import { useOrg } from '../context/OrgContext';
import { BottomNav } from './BottomNav';

// App shell: thin top bar + scrollable content + depth-aware bottom nav.
// Page-specific headers (the dark claim/structure/room bars) live in the pages.
export function AppLayout({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="safe-top bg-brand text-white px-4 py-2.5 flex items-center justify-between">
        <span className="font-semibold text-sm">Restoration Docs</span>
        <span className="text-xs opacity-80">{activeOrg?.name}</span>
      </header>
      <main className="flex-1 overflow-y-auto pb-2">{children}</main>
      <BottomNav />
    </div>
  );
}