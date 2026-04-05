// Example: Updated AuthContext with Supabase Integration
// This file shows how to update your existing AuthContext to use Supabase

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, supabaseHelpers } from '@/lib/supabase';

export type UserRole = 'customer' | 'rider' | 'business' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string;
  isVerified: boolean;
  createdAt: string;
  // Admin specific
  adminType?: 'business_customer' | 'rider';
  // Rider specific
  todaPlate?: string;
  licenseNumber?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  // Business specific
  businessName?: string;
  businessAddress?: string;
  // Customer specific
  address?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  signup: (data: SignupData) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (data: Partial<User>) => Promise<{ success: boolean; error?: string }>;
}

interface SignupData {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: UserRole;
  todaPlate?: string;
  licenseNumber?: string;
  businessName?: string;
  businessAddress?: string;
  address?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from Supabase
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check if there's a stored user ID
        const storedUserId = localStorage.getItem('trikeserve_user_id');

        if (storedUserId) {
          // Fetch user from Supabase
          const { data: supabaseUser, error } = await supabaseHelpers.getUserById(storedUserId);

          if (error) {
            console.error('Error fetching user from Supabase:', error);
            localStorage.removeItem('trikeserve_user_id');
          } else if (supabaseUser) {
            setUser(mapSupabaseUserToLocalUser(supabaseUser));
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Get user from Supabase
      const { data: supabaseUser, error } = await supabaseHelpers.getUserByEmail(email);

      if (error || !supabaseUser) {
        return { success: false, error: 'Invalid email or password' };
      }

      // TODO: In production, verify password using Supabase Auth or a backend service
      // For now, we're using email-based lookup

      // Check if user is verified
      if (!supabaseUser.is_verified) {
        return {
          success: false,
          error: 'Account pending verification. Please visit the TrikeServe office at Barangay Hall with your documents.',
        };
      }

      // Map Supabase user to local user format
      const localUser = mapSupabaseUserToLocalUser(supabaseUser);

      // Store user in state and localStorage
      setUser(localUser);
      localStorage.setItem('trikeserve_user_id', supabaseUser.id);
      localStorage.setItem('trikeserve_current_user', JSON.stringify(localUser));

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An error occurred during login' };
    }
  };

  const signup = async (data: SignupData): Promise<{ success: boolean; error?: string }> => {
    try {
      // Check if email already exists
      const { data: existingUser, error: checkError } = await supabaseHelpers.getUserByEmail(data.email);

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 = no rows found (expected)
        console.error('Error checking for existing user:', checkError);
      }

      if (existingUser) {
        return { success: false, error: 'Email already registered' };
      }

      // Create new user in Supabase
      const { data: newUser, error } = await supabaseHelpers.createUser({
        email: data.email,
        name: data.name,
        phone: data.phone,
        role: data.role,
        is_verified: false, // Users start unverified
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        admin_type: data.role === 'admin' ? 'business_customer' : undefined,
        toda_plate: data.todaPlate,
        license_number: data.licenseNumber,
        business_name: data.businessName,
        business_address: data.businessAddress,
        address: data.address,
      });

      if (error) {
        console.error('Error creating user:', error);
        return { success: false, error: 'Failed to create account' };
      }

      return { success: true };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: 'An error occurred during signup' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('trikeserve_user_id');
    localStorage.removeItem('trikeserve_current_user');
  };

  const updateProfile = async (data: Partial<User>): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!user) {
        return { success: false, error: 'No user logged in' };
      }

      // Update user in Supabase
      const { error } = await supabaseHelpers.updateUser(user.id, {
        ...data,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error('Error updating profile:', error);
        return { success: false, error: 'Failed to update profile' };
      }

      // Update local user state
      const updatedUser = { ...user, ...data };
      setUser(updatedUser);
      localStorage.setItem('trikeserve_current_user', JSON.stringify(updatedUser));

      return { success: true };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: 'An error occurred' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        signup,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper function to map Supabase user format to local user format
function mapSupabaseUserToLocalUser(supabaseUser: any): User {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    name: supabaseUser.name,
    role: supabaseUser.role,
    phone: supabaseUser.phone,
    isVerified: supabaseUser.is_verified,
    createdAt: supabaseUser.created_at,
    adminType: supabaseUser.admin_type,
    todaPlate: supabaseUser.toda_plate,
    licenseNumber: supabaseUser.license_number,
    pickupLocation: supabaseUser.pickup_location,
    dropoffLocation: supabaseUser.dropoff_location,
    businessName: supabaseUser.business_name,
    businessAddress: supabaseUser.business_address,
    address: supabaseUser.address,
  };
}

