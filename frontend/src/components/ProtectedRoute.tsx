import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { AppLayout } from './AppLayout';
import CreateOrg from '../pages/CreateOrg';

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const { activeOrg, loading: orgLoading } = useOrg();

  if (loading || orgLoading) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  // Logged out: go straight to the login form, not the marketing landing page.
  // This is the path a cold-started PWA hits, so the installed app opens to login.
  if (!session) return <Navigate to="/login" replace />;
  if (!activeOrg) return <CreateOrg />;

  return <AppLayout><Outlet /></AppLayout>;
}