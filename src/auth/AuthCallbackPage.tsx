import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function AuthCallbackPage() {
  const { profile, isLoading, session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      navigate('/login', { replace: true });
      return;
    }
    if (profile?.role === 'manager') {
      navigate('/manager/jobs', { replace: true });
    } else {
      navigate('/jobs', { replace: true });
    }
  }, [isLoading, session, profile, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center flex-col gap-3">
      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      <p className="text-gray-500 text-sm">Signing you in…</p>
    </div>
  );
}
