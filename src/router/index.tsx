import { Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import { TeamPage } from '../pages/manager/TeamPage';
import { ContractsListPage } from '../pages/manager/ContractsListPage';
import { CreateContractPage } from '../pages/manager/CreateContractPage';
import { ContractDetailPage } from '../pages/manager/ContractDetailPage';
import { QuotesListPage } from '../pages/manager/QuotesListPage';
import { CreateQuotePage } from '../pages/manager/CreateQuotePage';
import { QuoteDetailPage } from '../pages/manager/QuoteDetailPage';
import { DeviceFormPage } from '../pages/manager/DeviceFormPage';
import { EditSitePage } from '../pages/manager/EditSitePage';
import { SystemFormPage } from '../pages/manager/SystemFormPage';
import { EditCustomerPage } from '../pages/manager/EditCustomerPage';

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
import { FEATURES } from '../lib/features';
import { ReportsPage } from '../pages/manager/ReportsPage';
import { ImportPage } from '../pages/manager/ImportPage';

// Shared pages
import { ScannerPage } from '../pages/ScannerPage';
import { DeviceDetailPage } from '../pages/DeviceDetailPage';
import { DeviceQRPage } from '../pages/DeviceQRPage';
import { DeviceLinkPage } from '../pages/DeviceLinkPage';

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

/** Either role */
function A({ children }: { children: React.ReactNode }) {
  return <AuthGuard><AppShell>{children}</AppShell></AuthGuard>;
}

/** A legacy URL whose new address is built from its params */
function Moved({ to }: { to: (params: Record<string, string | undefined>) => string }) {
  const params = useParams();
  return <Navigate to={to(params)} replace />;
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
      <Route path="/manager/sync" element={<M><SyncIssuesPage /></M>} />
      <Route path="/manager/planner" element={<M><PlannerPage /></M>} />

      {/* ── Manager jobs ───────────────────────────────────────── */}
      <Route path="/manager/jobs" element={<M><ManagerJobsListPage /></M>} />
      <Route path="/manager/jobs/create" element={<M><CreateJobPage /></M>} />
      <Route path="/manager/jobs/:jobId" element={<M><JobDetailPage /></M>} />

      {/* Legacy URLs: up one level to the job (relative to the URL, not the route tree) */}
      <Route path="/manager/jobs/:jobId/assign" element={<AuthGuard requiredRole="manager"><Navigate to=".." relative="path" replace /></AuthGuard>} />
      <Route path="/manager/jobs/:jobId/review" element={<AuthGuard requiredRole="manager"><Navigate to=".." relative="path" replace /></AuthGuard>} />

      {/* ── Manager remedials ──────────────────────────────────── */}
      <Route path="/manager/remedials" element={<M><RemedialsListPage /></M>} />

      {/* ── Manager customers ──────────────────────────────────── */}
      <Route path="/manager/customers" element={<M><CustomersListPage /></M>} />
      <Route path="/manager/customers/:customerId" element={<M><CustomerDetailPage /></M>} />
      <Route path="/manager/customers/:customerId/edit" element={<M><EditCustomerPage /></M>} />

      {/* ── Manager sites ──────────────────────────────────────── */}
      <Route path="/manager/sites" element={<M><SitesPage /></M>} />
      <Route path="/manager/sites/create" element={<M><CreateSitePage /></M>} />
      <Route path="/manager/sites/:siteId" element={<M><SiteDetailPage /></M>} />
      <Route path="/manager/sites/:siteId/edit" element={<M><EditSitePage /></M>} />

      {/* Legacy URL: up one level to the site */}
      <Route path="/manager/sites/:siteId/history" element={<AuthGuard requiredRole="manager"><Navigate to=".." relative="path" replace /></AuthGuard>} />

      {/* ── Manager sites → systems ────────────────────────────── */}
      <Route path="/manager/sites/:siteId/systems/new" element={<M><SystemFormPage /></M>} />
      <Route path="/manager/systems/:systemId" element={<M><SystemDetailPage /></M>} />
      <Route path="/manager/systems/:systemId/edit" element={<M><SystemFormPage /></M>} />

      {/* ── Devices (the device page is shared; the scanner and QR labels open it) ── */}
      <Route path="/manager/sites/:siteId/devices/add" element={<M><DeviceFormPage /></M>} />
      <Route path="/devices/:deviceId" element={<A><DeviceDetailPage /></A>} />
      <Route path="/devices/:deviceId/edit" element={<M><DeviceFormPage /></M>} />
      <Route path="/devices/:deviceId/qr" element={<M><DeviceQRPage /></M>} />
      <Route path="/d/:code" element={<A><DeviceLinkPage /></A>} />

      {/* Legacy device URLs */}
      <Route path="/manager/sites/:siteId/devices" element={<AuthGuard requiredRole="manager"><Moved to={p => `/manager/sites/${p.siteId}?tab=devices`} /></AuthGuard>} />
      <Route path="/manager/sites/:siteId/devices/:deviceId" element={<AuthGuard><Moved to={p => `/devices/${p.deviceId}`} /></AuthGuard>} />
      <Route path="/manager/sites/:siteId/devices/:deviceId/qr" element={<AuthGuard requiredRole="manager"><Moved to={p => `/devices/${p.deviceId}/qr`} /></AuthGuard>} />

      {/* ── Manager contracts ──────────────────────────────────── */}
      <Route path="/manager/contracts" element={<M><ContractsListPage /></M>} />
      <Route path="/manager/contracts/create" element={<M><CreateContractPage /></M>} />
      <Route path="/manager/contracts/:contractId" element={<M><ContractDetailPage /></M>} />
      <Route path="/manager/contracts/:contractId/edit" element={<M><CreateContractPage /></M>} />

      {/* ── Manager quotes ─────────────────────────────────────── */}
      {FEATURES.quotes && <>
        <Route path="/manager/quotes" element={<M><QuotesListPage /></M>} />
        <Route path="/manager/quotes/create" element={<M><CreateQuotePage /></M>} />
        <Route path="/manager/quotes/:quoteId" element={<M><QuoteDetailPage /></M>} />
      </>}

      {/* ── Manager invoices ───────────────────────────────────── */}
      {FEATURES.invoices && <>
        <Route path="/manager/invoices" element={<M><InvoicesListPage /></M>} />
        <Route path="/manager/invoices/create" element={<M><CreateInvoicePage /></M>} />
        <Route path="/manager/invoices/:invoiceId" element={<M><InvoiceDetailPage /></M>} />
      </>}

      {/* ── Manager reports & import ───────────────────────────── */}
      <Route path="/manager/reports" element={<M><ReportsPage /></M>} />
      <Route path="/manager/import" element={<M><ImportPage /></M>} />

      {/* ── Manager settings ───────────────────────────────────── */}
      <Route path="/manager/settings" element={<M><SettingsPage /></M>} />
      <Route path="/manager/team" element={<M><TeamPage /></M>} />

      {/* ── QR Scanner (both roles) ────────────────────────────── */}
      <Route path="/scan" element={<A><ScannerPage /></A>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
