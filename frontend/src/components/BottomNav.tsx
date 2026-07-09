import { useLocation, useNavigate } from 'react-router-dom';
import { FolderOpen, Search, Settings, Home, CalendarClock, Share2, Plus, FileText } from 'lucide-react';

// Depth-aware bottom nav (task-focused, 4 items per context).
//  - Global:   Claims | + New | Search | Settings
//  - In-claim: Overview | Events | Report | Share
export function BottomNav() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const m = pathname.match(/^\/claims\/([0-9a-fA-F-]{36})/);
  const claimId = m ? m[1] : null;

  const Item = ({ icon: Icon, label, to, active }:
    { icon: any; label: string; to: string; active: boolean }) => (
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

  const is = (p: string) => pathname === p;

  return (
    <nav className="bg-white border-t border-gray-100 flex shrink-0 pt-2"
         style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}>
      {claimId ? (
        <>
          <Item icon={Home} label="Overview" to={`/claims/${claimId}`} active={pathname === `/claims/${claimId}`} />
          <Item icon={CalendarClock} label="Events" to={`/claims/${claimId}/events`} active={pathname.endsWith('/events')} />
          <Item icon={FileText} label="Report" to={`/claims/${claimId}/documents`} active={pathname.endsWith('/documents')} />
          <Item icon={Share2} label="Share" to={`/claims/${claimId}/share`} active={pathname.endsWith('/share')} />
        </>
      ) : (
        <>
          <Item icon={FolderOpen} label="Claims" to="/" active={is('/')} />
          <NewItem to="/claims/new" />
          <Item icon={Search} label="Search" to="/search" active={is('/search')} />
          <Item icon={Settings} label="Settings" to="/settings" active={is('/settings')} />
        </>
      )}
    </nav>
  );
}