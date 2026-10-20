import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from '../auth/AuthGuard';
import { useAuth } from '../auth/AuthProvider';
import { AppShell } from '../components/layout/AppShell';
import { LoginPage } from '../auth/LoginPage';
import { AuthCallbackPage } from '../auth/AuthCallbackPage';

// Engineer pages
import { EngineerJobsPage } from '../pages/engineer/EngineerJobsPage';
import { EngineerJobDetailPage } from '../pages/engineer/EngineerJobDetailPage';
import { FillJobsheetPage } from '../pages/engineer/FillJobsheetPage';
import { JobSubmittedPage } from '../pages/engineer/JobSubmittedPage';
import { TodayPage } from '../pages/engineer/TodayPage';
import { SyncIssuesPage } from '../pages/engineer/SyncIssuesPage';

// Manager pages — existing
import { ManagerJobsListPage } from '../pages/manager/ManagerJobsListPage';
import { CreateJobPage } from '../pages/manager/CreateJobPage';
import { RemedialsListPage } from '../pages/manager/RemedialsListPage';
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

// Manager pages — Phase 4 new
import { DashboardPage } from '../pages/manager/DashboardPage';
import { PlannerPage } from '../pages/manager/PlannerPage';
import { JobDetailPage } from '../pages/manager/JobDetailPage';
import { CustomersListPage } from '../pages/manager/CustomersListPage';
import { CustomerDetailPage } from '../pages/manager/CustomerDetailPage';
import { SiteDetailPage } from '../pages/manager/SiteDetailPage';
import { SystemDetailPage } from '../pages/manager/SystemDetailPage';
import { InvoicesListPage } from '../pages/manager/InvoicesListPage';
import { CreateInvoicePage } from '../pages/manager/CreateInvoicePage';
import { InvoiceDetailPage } from '../pages/manager/InvoiceDetailPage';
import { ReportsPage } from '../pages/manager/ReportsPage';
import { ImportPage } from '../pages/manager/ImportPage';

// Shared pages
import { ScannerPage } from '../pages/ScannerPage';

function RootRedirect() {
  const { profile } = useAuth();
  if (profile?.role === 'manager') return <Navigate to="/manager/dashboard" replace />;
  return <Navigate to="/today" replace />;
}

function M({ children }: { children: React.ReactNode }) {
  return <AuthGuard requiredRole="manager"><AppShell>{children}</AppShell></AuthGuard>;
}

function E({ children }: { children: React.ReactNode }) {
  return <AuthGuard requiredRole="engineer"><AppShell>{children}</AppShell></AuthGuard>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/" element={<AuthGuard><RootRedirect /></AuthGuard>} />

      {/* ── Engineer routes ─────────────────────────────────────── */}
      <Route path="/today" element={<E><TodayPage /></E>} />
      <Route path="/jobs" element={<E><EngineerJobsPage /></E>} />
      <Route path="/jobs/:jobId" element={<E><EngineerJobDetailPage /></E>} />
      <Route path="/jobs/:jobId/fill" element={<E><FillJobsheetPage /></E>} />
      <Route path="/jobs/:jobId/submitted" element={<E><JobSubmittedPage /></E>} />
      <Route path="/sync" element={<E><SyncIssuesPage /></E>} />

      {/* ── Manager root redirect ───────────────────────────────── */}
      <Route path="/manager" element={<Navigate to="/manager/dashboard" replace />} />

      {/* ── Manager dashboard & planner ────────────────────────── */}
      <Route path="/manager/dashboard" element={<M><DashboardPage /></M>} />
      <Route path="/manager/planner" element={<M><PlannerPage /></M>} />

      {/* ── Manager jobs ───────────────────────────────────────── */}
      <Route path="/manager/jobs" element={<M><ManagerJobsListPage /></M>} />
      <Route path="/manager/jobs/create" element={<M><CreateJobPage /></M>} />
      <Route path="/manager/jobs/:jobId" element={<M><JobDetailPage /></M>} />

      {/* Legacy redirects for assign/review */}
      <Route path="/manager/jobs/:jobId/assign" element={<AuthGuard requiredRole="manager"><Navigate to="../" replace /></AuthGuard>} />
      <Route path="/manager/jobs/:jobId/review" element={<AuthGuard requiredRole="manager"><Navigate to="../" replace /></AuthGuard>} />

      {/* ── Manager remedials ──────────────────────────────────── */}
      <Route path="/manager/remedials" element={<M><RemedialsListPage /></M>} />

      {/* ── Manager customers ──────────────────────────────────── */}
      <Route path="/manager/customers" element={<M><CustomersListPage /></M>} />
      <Route path="/manager/customers/:customerId" element={<M><CustomerDetailPage /></M>} />

      {/* ── Manager sites ──────────────────────────────────────── */}
      <Route path="/manager/sites" element={<M><SitesPage /></M>} />
      <Route path="/manager/sites/create" element={<M><CreateSitePage /></M>} />
      <Route path="/manager/sites/:siteId" element={<M><SiteDetailPage /></M>} />

      {/* Legacy redirect for site history */}
      <Route path="/manager/sites/:siteId/history" element={<AuthGuard requiredRole="manager"><Navigate to="../" replace /></AuthGuard>} />

      {/* ── Manager sites → systems ────────────────────────────── */}
      <Route path="/manager/systems/:systemId" element={<M><SystemDetailPage /></M>} />

      {/* ── Manager sites → devices ────────────────────────────── */}
      <Route path="/manager/sites/:siteId/devices" element={<M><SiteDevicesPage /></M>} />
      <Route path="/manager/sites/:siteId/devices/add" element={<M><AddDevicePage /></M>} />
      <Route path="/manager/sites/:siteId/devices/:deviceId" element={<M><DeviceDetailPage /></M>} />
      <Route path="/manager/sites/:siteId/devices/:deviceId/qr" element={<M><DeviceQRPage /></M>} />

      {/* ── Manager contracts ──────────────────────────────────── */}
      <Route path="/manager/contracts" element={<M><ContractsListPage /></M>} />
      <Route path="/manager/contracts/create" element={<M><CreateContractPage /></M>} />
      <Route path="/manager/contracts/:contractId" element={<M><ContractDetailPage /></M>} />

      {/* ── Manager quotes ─────────────────────────────────────── */}
      <Route path="/manager/quotes" element={<M><QuotesListPage /></M>} />
      <Route path="/manager/quotes/create" element={<M><CreateQuotePage /></M>} />
      <Route path="/manager/quotes/:quoteId" element={<M><QuoteDetailPage /></M>} />

      {/* ── Manager invoices ───────────────────────────────────── */}
      <Route path="/manager/invoices" element={<M><InvoicesListPage /></M>} />
      <Route path="/manager/invoices/create" element={<M><CreateInvoicePage /></M>} />
      <Route path="/manager/invoices/:invoiceId" element={<M><InvoiceDetailPage /></M>} />

      {/* ── Manager reports & import ───────────────────────────── */}
      <Route path="/manager/reports" element={<M><ReportsPage /></M>} />
      <Route path="/manager/import" element={<M><ImportPage /></M>} />

      {/* ── Manager settings ───────────────────────────────────── */}
      <Route path="/manager/settings" element={<M><SettingsPage /></M>} />

      {/* ── QR Scanner (both roles) ────────────────────────────── */}
      <Route path="/scan" element={<AuthGuard><AppShell><ScannerPage /></AppShell></AuthGuard>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
