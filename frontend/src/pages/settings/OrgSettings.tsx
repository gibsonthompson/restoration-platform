import { useOrg } from '../../context/OrgContext';

// Org-level config lives here later: report branding, default Hydro task list,
// note templates, material library, equipment catalog. Scaffold only.
export default function OrgSettings() {
  const { activeOrg, role } = useOrg();
  return (
    <div className="p-4 space-y-2">
      <h1 className="text-lg font-bold">Settings</h1>
      <p className="text-sm text-gray-600">Org: {activeOrg?.name}</p>
      <p className="text-sm text-gray-600">Your role: {role}</p>
      <p className="text-sm text-gray-400 pt-4">
        Report branding, default Hydro task list, note templates, material library,
        and equipment catalog will be configured here (resto_org_settings).
      </p>
    </div>
  );
}
