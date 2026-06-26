import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { Layout } from './Layout';
import CreateOrg from '../pages/CreateOrg';

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const { activeOrg, loading: orgLoading } = useOrg();

  if (loading || orgLoading) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  // Signed in but no org yet -> force org creation (covers the chicken-and-egg).
  if (!activeOrg) return <CreateOrg />;

  return <Layout><Outlet /></Layout>;
}
