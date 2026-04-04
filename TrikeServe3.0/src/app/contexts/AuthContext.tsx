import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
    // Create default admin accounts if they don't exist
    const usersJson = localStorage.getItem('trikeserve_users');
    const users: (User & { password: string })[] = usersJson ? JSON.parse(usersJson) : [];

    const admin1Exists = users.some(u => u.email === 'admin@gmail.com');
    const admin2Exists = users.some(u => u.email === 'admin1@gmail.com');

    if (!admin1Exists) {
      const defaultAdmin1: User & { password: string } = {
        id: 'admin_default_001',
        email: 'admin@gmail.com',
        name: 'Business & Customer Admin',
        role: 'admin',
        adminType: 'business_customer',
        phone: '09171234567',
        password: 'admin123',
        isVerified: true,
        createdAt: new Date().toISOString(),
      };
      users.push(defaultAdmin1);
    }

    if (!admin2Exists) {
      const defaultAdmin2: User & { password: string } = {
        id: 'admin_default_002',
        email: 'admin1@gmail.com',
        name: 'Rider Admin',
        role: 'admin',
        adminType: 'rider',
        phone: '09171234568',
        password: 'admin123',
        isVerified: true,
        createdAt: new Date().toISOString(),
      };
      users.push(defaultAdmin2);
    }

    localStorage.setItem('trikeserve_users', JSON.stringify(users));

    // Load current user
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
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Get all users from localStorage
      const usersJson = localStorage.getItem('trikeserve_users');
      const users: (User & { password: string })[] = usersJson ? JSON.parse(usersJson) : [];

      // Find user by email
      const foundUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());

      if (!foundUser) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Check password
      if (foundUser.password !== password) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Check if user is verified
      if (!foundUser.isVerified) {
        return { 
          success: false, 
          error: 'Account pending verification. Please visit the TrikeServe office at Barangay Hall with your documents.' 
        };
      }

      // Remove password from user object before storing
      const { password: _, ...userWithoutPassword } = foundUser;

      // Store user in state and localStorage
      setUser(userWithoutPassword);
      localStorage.setItem('trikeserve_current_user', JSON.stringify(userWithoutPassword));

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
      // Get existing users
      const usersJson = localStorage.getItem('trikeserve_users');
      const users: (User & { password: string })[] = usersJson ? JSON.parse(usersJson) : [];

      // Check if email already exists
      if (users.some(u => u.email.toLowerCase() === data.email.toLowerCase())) {
        return { success: false, error: 'Email already registered' };
      }

      // Determine if user should be auto-verified
      // Customers are automatically verified, others need admin approval
      const isAutoVerified = data.role === 'customer';

      // Create new user
      const newUser: User & { password: string } = {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        email: data.email,
        name: data.name,
        phone: data.phone,
        role: data.role,
        password: data.password,
        isVerified: isAutoVerified, // Customer auto-verified, rider/business need approval
        createdAt: new Date().toISOString(),
        // Add role-specific fields
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

      // Save to users array
      users.push(newUser);
      localStorage.setItem('trikeserve_users', JSON.stringify(users));

      // Initialize restaurant data for business users
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
      return { success: false, error: 'An error occurred during registration' };
    }
  };

  const updateProfile = async (data: Partial<User>): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!user) {
        return { success: false, error: 'No user logged in' };
      }

      // Get all users
      const usersJson = localStorage.getItem('trikeserve_users');
      const users: (User & { password: string })[] = usersJson ? JSON.parse(usersJson) : [];

      // Find and update user
      const userIndex = users.findIndex(u => u.id === user.id);
      if (userIndex === -1) {
        return { success: false, error: 'User not found' };
      }

      // Update user data
      const updatedUser = {
        ...users[userIndex],
        ...data,
        id: users[userIndex].id, // Prevent ID change
        email: users[userIndex].email, // Prevent email change
        role: users[userIndex].role, // Prevent role change
      };

      users[userIndex] = updatedUser;
      localStorage.setItem('trikeserve_users', JSON.stringify(users));

      // Update current user state
      const { password: _, ...userWithoutPassword } = updatedUser;
      setUser(userWithoutPassword);
      localStorage.setItem('trikeserve_current_user', JSON.stringify(userWithoutPassword));

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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}