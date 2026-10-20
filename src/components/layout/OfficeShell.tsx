import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { GlobalSearch } from '../ui/GlobalSearch';
import { SyncStatusBanner } from '../../offline/SyncStatusBanner';
import { GlobalToasts } from '../ui/GlobalToasts';

interface OfficeShellProps {
  children: ReactNode;
  notificationCount?: number;
}

export function OfficeShell({ children, notificationCount = 0 }: OfficeShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
      {/* Sidebar — hidden on small screens, shown on md+ */}
      <div className="hidden md:flex">
        <Sidebar notificationCount={notificationCount} />
      </div>

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <SyncStatusBanner />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Global search modal */}
      <GlobalSearch />
      <GlobalToasts />
    </div>
  );
}
