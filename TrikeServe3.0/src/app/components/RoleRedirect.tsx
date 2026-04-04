import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';

export default function RoleRedirect() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        // Redirect based on role
        const roleRoutes = {
          customer: '/customer/food',
          rider: '/rider',
          business: '/business',
          admin: '/admin',
        };
        navigate(roleRoutes[user.role], { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [user, isLoading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-[#E11D48] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-[#64748B] font-medium">Redirecting...</p>
      </div>
    </div>
  );
}