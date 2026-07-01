import { useLocation, useNavigate } from 'react-router-dom';
import { FolderOpen, Search, Bell, Settings, Home, CalendarClock, Share2 } from 'lucide-react';

// Depth-aware bottom nav.
//  - Global: Claims | Search | Alerts | Settings
//  - In a claim: Overview | Events | Search | Alerts | Share
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
  const is = (p: string) => pathname === p;

  return (
    <nav className="safe-bottom bg-white border-t border-gray-100 flex sticky bottom-0 pt-2.5 pb-1.5">
      {claimId ? (
        <>
          <Item icon={Home} label="Overview" to={`/claims/${claimId}`} active={pathname === `/claims/${claimId}`} />
          <Item icon={CalendarClock} label="Events" to={`/claims/${claimId}/events`} active={pathname.endsWith('/events')} />
          <Item icon={Search} label="Search" to="/search" active={is('/search')} />
          <Item icon={Bell} label="Alerts" to="/notifications" active={is('/notifications')} />
          <Item icon={Share2} label="Share" to={`/claims/${claimId}/share`} active={pathname.endsWith('/share')} />
        </>
      ) : (
        <>
          <Item icon={FolderOpen} label="Claims" to="/" active={is('/')} />
          <Item icon={Search} label="Search" to="/search" active={is('/search')} />
          <Item icon={Bell} label="Alerts" to="/notifications" active={is('/notifications')} />
          <Item icon={Settings} label="Settings" to="/settings" active={is('/settings')} />
        </>
      )}
    </nav>
  );
}