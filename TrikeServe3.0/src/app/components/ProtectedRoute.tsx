import { Navigate } from 'react-router';
import { useAuth, UserRole } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#E11D48] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#64748B] font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Honor one-time redirect target after role switching (e.g., rider -> customer/food)
    const postSwitchRoute = localStorage.getItem('trikeserve_post_switch_route');
    if (postSwitchRoute && postSwitchRoute.startsWith(`/${user.role}`)) {
      localStorage.removeItem('trikeserve_post_switch_route');
      return <Navigate to={postSwitchRoute} replace />;
    }

    // Redirect to appropriate dashboard based on user role
    const roleRoutes: Record<UserRole, string> = {
      customer: '/customer',
      rider: '/rider',
      business: '/business',
      admin: '/admin',
    };
    return <Navigate to={roleRoutes[user.role]} replace />;
  }

  return <>{children}</>;
}
