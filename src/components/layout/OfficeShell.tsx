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
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] print:block print:h-auto print:overflow-visible print:bg-white">
      {/* Sidebar — hidden on small screens, shown on md+ */}
      <div className="hidden md:flex print:hidden">
        <Sidebar notificationCount={notificationCount} />
      </div>

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden print:overflow-visible">
        <div className="print:hidden"><SyncStatusBanner /></div>
        <main className="flex-1 overflow-y-auto print:overflow-visible">
          {children}
        </main>
      </div>

      {/* Global search modal */}
      <GlobalSearch />
      <GlobalToasts />
    </div>
  );
}
