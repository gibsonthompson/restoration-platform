import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ClaimsList from './pages/ClaimsList';
import ClaimDetail from './pages/ClaimDetail';
import EditClaim from './pages/EditClaim';
import StructureDetail from './pages/StructureDetail';
import RoomDetail from './pages/RoomDetail';
import Documents from './pages/Documents';
import GeneralNotes from './pages/GeneralNotes';
import JobEvents from './pages/JobEvents';
import Share from './pages/Share';
import ScopePage from './pages/ScopePage';
import ContentsPage from './pages/ContentsPage';
import FormsPage from './pages/FormsPage';
import Search from './pages/Search';
import Notifications from './pages/Notifications';
import OrgSettings from './pages/settings/OrgSettings';
import HydroPage from './features/hydro/HydroPage';

// Routes are nested to mirror the real IA: claim -> structure -> room. The claim
// id stays in the URL at every depth, so the claim-context nav always knows where
// "Overview / Events / Share" should point without a lookup.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route element={<ProtectedRoute />}>
        {/* Global */}
        <Route path="/" element={<ClaimsList />} />
        <Route path="/search" element={<Search />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<OrgSettings />} />

        {/* Claim + children */}
        <Route path="/claims/new" element={<EditClaim />} />
        <Route path="/claims/:claimId" element={<ClaimDetail />} />
        <Route path="/claims/:claimId/edit" element={<EditClaim />} />
        <Route path="/claims/:claimId/documents" element={<Documents />} />
        <Route path="/claims/:claimId/notes" element={<GeneralNotes />} />
        <Route path="/claims/:claimId/events" element={<JobEvents />} />
        <Route path="/claims/:claimId/share" element={<Share />} />
        <Route path="/claims/:claimId/scope" element={<ScopePage />} />
        <Route path="/claims/:claimId/contents" element={<ContentsPage />} />
        <Route path="/claims/:claimId/forms" element={<FormsPage />} />
        <Route path="/claims/:claimId/structures/:structureId" element={<StructureDetail />} />
        <Route path="/claims/:claimId/structures/:structureId/hydro" element={<HydroPage />} />
        <Route path="/claims/:claimId/structures/:structureId/rooms/:roomId" element={<RoomDetail />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}