import { Navigate } from 'react-router';
import { useAuth, UserRole } from '../contexts/AuthContext';
import { effectiveRole, ROLE_HOME } from '../../lib/roleAccess';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--muted)]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[var(--muted-foreground)] font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  // An unapproved business or rider routes as a customer, so their own UI is
  // unreachable while the customer app stays available. Checking the effective
  // role rather than the stored one is what makes /business and /rider locked.
  const role = effectiveRole(user.role, user.isVerified);

  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    // Honor one-time redirect target after role switching (e.g., rider -> customer/food)
    const postSwitchRoute = localStorage.getItem('trikeserve_post_switch_route');
    if (postSwitchRoute && role && postSwitchRoute.startsWith(`/${role}`)) {
      localStorage.removeItem('trikeserve_post_switch_route');
      return <Navigate to={postSwitchRoute} replace />;
    }

    // Redirect to the home page for the role that actually has access, so a
    // pending business is sent to /customer instead of being bounced back
    // into the /business route that just refused it.
    return <Navigate to={(role && ROLE_HOME[role]) || '/'} replace />;
  }

  return <>{children}</>;
}
