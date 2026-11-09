import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { effectiveRole, ROLE_HOME } from '../../lib/roleAccess';
import { consumeAuthReturnPath } from '../../lib/authReturnPath';

export default function RoleRedirect() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const redirectStarted = useRef(false);

  useEffect(() => {
    if (isLoading || redirectStarted.current) return;
    redirectStarted.current = true;

    if (user) {
      const returnPath = consumeAuthReturnPath();
      if (returnPath) {
        navigate(returnPath, { replace: true });
        return;
      }

      // Customers land on the hub, not straight in the food tab: rides and
      // food are both offered from Home, so the hub is the real landing page.
      const role = effectiveRole(user.role, user.isVerified);
      navigate((role && ROLE_HOME[role]) || '/', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }, [user, isLoading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--muted)]">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-[var(--muted-foreground)] font-medium">Redirecting...</p>
      </div>
    </div>
  );
}
