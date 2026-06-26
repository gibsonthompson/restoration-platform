import type { ReactNode } from 'react';
import { useOrg } from '../context/OrgContext';

// App shell. The real IA has depth-aware nav (fewer tabs at claim-list level,
// more inside a claim). For the foundation we keep one consistent shell; the
// per-depth bottom nav is wired in BottomNav and can branch on route later.
export function Layout({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="safe-top bg-brand text-white px-4 py-3 flex items-center justify-between">
        <span className="font-semibold">Restoration Docs</span>
        <span className="text-xs opacity-80">{activeOrg?.name}</span>
      </header>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
