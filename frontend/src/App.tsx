import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ClaimsList from './pages/ClaimsList';
import ClaimDetail from './pages/ClaimDetail';
import EditClaim from './pages/EditClaim';
import StructureDetail from './pages/StructureDetail';
import RoomDetail from './pages/RoomDetail';
import OrgSettings from './pages/settings/OrgSettings';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<ClaimsList />} />
        <Route path="/claims/new" element={<EditClaim />} />
        <Route path="/claims/:claimId" element={<ClaimDetail />} />
        <Route path="/claims/:claimId/edit" element={<EditClaim />} />
        <Route path="/structures/:structureId" element={<StructureDetail />} />
        <Route path="/rooms/:roomId" element={<RoomDetail />} />
        <Route path="/settings" element={<OrgSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
