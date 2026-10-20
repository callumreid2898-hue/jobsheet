import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { OnboardingPage } from './OnboardingPage';
import type { UserRole } from '../types';

interface Props {
  children: ReactNode;
  requiredRole?: UserRole;
}

export function AuthGuard({ children, requiredRole }: Props) {
  const { session, profile, isLoading, previewRole, access } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  // Signed in but no usable profile: onboarding, removed or offline. Never the route itself.
  if (access !== 'ok' || !profile) return <OnboardingPage />;

  // previewRole overrides real role for route access checks
  const effectiveRole = previewRole ?? profile?.role;

  if (requiredRole && effectiveRole !== requiredRole) {
    if (effectiveRole === 'engineer') return <Navigate to="/jobs" replace />;
    if (effectiveRole === 'manager') return <Navigate to="/manager/jobs" replace />;
  }

  return <>{children}</>;
}
