import { LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';

// Org-level config lives here later: report branding, default Hydro task list,
// note templates, material library, equipment catalog. Sign-out wired now.
export default function OrgSettings() {
  const { activeOrg, role } = useOrg();
  const { user } = useAuth();

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold">Settings</h1>
      <div className="bg-white border rounded p-4 space-y-1 text-sm">
        <div><span className="text-gray-400">Company:</span> {activeOrg?.name}</div>
        <div><span className="text-gray-400">Signed in:</span> {user?.email}</div>
        <div><span className="text-gray-400">Role:</span> {role}</div>
      </div>

      <p className="text-sm text-gray-400">
        Coming here: report branding, default Hydro task list, note templates,
        material library, equipment catalog (resto_org_settings).
      </p>

      <button onClick={() => supabase.auth.signOut()}
              className="w-full border border-red-200 text-red-600 rounded py-3 font-medium flex items-center justify-center gap-2">
        <LogOut size={16} /> Sign out
      </button>
    </div>
  );
}