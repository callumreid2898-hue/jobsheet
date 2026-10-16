import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from '../auth/AuthGuard';
import { useAuth } from '../auth/AuthProvider';
import { AppShell } from '../components/layout/AppShell';
import { LoginPage } from '../auth/LoginPage';
import { AuthCallbackPage } from '../auth/AuthCallbackPage';
import { EngineerJobsPage } from '../pages/engineer/EngineerJobsPage';
import { EngineerJobDetailPage } from '../pages/engineer/EngineerJobDetailPage';
import { FillJobsheetPage } from '../pages/engineer/FillJobsheetPage';
import { JobSubmittedPage } from '../pages/engineer/JobSubmittedPage';
import { ManagerJobsListPage } from '../pages/manager/ManagerJobsListPage';
import { CreateJobPage } from '../pages/manager/CreateJobPage';
import { AssignEngineerPage } from '../pages/manager/AssignEngineerPage';
import { ReviewJobsheetPage } from '../pages/manager/ReviewJobsheetPage';
import { RemedialsListPage } from '../pages/manager/RemedialsListPage';
import { SiteHistoryPage } from '../pages/manager/SiteHistoryPage';
import { SitesPage } from '../pages/manager/SitesPage';
import { CreateSitePage } from '../pages/manager/CreateSitePage';
import { SettingsPage } from '../pages/manager/SettingsPage';
import { ContractsListPage } from '../pages/manager/ContractsListPage';
import { CreateContractPage } from '../pages/manager/CreateContractPage';
import { ContractDetailPage } from '../pages/manager/ContractDetailPage';
import { QuotesListPage } from '../pages/manager/QuotesListPage';
import { CreateQuotePage } from '../pages/manager/CreateQuotePage';
import { QuoteDetailPage } from '../pages/manager/QuoteDetailPage';
import { SiteDevicesPage } from '../pages/manager/SiteDevicesPage';
import { AddDevicePage } from '../pages/manager/AddDevicePage';
import { DeviceDetailPage } from '../pages/manager/DeviceDetailPage';
import { DeviceQRPage } from '../pages/manager/DeviceQRPage';
import { ScannerPage } from '../pages/ScannerPage';

function RootRedirect() {
  const { profile } = useAuth();
  if (profile?.role === 'manager') return <Navigate to="/manager/jobs" replace />;
  return <Navigate to="/jobs" replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/" element={<AuthGuard><RootRedirect /></AuthGuard>} />

      <Route path="/jobs" element={<AuthGuard requiredRole="engineer"><AppShell><EngineerJobsPage /></AppShell></AuthGuard>} />
      <Route path="/jobs/:jobId" element={<AuthGuard requiredRole="engineer"><AppShell><EngineerJobDetailPage /></AppShell></AuthGuard>} />
      <Route path="/jobs/:jobId/fill" element={<AuthGuard requiredRole="engineer"><AppShell><FillJobsheetPage /></AppShell></AuthGuard>} />
      <Route path="/jobs/:jobId/submitted" element={<AuthGuard requiredRole="engineer"><AppShell><JobSubmittedPage /></AppShell></AuthGuard>} />

      <Route path="/manager" element={<Navigate to="/manager/jobs" replace />} />
      <Route path="/manager/jobs" element={<AuthGuard requiredRole="manager"><AppShell><ManagerJobsListPage /></AppShell></AuthGuard>} />
      <Route path="/manager/jobs/create" element={<AuthGuard requiredRole="manager"><AppShell><CreateJobPage /></AppShell></AuthGuard>} />
      <Route path="/manager/jobs/:jobId/assign" element={<AuthGuard requiredRole="manager"><AppShell><AssignEngineerPage /></AppShell></AuthGuard>} />
      <Route path="/manager/jobs/:jobId/review" element={<AuthGuard requiredRole="manager"><AppShell><ReviewJobsheetPage /></AppShell></AuthGuard>} />
      <Route path="/manager/remedials" element={<AuthGuard requiredRole="manager"><AppShell><RemedialsListPage /></AppShell></AuthGuard>} />
      <Route path="/manager/sites" element={<AuthGuard requiredRole="manager"><AppShell><SitesPage /></AppShell></AuthGuard>} />
      <Route path="/manager/sites/create" element={<AuthGuard requiredRole="manager"><AppShell><CreateSitePage /></AppShell></AuthGuard>} />
      <Route path="/manager/sites/:siteId/history" element={<AuthGuard requiredRole="manager"><AppShell><SiteHistoryPage /></AppShell></AuthGuard>} />
      <Route path="/manager/settings" element={<AuthGuard requiredRole="manager"><AppShell><SettingsPage /></AppShell></AuthGuard>} />

      {/* Phase 3 — Contracts */}
      <Route path="/manager/contracts" element={<AuthGuard requiredRole="manager"><AppShell><ContractsListPage /></AppShell></AuthGuard>} />
      <Route path="/manager/contracts/create" element={<AuthGuard requiredRole="manager"><AppShell><CreateContractPage /></AppShell></AuthGuard>} />
      <Route path="/manager/contracts/:contractId" element={<AuthGuard requiredRole="manager"><AppShell><ContractDetailPage /></AppShell></AuthGuard>} />

      {/* Phase 3 — Quotes */}
      <Route path="/manager/quotes" element={<AuthGuard requiredRole="manager"><AppShell><QuotesListPage /></AppShell></AuthGuard>} />
      <Route path="/manager/quotes/create" element={<AuthGuard requiredRole="manager"><AppShell><CreateQuotePage /></AppShell></AuthGuard>} />
      <Route path="/manager/quotes/:quoteId" element={<AuthGuard requiredRole="manager"><AppShell><QuoteDetailPage /></AppShell></AuthGuard>} />

      {/* Phase 3 — Device Asset Register */}
      <Route path="/manager/sites/:siteId/devices" element={<AuthGuard requiredRole="manager"><AppShell><SiteDevicesPage /></AppShell></AuthGuard>} />
      <Route path="/manager/sites/:siteId/devices/add" element={<AuthGuard requiredRole="manager"><AppShell><AddDevicePage /></AppShell></AuthGuard>} />
      <Route path="/manager/sites/:siteId/devices/:deviceId" element={<AuthGuard requiredRole="manager"><AppShell><DeviceDetailPage /></AppShell></AuthGuard>} />
      <Route path="/manager/sites/:siteId/devices/:deviceId/qr" element={<AuthGuard requiredRole="manager"><AppShell><DeviceQRPage /></AppShell></AuthGuard>} />

      {/* Phase 3 — QR Scanner (both roles) */}
      <Route path="/scan" element={<AuthGuard><AppShell><ScannerPage /></AppShell></AuthGuard>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
