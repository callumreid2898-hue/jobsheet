import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { BottomNav } from './BottomNav';
import { OfficeShell } from './OfficeShell';
import { SyncStatusBanner } from '../../offline/SyncStatusBanner';

interface AppShellProps {
  children: ReactNode;
  title?: string;
}

export function AppShell({ children }: AppShellProps) {
  const { profile, previewRole, setPreviewRole } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The jobsheet form has its own fixed Submit bar where the nav would be
  const showBottomNav = !/^\/jobs\/[^/]+\/fill$/.test(pathname);
  const effectiveRole = previewRole ?? profile?.role;
  const isManager = effectiveRole === 'manager';

  // Shown at top of screen whenever preview mode is active
  const previewBanner = previewRole !== null ? (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-400 text-amber-950 text-xs font-semibold px-4 py-1.5 flex items-center justify-between shadow">
      <span>Engineer preview mode</span>
      <button
        onClick={() => {
          setPreviewRole(null);
          navigate('/manager/planner');
        }}
        className="underline hover:no-underline"
      >
        Exit preview
      </button>
    </div>
  ) : null;

  if (isManager) {
    return (
      <>
        {previewBanner}
        <OfficeShell>{children}</OfficeShell>
      </>
    );
  }

  // Engineer shell — bottom nav + sync banner
  // When in preview mode we push content down below the amber banner (h-8 = 2rem)
  return (
    <>
      {previewBanner}
      <div className={`min-h-screen flex flex-col bg-gray-50 ${previewRole ? 'pt-8' : ''}`}>
        <SyncStatusBanner />
        <main className={`flex-1 ${showBottomNav ? 'pb-16' : ''}`}>
          {children}
        </main>
        {showBottomNav && <BottomNav />}
      </div>
    </>
  );
}
