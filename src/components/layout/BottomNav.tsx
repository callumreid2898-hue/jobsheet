import { NavLink } from 'react-router-dom';

export function BottomNav() {
  const activeClass = 'text-[#0D3349]';
  const inactiveClass = 'text-gray-400';

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-inset-bottom z-10">
      <div className="flex">
        {/* Today */}
        <NavLink
          to="/today"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs font-medium ${isActive ? activeClass : inactiveClass}`
          }
        >
          <svg className="w-6 h-6 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
          Today
        </NavLink>

        {/* Jobs */}
        <NavLink
          to="/jobs"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs font-medium ${isActive ? activeClass : inactiveClass}`
          }
        >
          <svg className="w-6 h-6 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Jobs
        </NavLink>

        {/* Scan */}
        <NavLink
          to="/scan"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs font-medium ${isActive ? activeClass : inactiveClass}`
          }
        >
          <svg className="w-6 h-6 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          Scan
        </NavLink>

        {/* Sync (overlay/indicator) */}
        <NavLink
          to="/jobs"
          className={({ isActive: _ }) =>
            `flex-1 flex flex-col items-center py-2 text-xs font-medium ${inactiveClass}`
          }
          aria-label="Sync status"
        >
          <svg className="w-6 h-6 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sync
        </NavLink>
      </div>
    </nav>
  );
}
