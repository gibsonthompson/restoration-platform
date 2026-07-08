import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import type { Org, Role } from '../types/models';

// Loads the user's orgs + active org + role. A user can belong to multiple orgs
// (e.g. a shared estimator), so we track an activeOrg and expose a switcher hook.
interface OrgState {
  orgs: Org[];
  activeOrg: Org | null;
  role: Role | null;
  loading: boolean;
  setActiveOrg: (o: Org) => void;
  createOrg: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const OrgCtx = createContext<OrgState>({
  orgs: [], activeOrg: null, role: null, loading: true,
  setActiveOrg: () => {}, createOrg: async () => {}, refresh: async () => {}
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActive] = useState<Org | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) { setOrgs([]); setActive(null); setLoading(false); return; }
    setLoading(true);
    try { await supabase.rpc('resto_accept_my_invites'); } catch { /* first login may have none */ }
    const { data: members } = await supabase
      .from('resto_org_members')
      .select('role, org_id, resto_orgs(id, name, plan, status)')
      .eq('user_id', user.id);
    const list = (members ?? []).map((m: any) => m.resto_orgs as Org).filter(Boolean);
    setOrgs(list);
    const first = list[0] ?? null;
    setActive(first);
    setRole((members?.find((m: any) => m.org_id === first?.id)?.role as Role) ?? null);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-line */ }, [user?.id]);

  async function createOrg(name: string) {
    await supabase.rpc('resto_create_org', { org_name: name }).throwOnError();
    await load();
  }

  return (
    <OrgCtx.Provider value={{
      orgs, activeOrg, role, loading,
      setActiveOrg: setActive, createOrg, refresh: load
    }}>
      {children}
    </OrgCtx.Provider>
  );
}

export const useOrg = () => useContext(OrgCtx);