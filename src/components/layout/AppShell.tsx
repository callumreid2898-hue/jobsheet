import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { BottomNav } from './BottomNav';
import { OfficeShell } from './OfficeShell';
import { SyncStatusBanner } from '../../offline/SyncStatusBanner';

interface AppShellProps {
  children: ReactNode;
  title?: string;
}

export function AppShell({ children }: AppShellProps) {
  const { profile } = useAuth();
  const isManager = profile?.role === 'manager';

  if (isManager) {
    return <OfficeShell>{children}</OfficeShell>;
  }

  // Engineer shell — bottom nav, sync banner
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <SyncStatusBanner />
      <main className="flex-1 pb-16">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
