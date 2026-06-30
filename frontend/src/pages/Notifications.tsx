import { SubHeader } from '../components/SubHeader';

// Alerts/notifications (e.g. Hydro drying alerts, share invites). Module not built.
export default function Notifications() {
  return (
    <div>
      <SubHeader title="Notifications" />
      <p className="p-4 text-gray-400 text-sm">
        Alerts and notifications will appear here (drying-chamber alerts, share
        invites, report status). Built alongside Hydro.
      </p>
    </div>
  );
}