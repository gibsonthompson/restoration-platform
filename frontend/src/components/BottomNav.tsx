import { useLocation, useNavigate } from 'react-router-dom';
import { FolderOpen, Search, Settings, Home, CalendarClock, Share2, Plus, FileText } from 'lucide-react';

type NavItem = { icon: any; label: string; to: string; active: boolean };

// Depth-aware nav (task-focused, 4 items per context).
//   Global:   Claims | + New | Search | Settings
//   In-claim: Overview | Events | Report | Share
// One component, two presentations. variant="bottom" is the mobile tab bar (default and
// unchanged); variant="sidebar" is the desktop left rail. The item list and the active-route
// logic are computed once here, so the two presentations can never disagree.
export function BottomNav({ variant = 'bottom' }: { variant?: 'bottom' | 'sidebar' }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const m = pathname.match(/^\/claims\/([0-9a-fA-F-]{36})/);
  const claimId = m ? m[1] : null;
  const is = (p: string) => pathname === p;

  const claimNav: NavItem[] = claimId ? [
    { icon: Home, label: 'Overview', to: `/claims/${claimId}`, active: pathname === `/claims/${claimId}` },
    { icon: CalendarClock, label: 'Events', to: `/claims/${claimId}/events`, active: pathname.endsWith('/events') },
    { icon: FileText, label: 'Report', to: `/claims/${claimId}/documents`, active: pathname.endsWith('/documents') },
    { icon: Share2, label: 'Share', to: `/claims/${claimId}/share`, active: pathname.endsWith('/share') }
  ] : [];
  const globalNav: NavItem[] = [
    { icon: FolderOpen, label: 'Claims', to: '/', active: is('/') },
    { icon: Search, label: 'Search', to: '/search', active: is('/search') },
    { icon: Settings, label: 'Settings', to: '/settings', active: is('/settings') }
  ];

  // ---- desktop sidebar rail ---------------------------------------------
  if (variant === 'sidebar') {
    const SideItem = ({ icon: Icon, label, to, active }: NavItem) => (
      <button onClick={() => nav(to)}
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition
                    ${active ? 'bg-sky-soft text-sky-deep' : 'text-gray-500 hover:bg-gray-50'}`}>
        <Icon size={20} strokeWidth={active ? 2.5 : 2} /> {label}
      </button>
    );
    return (
      <nav className="flex flex-col gap-1 px-3 py-3">
        {!claimId && (
          <button onClick={() => nav('/claims/new')}
            className="mb-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-br from-sky to-sky-deep
                       text-white font-bold text-sm shadow-sky active:scale-[.98] transition">
            <Plus size={18} strokeWidth={2.6} /> New job
          </button>
        )}
        {(claimId ? claimNav : globalNav).map(it => <SideItem key={it.to} {...it} />)}
      </nav>
    );
  }

  // ---- mobile bottom tab bar (unchanged) --------------------------------
  const Item = ({ icon: Icon, label, to, active }: NavItem) => (
    <button onClick={() => nav(to)}
      className={`flex-1 flex flex-col items-center gap-1 py-1 text-[10.5px] font-semibold transition
                  ${active ? 'text-sky-deep' : 'text-gray-400'}`}>
      <Icon size={21} strokeWidth={active ? 2.5 : 2} />
      {label}
    </button>
  );

  // Prominent primary action: start a new job in one tap.
  const NewItem = ({ to }: { to: string }) => (
    <button onClick={() => nav(to)}
      className="flex-1 flex flex-col items-center gap-1 py-1 text-[10.5px] font-semibold text-sky-deep">
      <span className="w-9 h-9 -mt-1 rounded-full bg-sky text-white flex items-center justify-center shadow-md shadow-sky/40 active:scale-95 transition">
        <Plus size={20} strokeWidth={2.6} />
      </span>
      New
    </button>
  );

  return (
    <nav className="bg-white border-t border-gray-100 flex shrink-0 pt-2"
         style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}>
      {claimId ? (
        claimNav.map(it => <Item key={it.to} {...it} />)
      ) : (
        <>
          <Item {...globalNav[0]} />
          <NewItem to="/claims/new" />
          <Item {...globalNav[1]} />
          <Item {...globalNav[2]} />
        </>
      )}
    </nav>
  );
}