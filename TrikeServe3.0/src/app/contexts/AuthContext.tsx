import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../../utils/supabase';

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
  restaurantId?: string;  // Added: Link to restaurant
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
  // Optional fields based on role
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

  // Initialize auth state from localStorage and create default admin
  useEffect(() => {
    const initializeAuth = async () => {
      // Create default admin accounts in Supabase if they don't exist
      try {
        // Check if admins exist in Supabase
        const { data: existingAdmins } = await supabase
          .from('admins')
          .select('email')
          .in('email', ['admin@gmail.com', 'admin1@gmail.com']);

        const existingEmails = (existingAdmins || []).map(a => a.email);

        // Create default admin 1 if doesn't exist
        if (!existingEmails.includes('admin@gmail.com')) {
          await supabase
            .from('admins')
            .insert([{
              email: 'admin@gmail.com',
              name: 'Business & Customer Admin',
              phone: '09171234567',
              admin_type: 'business_customer',
              password_hash: 'admin123', // In production, use proper hashing
              is_verified: true,
              created_at: new Date().toISOString(),
            }]);
        }

        // Create default admin 2 if doesn't exist
        if (!existingEmails.includes('admin1@gmail.com')) {
          await supabase
            .from('admins')
            .insert([{
              email: 'admin1@gmail.com',
              name: 'Rider Admin',
              phone: '09171234568',
              admin_type: 'rider',
              password_hash: 'admin123', // In production, use proper hashing
              is_verified: true,
              created_at: new Date().toISOString(),
            }]);
        }
      } catch (error) {
        console.error('Error initializing admin accounts in Supabase:', error);
      }

      // Load current user from localStorage
      const storedUser = localStorage.getItem('trikeserve_current_user');
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
        } catch (error) {
          console.error('Error parsing stored user:', error);
          localStorage.removeItem('trikeserve_current_user');
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // First, check if user is an admin
      const { data: adminUser, error: adminError } = await supabase
        .from('admins')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      if (adminUser && !adminError) {
        // Admin found in Supabase admins table
        if (adminUser.password_hash !== password) {
          return { success: false, error: 'Invalid email or password' };
        }

        // Map admin to user format
        const userToSet: User = {
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: 'admin',
          phone: adminUser.phone,
          isVerified: adminUser.is_verified,
          createdAt: adminUser.created_at,
          adminType: adminUser.admin_type,
        };

        setUser(userToSet);
        localStorage.setItem('trikeserve_current_user', JSON.stringify(userToSet));
        return { success: true };
      }

      // If not an admin, check regular users table
      const { data: supabaseUser, error: supabaseError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      let foundUser = supabaseUser;

      // If not found in Supabase, fallback to localStorage
      if (!foundUser || supabaseError) {
        const usersJson = localStorage.getItem('trikeserve_users');
        const users: (User & { password: string })[] = usersJson ? JSON.parse(usersJson) : [];
        const localUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());

        if (!localUser) {
          return { success: false, error: 'Invalid email or password' };
        }

        // Check password against localStorage
        if (localUser.password !== password) {
          return { success: false, error: 'Invalid email or password' };
        }

        foundUser = localUser;
      }

      if (!foundUser) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Check if user is verified
      const isVerified = 'is_verified' in foundUser ? foundUser.is_verified : foundUser.isVerified;
      if (!isVerified) {
        return {
          success: false, 
          error: 'Account pending verification. Please visit the TrikeServe office at Barangay Hall with your documents.' 
        };
      }

      // Map Supabase user to local user format if needed
      let userToSet: User = {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
        role: foundUser.role,
        phone: foundUser.phone,
        isVerified: isVerified,
        createdAt: foundUser.created_at || foundUser.createdAt,
        adminType: foundUser.admin_type || foundUser.adminType,
        todaPlate: foundUser.toda_plate || foundUser.todaPlate,
        licenseNumber: foundUser.license_number || foundUser.licenseNumber,
        businessName: foundUser.business_name || foundUser.businessName,
        businessAddress: foundUser.business_address || foundUser.businessAddress,
        restaurantId: foundUser.restaurant_id || foundUser.restaurantId,  // Added
        address: foundUser.address,
      };

      // For business users without restaurantId, fetch it from Supabase
      if (foundUser.role === 'business' && !userToSet.restaurantId) {
        console.log('[AuthContext] Business user has no restaurantId, fetching from Supabase...');

        try {
          // SECURITY: Fetch the restaurant record directly from Supabase
          // This ensures we get the CORRECT restaurant for this business user
          const { data: restaurantRecord } = await supabase
            .from('restaurants')
            .select('id')
            .eq('business_user_id', userToSet.id)
            .single();

          if (restaurantRecord) {
            userToSet.restaurantId = restaurantRecord.id;
            console.log('[AuthContext] Fetched restaurantId from Supabase:', restaurantRecord.id);
          } else {
            console.warn('[AuthContext] No restaurant found in Supabase for this business user');
            // The user will need to create a restaurant before they can place orders
          }
        } catch (error) {
          console.warn('[AuthContext] Error fetching restaurant from Supabase:', error);
          // Continue without restaurantId - it will be fetched later when needed
        }
      }


      // Store user in state and localStorage
      setUser(userToSet);
      localStorage.setItem('trikeserve_current_user', JSON.stringify(userToSet));

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An error occurred during login' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('trikeserve_current_user');
  };

  const signup = async (data: SignupData): Promise<{ success: boolean; error?: string }> => {
    try {
      // Check if email already exists in Supabase
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('email', data.email.toLowerCase())
        .single();

      if (existingUser) {
        return { success: false, error: 'Email already registered' };
      }

      // If error is not "no rows found", it's a real error
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking existing user:', checkError);
      }

      // Determine if user should be auto-verified
      const isAutoVerified = data.role === 'customer';

      // Create new user in Supabase
      const { data: newSupabaseUser, error: insertError } = await supabase
        .from('users')
        .insert([{
          email: data.email.toLowerCase(),
          name: data.name,
          phone: data.phone,
          role: data.role,
          is_verified: isAutoVerified,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // Role-specific fields
          ...(data.role === 'rider' && {
            toda_plate: data.todaPlate,
            license_number: data.licenseNumber,
          }),
          ...(data.role === 'business' && {
            business_name: data.businessName,
            business_address: data.businessAddress,
          }),
          ...(data.role === 'customer' && {
            address: data.address,
          }),
        }])
        .select()
        .single();

      if (insertError) {
        console.error('Error creating user in Supabase:', insertError);
        return { success: false, error: 'Failed to create account. Please try again.' };
      }

      // Also save to localStorage as fallback
      const usersJson = localStorage.getItem('trikeserve_users');
      const users: (User & { password: string })[] = usersJson ? JSON.parse(usersJson) : [];

      const newLocalUser: User & { password: string } = {
        id: newSupabaseUser?.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        email: data.email,
        name: data.name,
        phone: data.phone,
        role: data.role,
        password: data.password,
        isVerified: isAutoVerified,
        createdAt: new Date().toISOString(),
        ...(data.role === 'rider' && {
          todaPlate: data.todaPlate,
          licenseNumber: data.licenseNumber,
        }),
        ...(data.role === 'business' && {
          businessName: data.businessName,
          businessAddress: data.businessAddress,
        }),
        ...(data.role === 'customer' && {
          address: data.address,
        }),
      };

      users.push(newLocalUser);
      localStorage.setItem('trikeserve_users', JSON.stringify(users));

      // Initialize restaurant data for business users (localStorage)
      if (data.role === 'business') {
        const restaurantDataKey = `restaurantData_${data.email}`;
        const defaultRestaurantData = {
          name: data.businessName || "My Restaurant",
          subtitle: data.businessAddress || "Tagalag, Valenzuela",
          logo: "🍽️",
          heroImage: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800",
          deliveryTime: "25-35 min",
          deliveryFee: 35,
          rating: 0,
          ratingCount: 0,
          address: data.businessAddress || "",
          operatingHours: "8:00 AM - 10:00 PM"
        };
        localStorage.setItem(restaurantDataKey, JSON.stringify(defaultRestaurantData));
        
        // Initialize empty menu items array
        const menuItemsKey = `menuItems_${data.email}`;
        localStorage.setItem(menuItemsKey, JSON.stringify([]));
      }

      return { success: true };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: 'An error occurred during signup. Please try again.' };
    }
  };

  const updateProfile = async (data: Partial<User>): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!user) {
        return { success: false, error: 'No user logged in' };
      }

      // Update in Supabase
      const { error: updateError } = await supabase
        .from('users')
        .update({
          ...(data.name && { name: data.name }),
          ...(data.phone && { phone: data.phone }),
          ...(data.address && { address: data.address }),
          ...(data.todaPlate && { toda_plate: data.todaPlate }),
          ...(data.licenseNumber && { license_number: data.licenseNumber }),
          ...(data.businessName && { business_name: data.businessName }),
          ...(data.businessAddress && { business_address: data.businessAddress }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error updating profile in Supabase:', updateError);
        // Continue with localStorage update as fallback
      }

      // Also update localStorage as fallback
      const usersJson = localStorage.getItem('trikeserve_users');
      const users: (User & { password: string })[] = usersJson ? JSON.parse(usersJson) : [];

      // Find and update user
      const userIndex = users.findIndex(u => u.id === user.id);
      if (userIndex !== -1) {
        users[userIndex] = {
          ...users[userIndex],
          ...data,
          createdAt: users[userIndex].createdAt,
        };
        localStorage.setItem('trikeserve_users', JSON.stringify(users));
      }

      // Update current user in state
      const updatedUser: User = {
        ...user,
        ...data,
      };
      setUser(updatedUser);
      localStorage.setItem('trikeserve_current_user', JSON.stringify(updatedUser));

      return { success: true };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: 'An error occurred while updating profile' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, signup, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
