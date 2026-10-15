import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';
import { SyncStatusBanner } from '../../offline/SyncStatusBanner';

interface AppShellProps {
  children: ReactNode;
  title?: string;
}

export function AppShell({ children, title }: AppShellProps) {
  const { profile } = useAuth();
  const isManager = profile?.role === 'manager';

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <SyncStatusBanner />
      {isManager && <TopBar title={title} />}
      <main className={`flex-1 ${isManager ? 'pt-14' : 'pb-16'}`}>
        {children}
      </main>
      {!isManager && <BottomNav />}
    </div>
  );
}
