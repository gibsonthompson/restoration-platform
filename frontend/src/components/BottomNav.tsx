import { useLocation, useNavigate } from 'react-router-dom';
import { FolderOpen, Search, Bell, Settings, Home, CalendarClock, Share2 } from 'lucide-react';

// Depth-aware bottom nav (per the planning doc IA).
//  - Global level (claims list, search, settings): Claims | Search | Alerts | Settings
//  - Inside a claim (claim/structure/room): Overview | Events | Search | Alerts | Share
// Claim id is parsed from the path so the claim tabs route correctly at any depth.
export function BottomNav() {
  const { pathname } = useLocation();
  const nav = useNavigate();

  const m = pathname.match(/^\/claims\/([0-9a-fA-F-]{36})/);
  const claimId = m ? m[1] : null;
  const inClaim = Boolean(claimId);

  const Item = ({ icon: Icon, label, to, active }:
    { icon: any; label: string; to: string; active: boolean }) => (
    <button onClick={() => nav(to)}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'text-brand' : 'text-gray-400'}`}>
      <Icon size={20} />
      {label}
    </button>
  );

  const is = (p: string) => pathname === p;

  return (
    <nav className="safe-bottom bg-white border-t flex sticky bottom-0">
      {inClaim ? (
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