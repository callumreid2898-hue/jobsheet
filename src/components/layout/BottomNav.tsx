import { NavLink } from 'react-router-dom';

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-inset-bottom z-10">
      <div className="flex">
        <NavLink
          to="/jobs"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs font-medium ${isActive ? 'text-blue-600' : 'text-gray-500'}`
          }
        >
          <svg className="w-6 h-6 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Jobs
        </NavLink>
      </div>
    </nav>
  );
}
