import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';

interface TopBarProps { title?: string; }

export function TopBar({ title: _title }: TopBarProps) {
  const { signOut } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-10 h-14">
      <div className="flex items-center h-full px-4 gap-6">
        <span className="font-bold text-blue-700 text-sm shrink-0">Jobsheet Pro</span>
        <nav className="flex gap-4 text-sm overflow-x-auto flex-1">
          <NavLink to="/manager/jobs" className={({ isActive }) => `whitespace-nowrap ${isActive ? 'text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>Jobs</NavLink>
          <NavLink to="/manager/remedials" className={({ isActive }) => `whitespace-nowrap ${isActive ? 'text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>Remedials</NavLink>
          <NavLink to="/manager/sites" className={({ isActive }) => `whitespace-nowrap ${isActive ? 'text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>Sites</NavLink>
          <NavLink to="/manager/settings" className={({ isActive }) => `whitespace-nowrap ${isActive ? 'text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>Settings</NavLink>
        </nav>
        <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">Sign out</button>
      </div>
    </header>
  );
}
